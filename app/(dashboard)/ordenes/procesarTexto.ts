'use server'

import { createClient } from '@/utils/supabase/server'
import Fuse from 'fuse.js'

function formatearNombre(str: string) {
  if (!str) return str;
  return str.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase());
}

export async function procesarTextoOrden(textoCrudo: string, ordenId: string) {
  const supabase = await createClient()
  const { data: productosDB, error: dbError } = await supabase.from('productos').select('id, sku, nombre')
  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const fuse = new Fuse(productosDB || [], { keys: ['nombre'], threshold: 0.5, ignoreLocation: true })

  // 1. DICCIONARIO DE CORRECCIÓN DE OCR
  let textoLimpio = textoCrudo
    .replace(/Yabulto/gi, '0.5 bulto ')
    .replace(/Ysbulto/gi, '0.5 bulto ')
    .replace(/1\/2/gi, '0.5')
    .replace(/C\/3\s*KGS/gi, 'C/9 KGS') 
    .replace(/JABON\s*C\/3/gi, 'JABON C/9')

  const lineas = textoLimpio.split('\n')
  const itemsDetectados = []

  const regexFormal = /(\d{4,6})\s*(\d+\.\d{2})\s*(PIEZA|BULTO|METRO|CAJA|PORRON|PAQUETE|BOLSA)\s*(.+)/i

  for (const linea of lineas) {
    const lineaTrim = linea.trim()
    if (!lineaTrim) continue

    const match = lineaTrim.match(regexFormal)
    
    if (match) {
      const codigoPDF = match[1]
      const cantidad = parseFloat(match[2])
      let descripcionPDF = match[4]

      // ====================================================
      // 🧠 LA MAGIA: CORTE POR PUNTO DECIMAL
      // ====================================================
      // Busca el primer patrón de precio (ej. "220.40" o "2,132.08") y corta el texto ahí.
      // Esto elimina precios aunque estén pegados a la palabra, pero conserva 
      // los números que están en medio (como "JUMBO 400" o "C/9").
      descripcionPDF = descripcionPDF.split(/(?=\d+[.,]\d{2})/)[0]
      
      // Limpiamos puntos, comas o espacios que hayan quedado al final de la descripción
      descripcionPDF = descripcionPDF.replace(/[.,\s]+$/, '')

      // Limpieza estándar
      descripcionPDF = descripcionPDF.replace(/^[^a-zA-Z]+/, '')
      descripcionPDF = descripcionPDF.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ0-9\s\/]/g, '')
      descripcionPDF = descripcionPDF.replace(/\s+/g, ' ').trim().toUpperCase()

      // Filtro anti-basura
      const palabrasBasura = ['DEPARTAMENTO', 'MAZATLAN', 'POLIZA', 'FECHA', 'PROVEEDOR', 'FONDOS', 'PROYECTO', 'SUBTOTAL', 'TOTAL']
      const esBasura = palabrasBasura.some(palabra => descripcionPDF.includes(palabra))

      if (descripcionPDF.length < 3 || esBasura) continue;

      // Búsqueda en BD
      let productoExistente = productosDB?.find(p => p.sku === codigoPDF)
      if (!productoExistente) {
        const resultados = fuse.search(descripcionPDF)
        if (resultados.length > 0) productoExistente = resultados[0].item
      }

      itemsDetectados.push({
        codigo_pdf: codigoPDF, 
        cantidad: cantidad, 
        descripcion_pdf: formatearNombre(descripcionPDF),
        producto_id: codigoPDF, 
        producto_nombre: formatearNombre(descripcionPDF),
        existe_en_bd: !!productoExistente, 
        id_bd: productoExistente?.id || null 
      })
    }
  }
  
  return { success: true, items: itemsDetectados }
}