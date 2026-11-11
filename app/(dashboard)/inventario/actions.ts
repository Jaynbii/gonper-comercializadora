'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizarUnidad } from '@/utils/unidades'
import { generarNuevoSku } from '@/utils/supabase/server' // NUEVO IMPORT

export async function crearProducto(formData: FormData) {
  const supabase = await createClient()

  // Quitamos la lectura del SKU del formulario
  const nombre = formData.get('nombre') as string
  const categoria_id = formData.get('categoria_id') as string
  const unidad_medida = normalizarUnidad(formData.get('unidad_medida') as string) || null
  // Sin precio_unitario a propósito: el precio lo manda el proveedor
  // (producto_proveedores) y en Inventario solo se duplicaba. La
  // columna sigue en la base de datos; aquí ya no se escribe.
  const stock_actual = parseFloat(formData.get('stock_actual') as string) || 0
  const stock_minimo = parseFloat(formData.get('stock_minimo') as string) || 0

  // GENERAMOS EL SKU AUTOMÁTICAMENTE (ARTXXXX)
  const sku = await generarNuevoSku(supabase)

  const { error } = await supabase.from('productos').insert({
    sku, // Usamos el SKU generado
    nombre, 
    categoria_id: categoria_id || null, 
    unidad_medida, 
    stock_actual, 
    stock_minimo
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

  // Quitamos también la lectura del SKU
  const nombre = formData.get('nombre') as string
  const categoria_id = formData.get('categoria_id') as string
  const unidad_medida = normalizarUnidad(formData.get('unidad_medida') as string) || null
  // Sin precio_unitario: ver crearProducto.
  const stock_actual = parseFloat(formData.get('stock_actual') as string) || 0
  const stock_minimo = parseFloat(formData.get('stock_minimo') as string) || 0

  // EL SKU YA NO SE ACTUALIZA (es inmutable)
  const { error } = await supabase.from('productos').update({
    nombre, 
    categoria_id: categoria_id || null, 
    unidad_medida, 
    stock_actual, 
    stock_minimo
  }).eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/inventario')
  return { success: true }
}

export async function eliminarProducto(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('productos').delete().eq('id', id)
  
  if (error) {
    if (error.code === '23503') return { error: 'No se puede eliminar porque este producto ya está en una o más requisiciones.' }
    return { error: error.message }
  }

  revalidatePath('/inventario')
  return { success: true }
}