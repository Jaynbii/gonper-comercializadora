'use server'

import { createClient } from '@/utils/supabase/server'
import { parseRequisicion } from '@/utils/requisicion'
import { vincularItems, type ProductoCatalogo } from '@/utils/vincularProductos'

export async function procesarTextoOrden(textoCrudo: string) {
  const supabase = await createClient()

  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida, codigo_sat')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const productos = (productosDB ?? []) as ProductoCatalogo[]

  const { items, lineasNoReconocidas } = parseRequisicion(textoCrudo)

  // La vinculación artículo → producto del catálogo vive en
  // utils/vincularProductos.ts (probada con la Factura A570): el código
  // SAT es una clase, no la identidad del producto, así que una
  // coincidencia por código solo se confía cuando el nombre también
  // concuerda; si no, el artículo queda sin vincular y conserva SU
  // descripción del PDF.
  const detectados = vincularItems(items, productos)

  return {
    success: true as const,
    items: detectados,
    lineasNoReconocidas,
  }
}

// El catálogo para volver a cotejar en el modal: el cotejo inicial lo
// hace procesarTextoOrden, pero si el usuario corrige el nombre a mano
// la fila debe cotejarse de nuevo sin volver a leer el archivo. El
// modal carga el catálogo una sola vez (lo guarda en caché) y coteja
// en el cliente con el mismo vincularItems.
export async function obtenerCatalogoProductos() {
  const supabase = await createClient()

  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida, codigo_sat')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  return (productosDB ?? []) as ProductoCatalogo[]
}
