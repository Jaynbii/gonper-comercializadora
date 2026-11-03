'use server'

import { createClient } from '@/utils/supabase/server'
import Fuse from 'fuse.js'

function formatearNombre(str: string) {
  if (!str) return str
  return str.toLowerCase().replace(/(^\\w|\\s\\w)/g, m => m.toUpperCase())
}

function limpiarDescripcion(valor: string) {
  return valor
    .replace(/^[^a-zA-ZñÑáéíóúÁÉÍÓÚ0-9]+/, '')
    .replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ0-9\\s/]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export async function procesarTextoOrden(textoCrudo: string, ordenId: string) {
  const supabase = await createClient()
  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const fuse = new Fuse(productosDB || [], {
    keys: ['nombre'],
    threshold: 0.5,
    ignoreLocation: true,
  })

  // Normalizamos errores conocidos de lectura sin depender del catálogo.
  const textoLimpio = textoCrudo
    .replace(/Yabulto/gi, '0.5 bulto ')
    .replace(/Ysbulto/gi, '0.5 bulto ')
    .replace(/1\\/2/gi, '0.5')
    .replace(/C\\/3\\s*KGS/gi, 'C/9 KGS')
    .replace(/JABON\\s*C\\/3/gi, 'JABON C/9')

  const lineas = textoLimpio.split(/\\r?\\n/)
  const itemsDetectados: {
    codigo_pdf: string
    cantidad: number
    descripcion_pdf: string
    producto_id: string
    producto_nombre: string
    existe_en_bd: boolean
    id_bd: string | null
  }[] = []

  // Formato original de requisición: código, cantidad, unidad y descripción.
  const regexFormal = /(\\d{4,6})\\s*(\\d+\\.\\d{2})\\s*(PIEZA|BULTO|METRO|CAJA|PORRON|PAQUETE|BOLSA)\\s*(.+)/i

  // Formatos alternativos comunes en fotos o documentos reenviados por WhatsApp.
  const regexAlternativo = /^(?:(\\d{4,8})\\s+)?(\\d+(?:[.,]\\d{1,3})?)\\s*(?:PZA|PZ|PIEZA|PZAS|PIEZAS|BULTO|BULTOS|METRO|METROS|M|CAJA|CAJAS|PORRON|PORRONES|PAQUETE|PAQUETES|BOLSA|BOLSAS|KG|KGS|L|LT|LTS|LITRO|LITROS)?\\s+(.+)$/i
  const regexCantidadFinal = /^(.+?)\\s+(\\d+(?:[.,]\\d{1,3})?)\\s*(PZA|PZ|PIEZA|PIEZAS|BULTO|BULTOS|CAJA|CAJAS|KG|KGS|LTS?)$/i

  const palabrasBasura = [
    'DEPARTAMENTO', 'MAZATLAN', 'POLIZA', 'FECHA', 'PROVEEDOR',
    'FONDOS', 'PROYECTO', 'SUBTOTAL', 'TOTAL', 'REQUISICION',
    'REQUERIMIENTO', 'CANTIDAD', 'DESCRIPCION',
  ]

  for (let indice = 0; indice < lineas.length; indice++) {
    const lineaTrim = lineas[indice].trim()
    if (!lineaTrim) continue

    let codigoPDF = ''
    let cantidad = 0
    let descripcionPDF = ''

    const formal = lineaTrim.match(regexFormal)

    if (formal) {
      codigoPDF = formal[1]
      cantidad = Number(formal[2])
      descripcionPDF = formal[4].split(/(?=\\d+[.,]\\d{2})/)[0]
    } else {
      const alternativo = lineaTrim.match(regexAlternativo)
      const cantidadFinal = lineaTrim.match(regexCantidadFinal)

      if (alternativo) {
        codigoPDF = alternativo[1] || ''
        cantidad = Number(alternativo[2].replace(',', '.'))
        descripcionPDF = alternativo[3]
      } else if (cantidadFinal) {
        cantidad = Number(cantidadFinal[2].replace(',', '.'))
        descripcionPDF = cantidadFinal[1]
      } else {
        continue
      }
    }

    descripcionPDF = limpiarDescripcion(descripcionPDF)
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000) continue
    if (descripcionPDF.length < 3) continue
    if (palabrasBasura.some(palabra => descripcionPDF.includes(palabra))) continue

    // La coincidencia de catálogo solo aporta una referencia; nunca descarta el renglón leído.
    let productoExistente = codigoPDF
      ? productosDB?.find(producto => producto.sku === codigoPDF)
      : undefined

    if (!productoExistente) {
      const resultados = fuse.search(descripcionPDF)
      if (resultados.length > 0) productoExistente = resultados[0].item
    }

    // Los renglones sin código reciben un SKU temporal para permitir su alta desde la revisión.
    const codigoParaRegistro = codigoPDF || `OCR-${Date.now()}-${indice}`
    const nombre = formatearNombre(descripcionPDF)

    itemsDetectados.push({
      codigo_pdf: codigoParaRegistro,
      cantidad,
      descripcion_pdf: nombre,
      producto_id: codigoParaRegistro,
      producto_nombre: nombre,
      existe_en_bd: !!productoExistente,
      id_bd: productoExistente?.id || null,
    })
  }

  return { success: true, items: itemsDetectados }
}
