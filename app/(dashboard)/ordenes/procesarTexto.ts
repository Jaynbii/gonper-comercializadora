'use server'

import { createClient } from '@/utils/supabase/server'
import Fuse from 'fuse.js'

function formatearNombre(str: string) {
  if (!str) return str
  return str.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase())
}

function limpiarDescripcion(valor: string) {
  return valor
    .replace(/^[^a-zA-ZñÑáéíóúÁÉÍÓÚ0-9]+/, '')
    .replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ0-9\s/]/g, '')
    .replace(/\s+/g, ' ')
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
    .replace(/1\/2/gi, '0.5')
    .replace(/C\/3\s*KGS/gi, 'C/9 KGS')
    .replace(/JABON\s*C\/3/gi, 'JABON C/9')

  const lineas = textoLimpio.split(/\r?\n/)
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
  const regexFormal = /^(\d{4,8})\s+(\d+(?:[.,]\d{1,3})?)\s*(PIEZAS?|PZAS?|BULTOS?|METROS?|M|CAJAS?|PORRONES?|PAQUETES?|BOLSAS?|GALON(?:ES)?|KGS?|LITROS?|LTS?)\s+(.+?)\s*(?:(?:\$?\s*)\d{1,3}(?:,\d{3})*(?:\.\d{2})\s+(?:\$?\s*)\d{1,3}(?:,\d{3})*(?:\.\d{2}))?$/i

  // Formato alternativo: exige una unidad de medida explícita para evitar encabezados y texto suelto.
  const regexAlternativo = /^(?:(\d{4,8})\s+)?(\d+(?:[.,]\d{1,3})?)\s*(PZA|PZ|PIEZA|PZAS|PIEZAS|BULTO|BULTOS|METRO|METROS|M|CAJA|CAJAS|PORRON|PORRONES|PAQUETE|PAQUETES|BOLSA|BOLSAS|KG|KGS|L|LT|LTS|GALON|GALONES|LITRO|LITROS)\s+(.+)$/i

  const palabrasBasura = [
    'DEPARTAMENTO', 'MAZATLAN', 'POLIZA', 'FECHA', 'PROVEEDOR',
    'FONDOS', 'PROYECTO', 'SUBTOTAL', 'TOTAL', 'REQUISICION',
    'REQUERIMIENTO', 'CANTIDAD', 'DESCRIPCION',
  ]

  // Detectamos requisiciones donde el OCR separa las columnas de códigos,
  // cantidades y descripciones en bloques independientes.
  const lineasProcesadas = new Set<number>()
  const indiceEncabezado = lineas.findIndex(linea =>
    /CODIGO.*CANTIDAD.*UNIDAD.*DESCRIPCION/i.test(linea.replace(/\s+/g, ' '))
  )

  if (indiceEncabezado >= 0) {
    const codigos: string[] = []
    let indiceCantidades = -1

    // Los códigos suelen aparecer en una o varias líneas debajo del encabezado.
    for (let i = indiceEncabezado + 1; i < Math.min(lineas.length, indiceEncabezado + 7); i++) {
      const candidata = lineas[i].trim()
      const cantidadesEnLinea = candidata.match(/\d+(?:[.,]\d{1,3})?\s*(?:PZA|PZAS|PIEZA|PIEZAS|BULTO|BULTOS|METRO|METROS|CAJA|CAJAS|PORRON|PORRONES|PAQUETE|PAQUETES|BOLSA|BOLSAS|KG|KGS|GALON|GALONES|LITRO|LITROS|LT|LTS)\b/gi)

      if (cantidadesEnLinea && cantidadesEnLinea.length > 0) {
        indiceCantidades = i
        break
      }

      if (/^\d{4,8}(?:\s+\d{4,8})*$/.test(candidata)) {
        codigos.push(...candidata.split(/\s+/))
        lineasProcesadas.add(i)
      }
    }

    if (indiceCantidades >= 0) {
      const cantidades: { cantidad: number; unidad: string }[] = []
      const regexCantidadUnidad = /(\d+(?:[.,]\d{1,3})?)\s*(PZA|PZAS|PIEZA|PIEZAS|BULTO|BULTOS|METRO|METROS|CAJA|CAJAS|PORRON|PORRONES|PAQUETE|PAQUETES|BOLSA|BOLSAS|KG|KGS|GALON|GALONES|LITRO|LITROS|LT|LTS)\b/gi
      let coincidencia: RegExpExecArray | null

      while ((coincidencia = regexCantidadUnidad.exec(lineas[indiceCantidades])) !== null) {
        cantidades.push({
          cantidad: Number(coincidencia[1].replace(',', '.')),
          unidad: coincidencia[2],
        })
      }

      // Las descripciones se leen en el mismo orden que códigos y cantidades.
      const descripciones: string[] = []
      for (let i = indiceCantidades + 1; i < lineas.length && descripciones.length < cantidades.length; i++) {
        const descripcion = limpiarDescripcion(lineas[i])
        if (!descripcion || /^\d+$/.test(descripcion)) continue
        if (/^(PROYECTO|COG|PRECIO|IMPORTE|SUBTOTAL|TOTAL|FONDOS|DIRECCION|DE INGRESOS)\b/.test(descripcion)) break
        descripciones.push(descripcion)
        lineasProcesadas.add(i)
      }

      if (
        codigos.length === cantidades.length &&
        cantidades.length === descripciones.length
      ) {
        lineasProcesadas.add(indiceCantidades)

        for (let i = 0; i < cantidades.length; i++) {
          const codigoPDF = codigos[i]
          const cantidad = cantidades[i].cantidad
          const descripcionPDF = descripciones[i]

          if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000) continue
          if (descripcionPDF.length < 3) continue

          let productoExistente = productosDB?.find(producto => producto.sku === codigoPDF)
          if (!productoExistente) {
            const resultados = fuse.search(descripcionPDF)
            if (resultados.length > 0) productoExistente = resultados[0].item
          }

          const nombre = formatearNombre(descripcionPDF)
          itemsDetectados.push({
            codigo_pdf: codigoPDF,
            cantidad,
            descripcion_pdf: nombre,
            producto_id: codigoPDF,
            producto_nombre: nombre,
            existe_en_bd: !!productoExistente,
            id_bd: productoExistente?.id || null,
          })
        }
      }
    }
  }

  for (let indice = 0; indice < lineas.length; indice++) {
    if (lineasProcesadas.has(indice)) continue
    const lineaTrim = lineas[indice].trim()
    if (!lineaTrim) continue

    let codigoPDF = ''
    let cantidad = 0
    let descripcionPDF = ''

    const formal = lineaTrim.match(regexFormal)

    if (formal) {
      codigoPDF = formal[1]
      cantidad = Number(formal[2].replace(',', '.'))
      descripcionPDF = formal[4]
    } else {
      const alternativo = lineaTrim.match(regexAlternativo)

      if (!alternativo) continue

      codigoPDF = alternativo[1] || ''
      cantidad = Number(alternativo[2].replace(',', '.'))
      descripcionPDF = alternativo[4]
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
