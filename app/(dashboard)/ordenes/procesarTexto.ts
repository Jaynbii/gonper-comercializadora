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
  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const productos = (productosDB ?? []) as ProductoDB[]
  const porSku = new Map(productos.map((producto) => [producto.sku, producto]))
  
  // Mejoramos Fuse para que busque sobre nombres limpios
  const fuse = new Fuse(productos.map(p => ({
    ...p,
    nombreLimpio: limpiarParaBusqueda(p.nombre)
  })), {
    keys: ['nombreLimpio'],
    threshold: 0.35, // Más estricto para evitar falsos positivos (0.0 es exacto, 1.0 es cualquier cosa)
    ignoreLocation: true,
    includeScore: true,
  })

  const { items, lineasNoReconocidas } = parseRequisicion(textoCrudo)

  const detectados = items.map((item) => {
    // 1. Buscamos coincidencia exacta por SKU
    const existentePorSku = porSku.get(item.codigo_pdf)
    let sugerencia: Sugerencia | null = null
    let productoFinal = existentePorSku

    // 2. Si no hay SKU exacto, buscamos por nombre
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