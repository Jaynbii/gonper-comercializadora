'use client'

import { useState, useEffect } from 'react'
import { obtenerUrlParaOCR, guardarItemsEnOrden, registrarProductoEnInventario } from './actions'
import { procesarTextoOrden } from './procesarTexto'
import { useRouter } from 'next/navigation'
import * as pdfjsLib from 'pdfjs-dist'
import Tesseract from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

/**
 * Reconstruye las líneas de una tabla usando la posición vertical de cada palabra.
 * Esto evita que Tesseract agrupe primero toda una columna y después otra.
 */
function reconstruirLineasPorCoordenadas(words: any[]) {
  const palabras = (words || [])
    .filter(word => word.text?.trim() && word.bbox)
    .map(word => ({
      texto: word.text.trim(),
      x: word.bbox.x0,
      y: (word.bbox.y0 + word.bbox.y1) / 2,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const filas: { y: number; palabras: typeof palabras }[] = []

  for (const palabra of palabras) {
    let fila = filas.find(actual => Math.abs(actual.y - palabra.y) <= 18)
    if (!fila) {
      fila = { y: palabra.y, palabras: [] }
      filas.push(fila)
    }
    fila.palabras.push(palabra)
    fila.y = fila.palabras.reduce((suma, actual) => suma + actual.y, 0) / fila.palabras.length
  }

  return filas
    .sort((a, b) => a.y - b.y)
    .map(fila => fila.palabras.sort((a, b) => a.x - b.x).map(p => p.texto).join(' '))
    .join('\\n')
}

export default function ProcesarPdfButton({ ordenId, pdfPath }: { ordenId: string, pdfPath: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [itemsDetectados, setItemsDetectados] = useState<any[] | null>(null)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [guardandoInventario, setGuardandoInventario] = useState<number | null>(null)

  const router = useRouter()

  useEffect(() => {
    if (itemsDetectados) {
      const iniciales = new Set<number>()
      itemsDetectados.forEach((item, index) => {
        if (item.existe_en_bd) iniciales.add(index)
      })
      setSeleccionados(iniciales)
    }
  }, [itemsDetectados])

  const handleProcesar = async () => {
    setIsLoading(true)
    setStatusMsg('Iniciando lectura...')
    setItemsDetectados(null)

    try {
      const fileUrl = await obtenerUrlParaOCR(pdfPath)
      let textoCompleto = ''

      // 🧠 VERIFICAMOS SI ES PDF O IMAGEN
      const esPDF = pdfPath.toLowerCase().endsWith('.pdf')

      if (esPDF) {
        setStatusMsg('Leyendo PDF...')
        const loadingTask = pdfjsLib.getDocument({ url: fileUrl })
        const pdf = await loadingTask.promise
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2.0 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          canvas.height = viewport.height
          canvas.width = viewport.width

          if (context) {
            await page.render({ canvasContext: context, viewport, canvas } as any).promise
            setStatusMsg(`Analizando imagen (Página ${i})...`)
            const { data } = await Tesseract.recognize(canvas, 'spa', { logger: m => {} })
            const textoPorFilas = reconstruirLineasPorCoordenadas((data as any).words)
            textoCompleto += (textoPorFilas || data.text) + '\n'
          }
        }
      } else {
        // Es una FOTO (JPG, PNG, etc)
        setStatusMsg('Analizando fotografía...')
        // Tesseract puede leer una URL de imagen directamente
        const { data } = await Tesseract.recognize(fileUrl, 'spa', { 
          logger: m => {
            if (m.status === 'recognizing text') {
              setStatusMsg(`Analizando foto: ${(m.progress * 100).toFixed(0)}%`)
            }
          } 
        })
        textoCompleto = reconstruirLineasPorCoordenadas((data as any).words) || data.text
      }

      setStatusMsg('Cotejando con el catálogo...')
      const result = await procesarTextoOrden(textoCompleto, ordenId)
      
      if (result.success && result.items.length > 0) {
        setItemsDetectados(result.items)
      } else {
        alert("No se detectaron productos válidos en la imagen.")
      }
    } catch (error: any) {
      console.error(error)
      alert("Error al procesar: " + error.message)
    } finally {
      setIsLoading(false)
      setStatusMsg('')
    }
  }

  const toggleSeleccion = (index: number) => {
    const nuevos = new Set(seleccionados)
    if (nuevos.has(index)) nuevos.delete(index)
    else nuevos.add(index)
    setSeleccionados(nuevos)
  }

  const toggleTodos = () => {
    if (!itemsDetectados) return
    if (seleccionados.size === itemsDetectados.length) {
      setSeleccionados(new Set()) 
    } else {
      setSeleccionados(new Set(itemsDetectados.map((_, i) => i))) 
    }
  }

  const handleRegistrarEnInventario = async (index: number) => {
    if (!itemsDetectados) return
    setGuardandoInventario(index)
    try {
      const item = itemsDetectados[index]
      const productoNuevo = await registrarProductoEnInventario(item)
      
      const nuevosItems = [...itemsDetectados]
      nuevosItems[index].existe_en_bd = true
      nuevosItems[index].id_bd = productoNuevo.id
      setItemsDetectados(nuevosItems)

      const nuevosSeleccionados = new Set(seleccionados)
      nuevosSeleccionados.add(index)
      setSeleccionados(nuevosSeleccionados)
    } catch (error: any) {
      alert("Error al registrar producto: " + error.message)
    } finally {
      setGuardandoInventario(null)
    }
  }

  const handleConfirmar = async () => {
    if (!itemsDetectados) return
    const itemsParaGuardar = itemsDetectados.filter((_, index) => seleccionados.has(index))

    if (itemsParaGuardar.length === 0) {
      alert("No has seleccionado ningún artículo para agregar a la orden.")
      return
    }

    setIsSaving(true)
    try {
      await guardarItemsEnOrden(ordenId, itemsParaGuardar)
      router.refresh() 
    } catch (error: any) {
      alert(error.message) 
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button onClick={handleProcesar} disabled={isLoading || isSaving} className="px-3 py-1 text-sm text-white bg-gonper-primary hover:bg-gonper-primary-hover rounded-md disabled:bg-gray-400">
          {isLoading ? 'Leyendo...' : '📸 Leer Archivo'}
        </button>
        {statusMsg && <span className="text-xs text-gonper-muted">{statusMsg}</span>}
      </div>

      {itemsDetectados && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Revisión de Requerimiento</h2>
                <p className="text-xs text-gray-500 mt-1">1. Registra en el catálogo los artículos nuevos. 2. Selecciona los que van para esta orden.</p>
              </div>
              <button onClick={() => setItemsDetectados(null)} className="text-2xl text-gray-400 hover:text-red-500">&times;</button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="p-3 w-12 text-center" title="Seleccionar para esta orden">
                      <input type="checkbox" className="w-4 h-4 cursor-pointer" checked={seleccionados.size === itemsDetectados.length && itemsDetectados.length > 0} onChange={toggleTodos} />
                    </th>
                    <th className="p-3">Código</th>
                    <th className="p-3">Descripción (Documento)</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3 text-center border-l border-gray-200">Estado en Inventario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {itemsDetectados.map((item, idx) => (
                    <tr key={idx} className={`transition-colors ${seleccionados.has(idx) ? 'bg-blue-50/30' : 'opacity-60 bg-gray-50'}`}>
                      <td className="p-3 text-center">
                        <input type="checkbox" className="w-4 h-4 cursor-pointer" checked={seleccionados.has(idx)} onChange={() => toggleSeleccion(idx)} />
                      </td>
                      <td className="p-3 font-mono text-xs">{item.codigo_pdf}</td>
                      <td className="p-3 font-medium">{item.producto_nombre}</td>
                      <td className="p-3 text-center font-bold">{item.cantidad}</td>
                      
                      <td className="p-3 text-center border-l border-gray-200">
                        {item.existe_en_bd ? (
                          <span className="text-emerald-600 font-bold text-xs bg-emerald-100 px-2 py-1 rounded">Inventariado</span>
                        ) : (
                          <button 
                            onClick={() => handleRegistrarEnInventario(idx)}
                            disabled={guardandoInventario === idx}
                            className="text-xs font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            {guardandoInventario === idx ? 'Guardando...' : '+ Registrar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <span className="font-bold text-blue-600">{seleccionados.size}</span> artículos seleccionados para la orden.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setItemsDetectados(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg">Cancelar</button>
                <button onClick={handleConfirmar} disabled={isSaving || seleccionados.size === 0 || guardandoInventario !== null} className="px-6 py-2 bg-gonper-primary text-white font-bold rounded-lg hover:bg-gonper-primary-hover disabled:bg-gray-400">
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