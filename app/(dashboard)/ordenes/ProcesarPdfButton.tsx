'use client'

import { useRef, useState } from 'react'
import {
  obtenerUrlParaOCR,
  guardarItemsEnOrden,
  registrarProductoEnInventario,
} from './actions'
import { procesarTextoOrden } from './procesarTexto'
import { extraerTextoDelPDF } from './procesarPdf'
import { useRouter } from 'next/navigation'
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
  const [itemsDetectados, setItemsDetectados] = useState<ItemDetectado[] | null>(null)
  const [lineasNoReconocidas, setLineasNoReconocidas] = useState<string[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [guardandoInventario, setGuardandoInventario] = useState<string | null>(null)

  const router = useRouter()
  const contadorFilas = useRef(0)
  const etiquetaOcr = useRef('Analizando imagen')

  const nuevaLlave = () => `fila-${Date.now()}-${contadorFilas.current++}`

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
    setItemsDetectados(null)
    setLineasNoReconocidas([])

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

      setLineasNoReconocidas(result.lineasNoReconocidas)

      if (detectados.length === 0 && result.lineasNoReconocidas.length === 0) {
        alert('No se detectaron productos válidos en el archivo.')
        return
      }

      setItemsDetectados(detectados)
      setSeleccionados(
        new Set(detectados.filter((item) => item.existe_en_bd).map((item) => item.key)),
      )
    } catch (error) {
      console.error(error)
      alert('Error al procesar: ' + mensajeDeError(error))
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
                  unidad: normalizarUnidad(sugerencia.unidad_medida) || fila.unidad,
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

    if (!item.codigo_pdf.trim() || !item.descripcion_pdf.trim()) {
      alert('Completa el código y la descripción antes de registrar el producto.')
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
      alert('Error al registrar producto: ' + mensajeDeError(error))
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

  const agregarLineaNoReconocida = (linea: string) => {
    agregarFila(linea)
    setLineasNoReconocidas((prev) => prev.filter((item) => item !== linea))
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

    const itemsParaGuardar = itemsDetectados.filter((item) =>
      seleccionados.has(item.key),
    )

    if (itemsParaGuardar.length === 0) {
      alert('No has seleccionado ningún artículo para agregar a la orden.')
      return
    }

    const sinRegistrar = itemsParaGuardar.filter((item) => !item.id_bd)
    if (sinRegistrar.length > 0) {
      alert(
        'Primero registra en inventario: ' +
          sinRegistrar.map((item) => item.descripcion_pdf || item.codigo_pdf).join(', '),
      )
      return
    }

    setIsSaving(true)
    try {
      await guardarItemsEnOrden(ordenId, itemsParaGuardar)
      setItemsDetectados(null)
      setLineasNoReconocidas([])
      setIsSaving(false)
      router.refresh()
    } catch (error) {
      alert(mensajeDeError(error))
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
          onClick={handleProcesar}
          disabled={isLoading || isSaving}
          className="px-3 py-1 text-sm text-white bg-gonper-primary hover:bg-gonper-primary-hover rounded-md disabled:bg-gray-400"
        >
          {isLoading ? 'Leyendo...' : '📸 Leer Archivo'}
        </button>
        {statusMsg && <span className="text-xs text-gonper-muted">{statusMsg}</span>}
      </div>

      {itemsDetectados && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Revisión de Requerimiento</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Corrige lo que el OCR haya leído mal. Los artículos nuevos se registran en el
                  catálogo con su unidad.
                </p>
              </div>
              <button
                onClick={() => setItemsDetectados(null)}
                className="text-2xl text-gray-400 hover:text-red-500"
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <datalist id="unidades-comunes">
                {UNIDADES_COMUNES.map((unidad) => (
                  <option key={unidad} value={unidad} />
                ))}
              </datalist>

              {lineasNoReconocidas.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-800">
                    El OCR no pudo interpretar estas líneas. Revísalas para no perder artículos:
                  </p>
                  <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {lineasNoReconocidas.map((linea, index) => (
                      <li
                        key={`${linea}-${index}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-mono text-amber-900 break-all">{linea}</span>
                        <button
                          onClick={() => agregarLineaNoReconocida(linea)}
                          className="shrink-0 rounded bg-amber-600 px-2 py-1 font-bold text-white hover:bg-amber-700"
                        >
                          + Agregar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm text-left">
                  <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="p-3 w-12 text-center" title="Seleccionar para esta orden">
                        <input
                          type="checkbox"
                          className="w-4 h-4 cursor-pointer"
                          checked={todosSeleccionados}
                          onChange={toggleTodos}
                        />
                      </th>
                      <th className="p-3 w-28">Código</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3 w-24 text-center">Cantidad</th>
                      <th className="p-3 w-28">Unidad</th>
                      <th className="p-3 w-36 text-center border-l border-gray-200">
                        Inventario
                      </th>
                      <th className="p-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {itemsDetectados.map((item) => (
                      <tr
                        key={item.key}
                        className={`transition-colors ${
                          seleccionados.has(item.key)
                            ? 'bg-blue-50/30'
                            : 'opacity-60 bg-gray-50'
                        }`}
                      >
                        <td className="p-3 text-center align-top">
                          <input
                            type="checkbox"
                            className="w-4 h-4 cursor-pointer"
                            checked={seleccionados.has(item.key)}
                            onChange={() => toggleSeleccion(item.key)}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            value={item.codigo_pdf}
                            onChange={(e) =>
                              actualizarItem(item.key, { codigo_pdf: e.target.value })
                            }
                            inputMode="numeric"
                            placeholder="Código"
                            className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            value={item.descripcion_pdf}
                            onChange={(e) =>
                              actualizarItem(item.key, {
                                descripcion_pdf: e.target.value,
                              })
                            }
                            placeholder="Descripción del artículo"
                            className="w-full rounded border border-gray-300 px-2 py-1 font-medium"
                          />
                          {item.sugerencia && (
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-700">
                              <span>
                                Sugerencia: {item.sugerencia.nombre} ({item.sugerencia.sku})
                              </span>
                              <button
                                onClick={() => aplicarSugerencia(item)}
                                className="font-bold text-blue-600 hover:underline"
                              >
                                Usar
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-center align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.cantidad}
                            onChange={(e) =>
                              actualizarItem(item.key, { cantidad: e.target.value })
                            }
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-center font-bold"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            value={item.unidad}
                            onChange={(e) =>
                              actualizarItem(item.key, {
                                unidad: e.target.value.toUpperCase(),
                              })
                            }
                            list="unidades-comunes"
                            placeholder="CAJA"
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs font-semibold"
                          />
                        </td>
                        <td className="p-3 text-center align-top border-l border-gray-200">
                          {item.existe_en_bd ? (
                            <span className="text-emerald-600 font-bold text-xs bg-emerald-100 px-2 py-1 rounded">
                              Inventariado
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRegistrarEnInventario(item.key)}
                              disabled={guardandoInventario === item.key}
                              className="text-xs font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
                            >
                              {guardandoInventario === item.key
                                ? 'Guardando...'
                                : '+ Registrar'}
                            </button>
                          )}
                        </td>
                        <td className="p-2 text-center align-top">
                          <button
                            onClick={() => eliminarFila(item.key)}
                            className="text-gray-400 hover:text-red-500"
                            title="Quitar fila"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {itemsDetectados.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-500">
                  No hay filas detectadas. Agrega una fila manualmente o usa una línea de las
                  que no se pudieron interpretar.
                </p>
              )}

              <button
                onClick={() => agregarFila()}
                className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-gonper-primary hover:text-gonper-primary"
              >
                + Agregar fila
              </button>
            </div>

            <div className="p-4 border-t bg-gray-50 flex flex-col md:flex-row gap-3 md:justify-between md:items-center">
              <div className="text-sm text-gray-600">
                <span className="font-bold text-blue-600">{seleccionados.size}</span> artículos
                seleccionados para la orden.
                {lineasNoReconocidas.length > 0 && (
                  <span className="ml-2 text-amber-700">
                    {lineasNoReconocidas.length} línea(s) sin interpretar.
                  </span>
                )}
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setItemsDetectados(null)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmar}
                  disabled={isSaving || seleccionados.size === 0 || guardandoInventario !== null}
                  className="px-6 py-2 bg-gonper-primary text-white font-bold rounded-lg hover:bg-gonper-primary-hover disabled:bg-gray-400"
                >
                  {isSaving ? 'Guardando Orden...' : 'Confirmar y Agregar a Orden'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
