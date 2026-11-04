'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizarUnidad } from '@/utils/unidades'

export async function crearProducto(formData: FormData) {
  const supabase = await createClient()

  const sku = formData.get('sku') as string
  const nombre = formData.get('nombre') as string
  const categoria_id = formData.get('categoria_id') as string
  const unidad_medida = normalizarUnidad(formData.get('unidad_medida') as string) || null
  const precio_unitario = parseFloat(formData.get('precio_unitario') as string) || 0
  const stock_actual = parseFloat(formData.get('stock_actual') as string) || 0
  const stock_minimo = parseFloat(formData.get('stock_minimo') as string) || 0

  const { error } = await supabase.from('productos').insert({
    sku, nombre, categoria_id: categoria_id || null, unidad_medida, precio_unitario, stock_actual, stock_minimo
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ya existe un producto con este SKU.' }
    return { error: error.message }
  }

  revalidatePath('/inventario')
  return { success: true }
}

export async function actualizarProducto(id: string, formData: FormData) {
  const supabase = await createClient()

  const sku = formData.get('sku') as string
  const nombre = formData.get('nombre') as string
  const categoria_id = formData.get('categoria_id') as string
  const unidad_medida = normalizarUnidad(formData.get('unidad_medida') as string) || null
  const precio_unitario = parseFloat(formData.get('precio_unitario') as string) || 0
  const stock_actual = parseFloat(formData.get('stock_actual') as string) || 0
  const stock_minimo = parseFloat(formData.get('stock_minimo') as string) || 0

  const { error } = await supabase.from('productos').update({
    sku, nombre, categoria_id: categoria_id || null, unidad_medida, precio_unitario, stock_actual, stock_minimo
  }).eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'El SKU ya está en uso por otro producto.' }
    return { error: error.message }
  }

  revalidatePath('/inventario')
  return { success: true }
}

export async function eliminarProducto(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('productos').delete().eq('id', id)
  
  if (error) {
    if (error.code === '23503') return { error: 'No se puede eliminar porque este producto ya está en una o más órdenes.' }
    return { error: error.message }
  }

  revalidatePath('/inventario')
  return { success: true }
}