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

export async function procesarTextoOrden(textoCrudo: string) {
  const supabase = await createClient()
  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const productos = (productosDB ?? []) as ProductoDB[]
  const porSku = new Map(productos.map((producto) => [producto.sku, producto]))
  const fuse = new Fuse(productos, {
    keys: ['nombre'],
    threshold: 0.45,
    ignoreLocation: true,
    includeScore: true,
  })

  const { items, lineasNoReconocidas } = parseRequisicion(textoCrudo)

  const detectados = items.map((item) => {
    // El SKU es la identidad. La coincidencia por nombre solo se ofrece como
    // sugerencia y nunca asigna el producto automáticamente.
    const existente = porSku.get(item.codigo_pdf)
    let sugerencia: Sugerencia | null = null

    if (!existente) {
      const mejor = fuse.search(item.descripcion_pdf)[0]
      if (mejor && (mejor.score ?? 1) <= 0.45) {
        sugerencia = {
          id: mejor.item.id,
          sku: mejor.item.sku,
          nombre: mejor.item.nombre,
          unidad_medida: mejor.item.unidad_medida,
        }
      }
    }

    const nombre = existente?.nombre || formatearNombre(item.descripcion_pdf)

    return {
      codigo_pdf: item.codigo_pdf,
      cantidad: item.cantidad,
      unidad:
        normalizarUnidad(existente?.unidad_medida) || item.unidad || '',
      descripcion_pdf: nombre,
      producto_nombre: nombre,
      existe_en_bd: !!existente,
      id_bd: existente?.id || null,
      sugerencia,
    }
  })

  return {
    success: true as const,
    items: detectados,
    lineasNoReconocidas,
  }
}
