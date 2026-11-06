'use client'

import { useRef, useState } from 'react'
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
import { procesarTextoOrden } from './procesarTexto'
import { extraerTextoDelPDF } from './procesarPdf'
import * as pdfjsLib from 'pdfjs-dist'
import Tesseract from 'tesseract.js'
import { parseRequisicion } from '@/utils/requisicion'
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

export default function ProcesarPdfButton({
  ordenId,
  pdfPath,
}: {
  ordenId: string
  pdfPath: string
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

  const router = useRouter()
  const contadorFilas = useRef(0)
  const etiquetaOcr = useRef('Analizando imagen')

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

    try {
      let textoCompleto = cacheTexto.get(pdfPath) ?? ''

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
            const fileUrl = await obtenerUrlParaOCR(pdfPath)
            textoCompleto = await leerPdfConOcr(fileUrl)
          }
        } else {
          const fileUrl = await obtenerUrlParaOCR(pdfPath)
          textoCompleto = await leerImagenConOcr(fileUrl)
        }

        if (textoCompleto.trim()) cacheTexto.set(pdfPath, textoCompleto)
      }

      setStatusMsg('Cotejando con el catálogo...')
      const result = await procesarTextoOrden(textoCompleto)

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

  const aplicarSugerencia = (item: ItemDetectado) => {
    if (!item.sugerencia) return
    const sugerencia = item.sugerencia

    setItemsDetectados((prev) =>
      prev
        ? prev.map((fila) =>
            fila.key === item.key
              ? {
                  ...fila,
                  codigo_pdf: sugerencia.sku,
                  descripcion_pdf: sugerencia.nombre,
                  unidad:
                    normalizarUnidad(sugerencia.unidad_medida) || fila.unidad,
                  existe_en_bd: true,
                  id_bd: sugerencia.id,
                  sugerencia: null,
                }
              : fila,
          )
        : null,
    )
    setSeleccionados((prev) => new Set(prev).add(item.key))
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
      router.push(`/ordenes/${ordenId}`)
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

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={handleProcesar}
          disabled={isLoading || isSaving}
          className="btn btn-primary px-3 text-[12px]"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <ScanText className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {isLoading ? 'Leyendo…' : 'Leer archivo'}
        </button>
        {statusMsg && (
          <span className="max-w-[16rem] text-right text-[11px] leading-snug text-gonper-muted">
            {statusMsg}
          </span>
        )}
        {errorProceso && (
          <span
            role="alert"
            className="max-w-[18rem] text-right text-[11px] leading-snug text-gonper-danger"
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
        title="Revisión de la requisición"
        description="Corrige lo que el OCR haya leído mal. Las filas nuevas se registran en el catálogo con su unidad."
        size="wide"
        footer={
          <>
            <p className="mr-auto w-full text-[12px] text-gonper-muted sm:w-auto">
              <span className="font-semibold text-gonper-text">
                {seleccionados.size}
              </span>{' '}
              {seleccionados.size === 1
                ? 'artículo seleccionado'
                : 'artículos seleccionados'}
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[12.5px] font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer accent-gonper-primary"
                checked={todosSeleccionados}
                onChange={toggleTodos}
              />
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
                              className="h-4 w-4 cursor-pointer accent-gonper-primary"
                              checked={seleccionado}
                              onChange={() => toggleSeleccion(item.key)}
                              aria-label={`Seleccionar ${item.descripcion_pdf || item.codigo_pdf}`}
                            />
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
                                actualizarItem(item.key, {
                                  descripcion_pdf: e.target.value,
                                })
                              }
                              placeholder="Descripción del artículo"
                              aria-label="Descripción"
                              className="field h-9 px-2 text-[13px] font-medium"
                            />
                            {item.sugerencia && (
                              <div className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-gonper-warning">
                                <span className="min-w-0">
                                  Sugerencia: {item.sugerencia.nombre} (
                                  {item.sugerencia.sku})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => aplicarSugerencia(item)}
                                  className="shrink-0 font-semibold text-gonper-primary hover:underline"
                                >
                                  Usar
                                </button>
                              </div>
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
                            className="h-4 w-4 cursor-pointer accent-gonper-primary"
                            checked={seleccionado}
                            onChange={() => toggleSeleccion(item.key)}
                          />
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
                            actualizarItem(item.key, {
                              descripcion_pdf: e.target.value,
                            })
                          }
                          placeholder="Descripción del artículo"
                          className="field h-10 text-[13px] font-medium"
                        />
                      </div>

                      {item.sugerencia && (
                        <div className="mt-1.5 flex items-start gap-2 text-[11.5px] leading-snug text-gonper-warning">
                          <span className="min-w-0">
                            Sugerencia: {item.sugerencia.nombre} (
                            {item.sugerencia.sku})
                          </span>
                          <button
                            type="button"
                            onClick={() => aplicarSugerencia(item)}
                            className="shrink-0 font-semibold text-gonper-primary hover:underline"
                          >
                            Usar
                          </button>
                        </div>
                      )}

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
