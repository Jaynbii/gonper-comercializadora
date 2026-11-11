'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Loader2,
  Plus,
  ScanText,
  Trash2,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Badge } from '@/components/EstadoBadge'
import {
  obtenerUrlParaOCR,
  guardarItemsEnOrden,
  registrarProductoEnInventario,
} from './actions'
import { procesarTextoOrden, obtenerCatalogoProductos } from './procesarTexto'
import { extraerItemsConGemini } from './extraerConGemini'
import { extraerTextoDelPDF } from './procesarPdf'
import * as pdfjsLib from 'pdfjs-dist'
import Tesseract from 'tesseract.js'
import { parseRequisicion } from '@/utils/requisicion'
import {
  vincularItems,
  buscarCandidatos,
  limpiarParaBusqueda,
  tokenizarNombre,
  type CandidatoProducto,
  type ProductoCatalogo,
} from '@/utils/vincularProductos'
import { normalizarUnidad, UNIDADES_COMUNES } from '@/utils/unidades'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

type Sugerencia = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
}

type ItemDetectado = {
  key: string
  codigo_pdf: string
  cantidad: string
  unidad: string
  descripcion_pdf: string
  existe_en_bd: boolean
  id_bd: string | null
  sugerencia: Sugerencia | null
}

// El nombre del archivo es único, así que la lectura se puede reutilizar
// mientras el usuario esté en la misma sesión del navegador.
const cacheTexto = new Map<string, string>()

// Tesseract pierde filas en fotos pequeñas (por ejemplo, una imagen de
// WhatsApp de 1080 px). Se escala a ~2200 px y se realza el contraste.
const ANCHO_OBJETIVO_OCR = 2200
const ESCALA_MAXIMA_OCR = 3
const ESCALA_MINIMA_OCR = 0.5

function mensajeDeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function realzarParaOcr(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
) {
  const imagen = ctx.getImageData(0, 0, ancho, alto)
  const datos = imagen.data
  const grises = new Uint8ClampedArray(ancho * alto)

  for (let i = 0, pixel = 0; i < datos.length; i += 4, pixel++) {
    const gris = 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2]
    grises[pixel] = (gris - 128) * 1.35 + 128
  }

  // Máscara de enfoque 3x3: recupera los bordes que se pierden al escalar.
  for (let y = 0; y < alto; y++) {
    const arriba = (y > 0 ? y - 1 : y) * ancho
    const abajo = (y < alto - 1 ? y + 1 : y) * ancho
    const fila = y * ancho

    for (let x = 0; x < ancho; x++) {
      const centro = fila + x
      const valor =
        5 * grises[centro] -
        grises[arriba + x] -
        grises[abajo + x] -
        grises[fila + (x > 0 ? x - 1 : x)] -
        grises[fila + (x < ancho - 1 ? x + 1 : x)]
      const destino = centro * 4
      const gris = Math.max(0, Math.min(255, valor))

      datos[destino] = gris
      datos[destino + 1] = gris
      datos[destino + 2] = gris
      datos[destino + 3] = 255
    }
  }

  ctx.putImageData(imagen, 0, 0)
}

async function prepararImagenParaOcr(fileUrl: string) {
  const respuesta = await fetch(fileUrl)
  if (!respuesta.ok) throw new Error('No se pudo descargar la imagen.')

  const bitmap = await createImageBitmap(await respuesta.blob())

  try {
    const escala = Math.min(
      ESCALA_MAXIMA_OCR,
      Math.max(ESCALA_MINIMA_OCR, ANCHO_OBJETIVO_OCR / bitmap.width),
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo preparar la imagen para OCR.')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    realzarParaOcr(ctx, canvas.width, canvas.height)

    return canvas
  } finally {
    bitmap.close()
  }
}

// Nombre de un candidato con las palabras que coinciden con lo escrito
// en negrita: así se ve letra por letra qué comparó el cotejo, en vez
// de una sola sugerencia que aparece o no aparece sin explicar por qué.
function NombreConCoincidencias({
  nombre,
  texto,
}: {
  nombre: string
  texto: string
}) {
  const tokens = tokenizarNombre(limpiarParaBusqueda(texto))
  return (
    <>
      {nombre.split(/(\s+)/).map((parte, i) => {
        const limpio = limpiarParaBusqueda(parte)
        const coincide =
          limpio.length >= 2 &&
          tokens.some(
            (token) =>
              token.length >= 2 &&
              (limpio.startsWith(token) || token.startsWith(limpio)),
          )
        return coincide ? (
          <strong key={i} className="font-semibold text-gonper-primary">
            {parte}
          </strong>
        ) : (
          <span key={i}>{parte}</span>
        )
      })}
    </>
  )
}

// Lista de productos del inventario que van coincidiendo con lo que el
// usuario escribe en la descripción. Va en flujo (no flotante) para
// que no la recorte la tabla en escritorio ni se despegue al hacer
// scroll en el teléfono: la fila crece y la lista queda debajo del
// campo. Elegir un candidato vincula la fila a ese producto del
// inventario, igual que hacía el botón "Usar" de la sugerencia única.
function ListaCandidatos({
  candidatos,
  resaltado,
  texto,
  onElegir,
  onResaltar,
}: {
  candidatos: CandidatoProducto[]
  resaltado: number
  texto: string
  onElegir: (candidato: CandidatoProducto) => void
  onResaltar: (indice: number) => void
}) {
  return (
    <div
      role="listbox"
      aria-label="Productos del inventario que coinciden"
      className="mt-1 overflow-hidden rounded-md border border-gonper-border bg-white"
    >
      {candidatos.length === 0 ? (
        <p className="px-2.5 py-2 text-[12px] leading-snug text-gonper-muted">
          Sin coincidencias en tu inventario — si lo confirmas así, se
          registrará como producto nuevo.
        </p>
      ) : (
        <ul className="max-h-56 divide-y divide-gonper-border overflow-y-auto">
          {candidatos.map((candidato, i) => (
            <li key={candidato.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === resaltado}
                onMouseDown={(e) => {
                  // onMouseDown antes que el blur del campo: si se
                  // esperara al click, el campo ya habría cerrado la
                  // lista y el toque no llegaría al candidato.
                  e.preventDefault()
                  onElegir(candidato)
                }}
                onMouseEnter={() => onResaltar(i)}
                className={`flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left ${
                  i === resaltado ? 'bg-gonper-primary/[0.06]' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-snug text-gonper-text">
                    <NombreConCoincidencias
                      nombre={candidato.nombre}
                      texto={texto}
                    />
                  </span>
                  <span className="block text-[11px] text-gonper-muted">
                    {candidato.sku}
                    {candidato.unidad_medida
                      ? ` · ${candidato.unidad_medida}`
                      : ''}
                  </span>
                </span>
                <span className="mt-0.5 shrink-0 rounded-full bg-gonper-bg px-1.5 py-0.5 text-[11px] font-semibold text-gonper-primary">
                  {candidato.similitud}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ProcesarPdfButton({
  ordenId,
  pdfPath,
  grande = false,
}: {
  ordenId: string
  pdfPath: string
  // Variante grande: botón a todo lo ancho para la tarjeta de
  // "siguiente paso" (después de subir el archivo). Un usuario nuevo
  // no debe tener que buscar qué hacer: la acción principal tiene
  // que ser lo primero que ve el ojo.
  grande?: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [itemsDetectados, setItemsDetectados] = useState<ItemDetectado[] | null>(
    null,
  )
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [guardandoInventario, setGuardandoInventario] = useState<string | null>(
    null,
  )
  const [errorProceso, setErrorProceso] = useState('')
  const [errorRevision, setErrorRevision] = useState('')
  // Con qué se leyó el archivo actual: la IA (Gemini) o el OCR de
  // respaldo. Se muestra en el modal para que la prueba piloto se
  // pueda juzgar sin depender del mensaje transitorio de estado.
  const [metodoLectura, setMetodoLectura] = useState<'ia' | 'ocr' | null>(null)

  const router = useRouter()
  const contadorFilas = useRef(0)
  const etiquetaOcr = useRef('Analizando imagen')

  // Re-cotejo al editar la descripción: el catálogo se carga una sola
  // vez y se guarda en caché; el ref espeja las filas para no aplicar
  // un cotejo que ya quedó viejo. Los temporizadores son POR FILA: con
  // uno solo compartido, escribir en una fila cancelaba el cotejo de
  // la anterior y la sugerencia nunca llegaba (por eso "no funciona").
  const catalogoRef = useRef<ProductoCatalogo[] | null>(null)
  const temporizadoresRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const itemsDetectadosRef = useRef<ItemDetectado[] | null>(null)

  // Combobox: la fila que está mostrando sus candidatos del inventario
  // y cuál va resaltado para elegirlo con el teclado.
  const [combobox, setCombobox] = useState<{
    key: string
    candidatos: CandidatoProducto[]
    resaltado: number
  } | null>(null)

  useEffect(() => {
    itemsDetectadosRef.current = itemsDetectados
  }, [itemsDetectados])

  // Si el modal se cierra con cotejos pendientes, no se aplican.
  useEffect(
    () => () => {
      for (const temporizador of temporizadoresRef.current.values()) {
        clearTimeout(temporizador)
      }
      temporizadoresRef.current.clear()
    },
    [],
  )

  const nuevaLlave = () => `fila-${contadorFilas.current++}`

  /**
   * Un solo trabajador para todas las páginas: además de ser más rápido que
   * crear uno por página, permite conservar los espacios entre columnas.
   */
  const crearTrabajadorOcr = async () => {
    const worker = await Tesseract.createWorker('spa', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setStatusMsg(`${etiquetaOcr.current}: ${Math.round(m.progress * 100)}%`)
        }
      },
    })

    await worker.setParameters({ preserve_interword_spaces: '1' })
    return worker
  }

  const leerPdfConOcr = async (fileUrl: string) => {
    let textoCompleto = ''
    const loadingTask = pdfjsLib.getDocument({ url: fileUrl })
    const pdf = await loadingTask.promise
    const worker = await crearTrabajadorOcr()

    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 2.0 })
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width

        await page.render({ canvas, viewport }).promise
        etiquetaOcr.current = `Analizando página ${i} de ${pdf.numPages}`
        setStatusMsg(`${etiquetaOcr.current}...`)

        const {
          data: { text },
        } = await worker.recognize(canvas)
        textoCompleto += text + '\n'
      }
    } finally {
      await worker.terminate()
    }

    return textoCompleto
  }

  const leerImagenConOcr = async (fileUrl: string) => {
    const canvas = await prepararImagenParaOcr(fileUrl)
    etiquetaOcr.current = 'Analizando fotografía'
    setStatusMsg(`${etiquetaOcr.current}...`)

    const worker = await crearTrabajadorOcr()

    try {
      const {
        data: { text },
      } = await worker.recognize(canvas)
      return text
    } finally {
      await worker.terminate()
    }
  }

  const handleProcesar = async () => {
    setIsLoading(true)
    setStatusMsg('Iniciando lectura...')
    setErrorProceso('')
    setErrorRevision('')
    setItemsDetectados(null)
    setMetodoLectura(null)

    try {
      let textoCompleto = cacheTexto.get(pdfPath) ?? ''
      let resultadoIa: Awaited<
        ReturnType<typeof procesarTextoOrden>
      > | null = null

      if (!textoCompleto) {
        const esPDF = pdfPath.toLowerCase().endsWith('.pdf')

        if (esPDF) {
          setStatusMsg('Buscando texto en el PDF...')
          const extraido = await extraerTextoDelPDF(pdfPath)

          // Si el PDF tiene capa de texto y el parser reconoce filas, no se
          // pasa por Tesseract. Los PDFs escaneados caen al OCR.
          if (
            extraido.success &&
            parseRequisicion(extraido.textoExtraido).items.length > 0
          ) {
            textoCompleto = extraido.textoExtraido
          } else {
            setMetodoLectura('ocr')
            const fileUrl = await obtenerUrlParaOCR(pdfPath)
            textoCompleto = await leerPdfConOcr(fileUrl)
          }
        } else {
          // Foto: primero la lee Gemini (si está configurada) y el
          // resultado ya viene cotejado con el catálogo; si la IA no
          // está disponible o no lee nada, se sigue con Tesseract
          // como siempre. El resultado de la IA se cachea igual que
          // el texto para no volver a llamarla en la misma sesión.
          const cacheIa = cacheTexto.get(`ia:${pdfPath}`)
          if (cacheIa) {
            try {
              const previo = JSON.parse(cacheIa) as Awaited<
                ReturnType<typeof procesarTextoOrden>
              >
              if (previo.items.length > 0) {
                resultadoIa = previo
                setMetodoLectura('ia')
              }
            } catch {
              resultadoIa = null
            }
          }

          if (!resultadoIa) {
            setStatusMsg('Leyendo la foto con IA...')
            const conIa = await extraerItemsConGemini(pdfPath).catch(
              () => null,
            )
            if (conIa && conIa.items.length > 0) {
              resultadoIa = conIa
              cacheTexto.set(`ia:${pdfPath}`, JSON.stringify(conIa))
              setMetodoLectura('ia')
            } else {
              setMetodoLectura('ocr')
              const fileUrl = await obtenerUrlParaOCR(pdfPath)
              textoCompleto = await leerImagenConOcr(fileUrl)
            }
          }
        }

        if (textoCompleto.trim()) cacheTexto.set(pdfPath, textoCompleto)
      }

      let result = resultadoIa
      if (!result) {
        setStatusMsg('Cotejando con el catálogo...')
        result = await procesarTextoOrden(textoCompleto)
      }

      const detectados: ItemDetectado[] = result.items.map((item) => ({
        key: nuevaLlave(),
        codigo_pdf: item.codigo_pdf,
        cantidad: String(item.cantidad),
        unidad: item.unidad,
        descripcion_pdf: item.descripcion_pdf,
        existe_en_bd: item.existe_en_bd,
        id_bd: item.id_bd,
        sugerencia: item.sugerencia,
      }))

      if (detectados.length === 0) {
        setErrorProceso(
          'No se detectaron productos válidos en el archivo. Revisa que la foto sea legible.',
        )
        return
      }

      setItemsDetectados(detectados)
      setSeleccionados(
        new Set(
          detectados.filter((item) => item.existe_en_bd).map((item) => item.key),
        ),
      )
    } catch (error) {
      console.error(error)
      setErrorProceso('Error al procesar: ' + mensajeDeError(error))
    } finally {
      setIsLoading(false)
      setStatusMsg('')
    }
  }

  const actualizarItem = (key: string, cambios: Partial<ItemDetectado>) => {
    setItemsDetectados((prev) =>
      prev
        ? prev.map((item) => {
            if (item.key !== key) return item

            const actualizado = { ...item, ...cambios }

            // Al cambiar el código, la fila deja de apuntar al producto anterior.
            if (
              cambios.codigo_pdf !== undefined &&
              cambios.codigo_pdf !== item.codigo_pdf
            ) {
              actualizado.id_bd = null
              actualizado.existe_en_bd = false
              actualizado.sugerencia = null
            }

            return actualizado
          })
        : null,
    )
  }

  // El cotejo contra el catálogo solo corría al leer el archivo: si el
  // usuario corregía el nombre a mano en el modal, la fila se quedaba
  // como "Registrar" aunque el nombre corregido sí existiera. Al editar
  // la descripción se vuelve a cotejar por nombre con el mismo
  // mecanismo (vincularItems) que usa la lectura inicial. El texto que
  // escribió el usuario no se toca: solo cambia el vínculo (y con él
  // el código corregido, la unidad del catálogo y la sugerencia); la
  // descripción del catálogo se adopta con el botón "Usar" de la
  // sugerencia, como siempre.
  const reCotejarDescripcion = async (
    key: string,
    descripcion: string,
    codigoPdf: string,
    unidad: string,
  ) => {
    const nombre = descripcion.trim()

    if (nombre.length === 0) {
      // Sin nombre no hay nada que cotejar: la fila deja de apuntar
      // al producto anterior.
      setItemsDetectados((prev) =>
        prev
          ? prev.map((fila) =>
              fila.key === key
                ? { ...fila, existe_en_bd: false, id_bd: null, sugerencia: null }
                : fila,
            )
          : null,
      )
      setSeleccionados((prev) => {
        const nuevos = new Set(prev)
        nuevos.delete(key)
        return nuevos
      })
      return
    }
    if (nombre.length < 3) return

    try {
      if (!catalogoRef.current) {
        catalogoRef.current = await obtenerCatalogoProductos()
      }
      const [resultado] = vincularItems(
        [
          {
            codigo_pdf: codigoPdf,
            cantidad: 1,
            unidad,
            descripcion_pdf: nombre,
          },
        ],
        catalogoRef.current,
      )
      if (!resultado) return

      // El cotejo es asíncrono (la primera vez trae el catálogo): si
      // el usuario siguió escribiendo o la fila ya no existe, el
      // resultado ya no corresponde y no se aplica.
      const filaActual = itemsDetectadosRef.current?.find(
        (fila) => fila.key === key,
      )
      if (!filaActual || filaActual.descripcion_pdf.trim() !== nombre) return

      setItemsDetectados((prev) =>
        prev
          ? prev.map((fila) =>
              fila.key === key &&
              fila.descripcion_pdf.trim() === nombre
                ? {
                    ...fila,
                    codigo_pdf: resultado.codigo_pdf,
                    unidad: resultado.unidad,
                    existe_en_bd: resultado.existe_en_bd,
                    id_bd: resultado.id_bd,
                    sugerencia: resultado.sugerencia,
                  }
                : fila,
            )
          : null,
      )
      setSeleccionados((prev) => {
        const nuevos = new Set(prev)
        if (resultado.existe_en_bd) nuevos.add(key)
        else nuevos.delete(key)
        return nuevos
      })
    } catch (error) {
      // El cotejo es una ayuda, no un bloqueo: si el catálogo no se
      // pudo cargar, la fila se queda como estaba y se puede registrar
      // a mano.
      console.error('No se pudo cotejar la descripción:', error)
    }
  }

  // Al escribir se espera a que el usuario pare (500 ms) para no
  // cotejar en cada tecla; al salir del campo se coteja de inmediato.
  // Temporizador por fila: uno compartido cancelaba el cotejo de la
  // fila anterior al escribir en otra.
  const programarCotejo = (
    key: string,
    descripcion: string,
    codigoPdf: string,
    unidad: string,
  ) => {
    const anterior = temporizadoresRef.current.get(`${key}:cotejo`)
    if (anterior) clearTimeout(anterior)
    temporizadoresRef.current.set(
      `${key}:cotejo`,
      setTimeout(() => {
        void reCotejarDescripcion(key, descripcion, codigoPdf, unidad)
      }, 500),
    )
  }

  const cotejarAhora = (
    key: string,
    descripcion: string,
    codigoPdf: string,
    unidad: string,
  ) => {
    const anterior = temporizadoresRef.current.get(`${key}:cotejo`)
    if (anterior) {
      clearTimeout(anterior)
      temporizadoresRef.current.delete(`${key}:cotejo`)
    }
    void reCotejarDescripcion(key, descripcion, codigoPdf, unidad)
  }

  // Combobox: al escribir se comparan las letras contra el inventario
  // y se muestra la lista de candidatos con su parecido, para elegir
  // uno con un toque. Con menos de 2 letras no hay nada que comparar.
  const abrirCombobox = async (key: string, descripcion: string) => {
    const texto = descripcion.trim()
    if (texto.length < 2) {
      setCombobox((prev) => (prev?.key === key ? null : prev))
      return
    }
    try {
      if (!catalogoRef.current) {
        catalogoRef.current = await obtenerCatalogoProductos()
      }
      const candidatos = buscarCandidatos(texto, catalogoRef.current, 5)
      // Si el usuario ya escribió otra cosa, esta lista quedó vieja.
      const filaActual = itemsDetectadosRef.current?.find(
        (fila) => fila.key === key,
      )
      if (!filaActual || filaActual.descripcion_pdf.trim() !== texto) return
      setCombobox({ key, candidatos, resaltado: 0 })
    } catch (error) {
      // Sin catálogo no hay lista; el cotejo de fondo sigue como antes.
      console.error('No se pudo cargar el catálogo para el combobox:', error)
    }
  }

  const programarCombobox = (key: string, descripcion: string) => {
    const anterior = temporizadoresRef.current.get(`${key}:combobox`)
    if (anterior) clearTimeout(anterior)
    temporizadoresRef.current.set(
      `${key}:combobox`,
      setTimeout(() => {
        void abrirCombobox(key, descripcion)
      }, 250),
    )
  }

  const cerrarCombobox = (key: string) => {
    // Con un poco de espera para que el toque en un candidato llegue
    // antes de que la lista se cierre al salir del campo.
    setTimeout(() => {
      setCombobox((prev) => (prev?.key === key ? null : prev))
    }, 150)
  }

  const actualizarDescripcion = (item: ItemDetectado, descripcion: string) => {
    actualizarItem(item.key, { descripcion_pdf: descripcion })
    programarCotejo(item.key, descripcion, item.codigo_pdf, item.unidad)
    programarCombobox(item.key, descripcion)
  }

  // Elegir un candidato del combobox vincula la fila a ese producto
  // del inventario: nombre, código, unidad y estado, igual que hacía
  // el botón "Usar" de la sugerencia única.
  const aplicarCandidato = (
    item: ItemDetectado,
    candidato: CandidatoProducto,
  ) => {
    setItemsDetectados((prev) =>
      prev
        ? prev.map((fila) =>
            fila.key === item.key
              ? {
                  ...fila,
                  codigo_pdf: candidato.sku,
                  descripcion_pdf: candidato.nombre,
                  unidad:
                    normalizarUnidad(candidato.unidad_medida) || fila.unidad,
                  existe_en_bd: true,
                  id_bd: candidato.id,
                  sugerencia: null,
                }
              : fila,
          )
        : null,
    )
    setSeleccionados((prev) => new Set(prev).add(item.key))
    setCombobox(null)
  }

  // Teclado dentro del combobox: bajar/subir con las flechas, elegir
  // con Enter, cerrar con Escape.
  const teclaEnCombobox = (
    e: React.KeyboardEvent<HTMLInputElement>,
    item: ItemDetectado,
  ) => {
    if (!combobox || combobox.key !== item.key) return
    if (e.key === 'ArrowDown' && combobox.candidatos.length > 0) {
      e.preventDefault()
      setCombobox((prev) =>
        prev
          ? {
              ...prev,
              resaltado: Math.min(
                prev.resaltado + 1,
                prev.candidatos.length - 1,
              ),
            }
          : prev,
      )
    } else if (e.key === 'ArrowUp' && combobox.candidatos.length > 0) {
      e.preventDefault()
      setCombobox((prev) =>
        prev ? { ...prev, resaltado: Math.max(prev.resaltado - 1, 0) } : prev,
      )
    } else if (e.key === 'Enter' && combobox.candidatos.length > 0) {
      e.preventDefault()
      aplicarCandidato(item, combobox.candidatos[combobox.resaltado])
    } else if (e.key === 'Escape') {
      setCombobox(null)
    }
  }

  const toggleSeleccion = (key: string) => {
    setSeleccionados((prev) => {
      const nuevos = new Set(prev)
      if (nuevos.has(key)) nuevos.delete(key)
      else nuevos.add(key)
      return nuevos
    })
  }

  const toggleTodos = () => {
    if (!itemsDetectados) return
    if (seleccionados.size === itemsDetectados.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(itemsDetectados.map((item) => item.key)))
    }
  }

  const handleRegistrarEnInventario = async (key: string) => {
    const item = itemsDetectados?.find((fila) => fila.key === key)
    if (!item) return

    setErrorRevision('')

    if (!item.codigo_pdf.trim() || !item.descripcion_pdf.trim()) {
      setErrorRevision(
        'Completa el código y la descripción antes de registrar el producto.',
      )
      return
    }

    setGuardandoInventario(key)
    try {
      const producto = await registrarProductoEnInventario(item)

      setItemsDetectados((prev) =>
        prev
          ? prev.map((fila) =>
              fila.key === key
                ? {
                    ...fila,
                    existe_en_bd: true,
                    id_bd: producto.id,
                    unidad:
                      normalizarUnidad(producto.unidad_medida) ||
                      normalizarUnidad(fila.unidad) ||
                      '',
                  }
                : fila,
            )
          : null,
      )

      setSeleccionados((prev) => new Set(prev).add(key))
    } catch (error) {
      setErrorRevision('Error al registrar producto: ' + mensajeDeError(error))
    } finally {
      setGuardandoInventario(null)
    }
  }

  const agregarFila = (descripcion = '') => {
    const nueva: ItemDetectado = {
      key: nuevaLlave(),
      codigo_pdf: '',
      cantidad: '1',
      unidad: '',
      descripcion_pdf: descripcion,
      existe_en_bd: false,
      id_bd: null,
      sugerencia: null,
    }

    setItemsDetectados((prev) => [...(prev ?? []), nueva])
    setSeleccionados((prev) => new Set(prev).add(nueva.key))
  }

  const eliminarFila = (key: string) => {
    setItemsDetectados((prev) => prev?.filter((item) => item.key !== key) ?? null)
    setSeleccionados((prev) => {
      const nuevos = new Set(prev)
      nuevos.delete(key)
      return nuevos
    })
  }

  const handleConfirmar = async () => {
    if (!itemsDetectados) return
    setErrorRevision('')

    const itemsParaGuardar = itemsDetectados.filter((item) =>
      seleccionados.has(item.key),
    )

    if (itemsParaGuardar.length === 0) {
      setErrorRevision('No has seleccionado ningún artículo para agregar a la requisición.')
      return
    }

    const sinRegistrar = itemsParaGuardar.filter((item) => !item.id_bd)
    if (sinRegistrar.length > 0) {
      setErrorRevision(
        'Primero registra en inventario: ' +
          sinRegistrar
            .map((item) => item.descripcion_pdf || item.codigo_pdf)
            .join(', '),
      )
      return
    }

    setIsSaving(true)
    try {
      await guardarItemsEnOrden(ordenId, itemsParaGuardar)
      setItemsDetectados(null)
      // No dejar al usuario en la lista sin saber qué sigue: llevarlo
      // al detalle de la requisición, donde ve el cotejo y puede
      // surtir o ir a Compras por lo que falta. El detalle mismo,
      // con los artículos ya listados, es la confirmación.
      // ?guardado=1 muestra arriba del detalle un aviso de que los
      // artículos quedaron guardados, para que no parezca que "no
      // pasó nada" al confirmar.
      router.push(`/ordenes/${ordenId}?guardado=1`)
    } catch (error) {
      setErrorRevision(mensajeDeError(error))
    } finally {
      setIsSaving(false)
    }
  }

  const todosSeleccionados =
    !!itemsDetectados &&
    itemsDetectados.length > 0 &&
    seleccionados.size === itemsDetectados.length

  // Artículos nuevos: no están en el inventario y hay que tocar
  // "Registrar" en cada uno antes de poder confirmar. El conteo se
  // recalcula solo cada vez que se registra uno.
  const nuevosSinRegistrar = itemsDetectados
    ? itemsDetectados.filter((item) => !item.existe_en_bd).length
    : 0

  return (
    <>
      <div
        className={
          grande ? 'flex flex-col gap-1.5' : 'flex flex-col items-end gap-1'
        }
      >
        <button
          type="button"
          onClick={handleProcesar}
          disabled={isLoading || isSaving}
          className={
            grande
              ? 'btn btn-primary min-h-12 w-full text-[14px]'
              : 'btn btn-primary px-3 text-[12px]'
          }
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <ScanText className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {isLoading ? 'Leyendo…' : 'Leer archivo'}
        </button>
        {statusMsg && (
          <span
            aria-live="polite"
            className={
              grande
                ? 'text-[12.5px] leading-snug text-gonper-muted'
                : 'max-w-[16rem] text-right text-[11px] leading-snug text-gonper-muted'
            }
          >
            {statusMsg}
          </span>
        )}
        {errorProceso && (
          <span
            role="alert"
            className={
              grande
                ? 'text-[12.5px] leading-snug text-gonper-danger'
                : 'max-w-[18rem] text-right text-[11px] leading-snug text-gonper-danger'
            }
          >
            {errorProceso}
          </span>
        )}
      </div>

      <Modal
        open={itemsDetectados !== null}
        onClose={() => {
          if (isSaving) return
          setItemsDetectados(null)
          setErrorRevision('')
        }}
        title="Revisa los artículos"
        description="Esto es lo que leímos del archivo. Revisa que los nombres y las cantidades estén bien antes de confirmar."
        size="wide"
        footer={
          <>
            <p className="mr-auto w-full text-[12px] text-gonper-muted sm:w-auto">
              {seleccionados.size === 0 ? (
                // El botón de confirmar está deshabilitado sin selección:
                // decir por qué, en vez de dejarlo muerto sin explicación.
                'Marca al menos un artículo para continuar.'
              ) : (
                <>
                  <span className="font-semibold text-gonper-text">
                    {seleccionados.size}
                  </span>{' '}
                  {seleccionados.size === 1
                    ? 'artículo seleccionado'
                    : 'artículos seleccionados'}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                if (isSaving) return
                setItemsDetectados(null)
                setErrorRevision('')
              }}
              disabled={isSaving}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmar}
              disabled={
                isSaving ||
                seleccionados.size === 0 ||
                guardandoInventario !== null
              }
              className="btn btn-primary flex-1 sm:flex-none"
            >
              {isSaving ? 'Guardando…' : 'Confirmar y agregar'}
            </button>
          </>
        }
      >
        <div className="px-4 py-4 sm:px-5">
          <datalist id="unidades-comunes">
            {UNIDADES_COMUNES.map((unidad) => (
              <option key={unidad} value={unidad} />
            ))}
          </datalist>

          {/* De dónde salió la lectura: con la IA o con el OCR de
              respaldo. Queda visible en el modal (no solo en el
              mensaje transitorio de estado) para poder comparar. */}
          {metodoLectura && (
            <p className="mb-2 text-[12px] font-medium text-gonper-muted">
              {metodoLectura === 'ia' ? 'Leído con IA' : 'Leído con OCR'}
            </p>
          )}

          {/* Resumen en palabras simples de lo que falta para poder
              confirmar. Sin esto, un usuario nuevo ve filas atenuadas,
              un botón de confirmar deshabilitado y no sabe por qué. */}
          {itemsDetectados && itemsDetectados.length > 0 && (
            <p
              className={`mb-3 rounded-md border px-3 py-2 text-[12.5px] leading-relaxed ${
                nuevosSinRegistrar > 0
                  ? 'border-gonper-warning-border bg-gonper-warning-bg text-gonper-warning'
                  : 'border-gonper-success-border bg-gonper-success-bg text-gonper-success'
              }`}
            >
              {nuevosSinRegistrar > 0 ? (
                <>
                  <span className="font-semibold">
                    {nuevosSinRegistrar} de {itemsDetectados.length}{' '}
                    {itemsDetectados.length === 1 ? 'artículo es nuevo' : 'artículos son nuevos'}
                  </span>{' '}
                  y no están en tu inventario. Toca{' '}
                  <span className="font-semibold">Registrar</span> en cada uno
                  para poder agregarlos a la requisición.
                </>
              ) : (
                <>
                  Todos los artículos ya están en tu inventario. Revisa las
                  cantidades y confirma.
                </>
              )}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[12.5px] font-medium">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={todosSeleccionados}
                onChange={toggleTodos}
              />
              <span aria-hidden="true" className="check-box">
                <svg viewBox="0 0 20 20">
                  <path d="M4 10.5 8.5 15 16 6.5" />
                </svg>
              </span>
              Seleccionar todo
            </label>

            <button
              type="button"
              onClick={() => agregarFila()}
              className="btn btn-quiet h-9 px-3 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar fila
            </button>
          </div>

          {errorRevision && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger"
            >
              <AlertCircle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                strokeWidth={1.75}
              />
              {errorRevision}
            </p>
          )}

          {itemsDetectados && itemsDetectados.length > 0 ? (
            <>
              <div className="mt-3 hidden overflow-hidden rounded-md border border-gonper-border md:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gonper-border bg-gonper-bg/60 text-[10.5px] font-medium uppercase tracking-widest text-gonper-muted">
                      <th className="w-11 px-2 py-2.5 text-center font-medium">
                        <span className="sr-only">Seleccionar</span>
                      </th>
                      <th className="w-26 px-2 py-2.5 font-medium">
                        Código
                      </th>
                      <th className="px-2 py-2.5 font-medium">Descripción</th>
                      <th className="w-20 px-2 py-2.5 text-center font-medium">
                        Cant.
                      </th>
                      <th className="w-26 px-2 py-2.5 font-medium">
                        Unidad
                      </th>
                      <th className="w-34 px-2 py-2.5 text-center font-medium">
                        Inventario
                      </th>
                      <th className="w-10 px-2 py-2.5">
                        <span className="sr-only">Quitar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gonper-border">
                    {itemsDetectados.map((item) => {
                      const seleccionado = seleccionados.has(item.key)

                      return (
                        <tr
                          key={item.key}
                          className={`align-top transition-colors duration-120 ${
                            seleccionado
                              ? 'bg-gonper-primary/[0.035]'
                              : 'bg-gonper-bg/40 opacity-60'
                          }`}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              checked={seleccionado}
                              onChange={() => toggleSeleccion(item.key)}
                              aria-label={`Seleccionar ${item.descripcion_pdf || item.codigo_pdf}`}
                            />
                            <span aria-hidden="true" className="check-box mx-auto">
                              <svg viewBox="0 0 20 20">
                                <path d="M4 10.5 8.5 15 16 6.5" />
                              </svg>
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={item.codigo_pdf}
                              onChange={(e) =>
                                actualizarItem(item.key, {
                                  codigo_pdf: e.target.value,
                                })
                              }
                              inputMode="numeric"
                              placeholder="Código"
                              aria-label="Código"
                              className="field h-9 px-2 font-mono text-[12px]"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={item.descripcion_pdf}
                              onChange={(e) =>
                                actualizarDescripcion(item, e.target.value)
                              }
                              onFocus={() =>
                                void abrirCombobox(
                                  item.key,
                                  item.descripcion_pdf,
                                )
                              }
                              onKeyDown={(e) => teclaEnCombobox(e, item)}
                              onBlur={(e) => {
                                cotejarAhora(
                                  item.key,
                                  e.target.value,
                                  item.codigo_pdf,
                                  item.unidad,
                                )
                                cerrarCombobox(item.key)
                              }}
                              placeholder="Descripción del artículo"
                              aria-label="Descripción"
                              autoComplete="off"
                              className="field h-9 px-2 text-[13px] font-medium"
                            />
                            {combobox?.key === item.key && (
                              <ListaCandidatos
                                candidatos={combobox.candidatos}
                                resaltado={combobox.resaltado}
                                texto={item.descripcion_pdf}
                                onElegir={(candidato) =>
                                  aplicarCandidato(item, candidato)
                                }
                                onResaltar={(indice) =>
                                  setCombobox((prev) =>
                                    prev ? { ...prev, resaltado: indice } : prev,
                                  )
                                }
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.cantidad}
                              onChange={(e) =>
                                actualizarItem(item.key, {
                                  cantidad: e.target.value,
                                })
                              }
                              aria-label="Cantidad"
                              className="field h-9 px-1 text-center text-[13px] font-semibold"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={item.unidad}
                              onChange={(e) =>
                                actualizarItem(item.key, {
                                  unidad: e.target.value.toUpperCase(),
                                })
                              }
                              list="unidades-comunes"
                              placeholder="CAJA"
                              aria-label="Unidad"
                              className="field h-9 px-2 text-[12px] font-semibold uppercase"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            {item.existe_en_bd ? (
                              <Badge tono="success">Inventariado</Badge>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRegistrarEnInventario(item.key)
                                }
                                disabled={guardandoInventario === item.key}
                                className="btn h-8 border border-gonper-warning-border bg-gonper-warning-bg px-2.5 text-[11.5px] text-gonper-warning hover:bg-gonper-warning-bg/70"
                              >
                                {guardandoInventario === item.key ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    strokeWidth={2}
                                  />
                                ) : (
                                  <Plus
                                    className="h-3.5 w-3.5"
                                    strokeWidth={2}
                                  />
                                )}
                                Registrar
                              </button>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => eliminarFila(item.key)}
                              className="btn-icon text-gonper-muted hover:bg-gonper-danger-bg hover:text-gonper-danger"
                              title="Quitar fila"
                              aria-label="Quitar fila"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid gap-2 md:hidden">
                {itemsDetectados.map((item) => {
                  const seleccionado = seleccionados.has(item.key)

                  return (
                    <div
                      key={item.key}
                      className={`rounded-md border p-3 transition-colors duration-120 ${
                        seleccionado
                          ? 'border-gonper-border bg-gonper-surface'
                          : 'border-gonper-border bg-gonper-bg/50 opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-[12px] font-medium text-gonper-muted">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={seleccionado}
                            onChange={() => toggleSeleccion(item.key)}
                          />
                          <span aria-hidden="true" className="check-box">
                            <svg viewBox="0 0 20 20">
                              <path d="M4 10.5 8.5 15 16 6.5" />
                            </svg>
                          </span>
                          Incluir en la requisición
                        </label>
                        <button
                          type="button"
                          onClick={() => eliminarFila(item.key)}
                          className="btn-icon -mr-1 -mt-1 text-gonper-muted hover:text-gonper-danger"
                          aria-label="Quitar fila"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                        <div className="min-w-0">
                          <label
                            className="field-label"
                            htmlFor={`codigo-${item.key}`}
                          >
                            Código
                          </label>
                          <input
                            id={`codigo-${item.key}`}
                            value={item.codigo_pdf}
                            onChange={(e) =>
                              actualizarItem(item.key, {
                                codigo_pdf: e.target.value,
                              })
                            }
                            inputMode="numeric"
                            placeholder="Código"
                            className="field h-10 font-mono text-[12.5px]"
                          />
                        </div>
                        <div>
                          <label
                            className="field-label"
                            htmlFor={`cantidad-${item.key}`}
                          >
                            Cantidad
                          </label>
                          <input
                            id={`cantidad-${item.key}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.cantidad}
                            onChange={(e) =>
                              actualizarItem(item.key, {
                                cantidad: e.target.value,
                              })
                            }
                            className="field h-10 text-center font-semibold"
                          />
                        </div>
                      </div>

                      <div className="mt-2">
                        <label
                          className="field-label"
                          htmlFor={`descripcion-${item.key}`}
                        >
                          Descripción
                        </label>
                        <input
                          id={`descripcion-${item.key}`}
                          value={item.descripcion_pdf}
                          onChange={(e) =>
                            actualizarDescripcion(item, e.target.value)
                          }
                          onFocus={() =>
                            void abrirCombobox(item.key, item.descripcion_pdf)
                          }
                          onKeyDown={(e) => teclaEnCombobox(e, item)}
                          onBlur={(e) => {
                            cotejarAhora(
                              item.key,
                              e.target.value,
                              item.codigo_pdf,
                              item.unidad,
                            )
                            cerrarCombobox(item.key)
                          }}
                          placeholder="Descripción del artículo"
                          autoComplete="off"
                          className="field h-10 text-[13px] font-medium"
                        />
                        {combobox?.key === item.key && (
                          <ListaCandidatos
                            candidatos={combobox.candidatos}
                            resaltado={combobox.resaltado}
                            texto={item.descripcion_pdf}
                            onElegir={(candidato) =>
                              aplicarCandidato(item, candidato)
                            }
                            onResaltar={(indice) =>
                              setCombobox((prev) =>
                                prev ? { ...prev, resaltado: indice } : prev,
                              )
                            }
                          />
                        )}
                      </div>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="w-28">
                          <label
                            className="field-label"
                            htmlFor={`unidad-${item.key}`}
                          >
                            Unidad
                          </label>
                          <input
                            id={`unidad-${item.key}`}
                            value={item.unidad}
                            onChange={(e) =>
                              actualizarItem(item.key, {
                                unidad: e.target.value.toUpperCase(),
                              })
                            }
                            list="unidades-comunes"
                            placeholder="CAJA"
                            className="field h-10 text-[12.5px] font-semibold uppercase"
                          />
                        </div>

                        {item.existe_en_bd ? (
                          <Badge tono="success">Inventariado</Badge>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRegistrarEnInventario(item.key)}
                            disabled={guardandoInventario === item.key}
                            className="btn h-10 border border-gonper-warning-border bg-gonper-warning-bg px-3 text-[12px] text-gonper-warning hover:bg-gonper-warning-bg/70"
                          >
                            {guardandoInventario === item.key ? (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                strokeWidth={2}
                              />
                            ) : (
                              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                            )}
                            Registrar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-gonper-border px-4 py-10 text-center">
              <ScanText
                className="mx-auto h-6 w-6 text-gonper-muted"
                strokeWidth={1.5}
              />
              <p className="mt-2 text-[13px] font-medium">
                No hay filas detectadas
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-gonper-muted">
                Agrega una fila manualmente con el botón de arriba.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
