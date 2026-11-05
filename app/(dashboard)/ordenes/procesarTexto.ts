'use server'

import { createClient } from '@/utils/supabase/server'
import Fuse from 'fuse.js'
import { parseRequisicion } from '@/utils/requisicion'
import { normalizarUnidad } from '@/utils/unidades'

type ProductoDB = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
  codigo_sat: string | null // 👈 Agregamos esta propiedad
}

type Sugerencia = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
}

function formatearNombre(str: string) {
  if (!str) return str
  return str
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase())
}

// Función para limpiar palabras comunes que ensucian la búsqueda
function limpiarParaBusqueda(texto: string) {
  return texto
    .toUpperCase()
    .replace(/\b(DE|DEL|LA|EL|LOS|LAS|EN|CON|PARA|Y)\b/g, '')
    .replace(/[.,#/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function procesarTextoOrden(textoCrudo: string) {
  const supabase = await createClient()
  
  // 👇 AHORA SELECCIONAMOS EL CODIGO SAT TAMBIÉN
  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida, codigo_sat')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const productos = (productosDB ?? []) as ProductoDB[]
  
  // Mapas para búsqueda rápida
  const porSku = new Map(productos.map((producto) => [producto.sku, producto]))
  const porSat = new Map(productos.filter(p => p.codigo_sat).map((producto) => [producto.codigo_sat, producto]))
  
  const fuse = new Fuse(productos.map(p => ({
    ...p,
    nombreLimpio: limpiarParaBusqueda(p.nombre)
  })), {
    keys: ['nombreLimpio'],
    threshold: 0.35, 
    ignoreLocation: true,
    includeScore: true,
  })

  const { items, lineasNoReconocidas } = parseRequisicion(textoCrudo)

  const detectados = items.map((item) => {
    // 1. Buscamos coincidencia exacta por CÓDIGO SAT
    const existentePorSat = porSat.get(item.codigo_pdf)
    // 2. Si no, buscamos por SKU interno (por si acaso)
    const existentePorSku = porSku.get(item.codigo_pdf)
    
    let sugerencia: Sugerencia | null = null
    let productoFinal = existentePorSat || existentePorSku

    // 3. Si no hay coincidencia por código, buscamos por nombre
    if (!productoFinal) {
      const descripcionLimpia = limpiarParaBusqueda(item.descripcion_pdf)
      const mejor = fuse.search(descripcionLimpia)[0]

      if (mejor) {
        const score = mejor.score ?? 1
        // Si la coincidencia es MUY buena (score <= 0.25), lo auto-vinculamos
        if (score <= 0.25) {
          productoFinal = mejor.item
        } 
        // Si la coincidencia es buena (score <= 0.35), lo mostramos como sugerencia
        else if (score <= 0.35) {
          sugerencia = {
            id: mejor.item.id,
            sku: mejor.item.sku,
            nombre: mejor.item.nombre,
            unidad_medida: mejor.item.unidad_medida,
          }
        }
      }
    }

    const nombre = productoFinal?.nombre || formatearNombre(item.descripcion_pdf)

    return {
      codigo_pdf: item.codigo_pdf,
      cantidad: item.cantidad,
      unidad: normalizarUnidad(productoFinal?.unidad_medida) || item.unidad || '',
      descripcion_pdf: nombre,
      producto_nombre: nombre,
      existe_en_bd: !!productoFinal,
      id_bd: productoFinal?.id || null,
      sugerencia,
    }
  })

  return {
    success: true as const,
    items: detectados,
    lineasNoReconocidas,
  }
}