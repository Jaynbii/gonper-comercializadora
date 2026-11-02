'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearProveedor(formData: FormData) {
  const supabase = await createClient()
  const nombre = formData.get('nombre') as string
  const telefono = formData.get('telefono') as string
  const correo = formData.get('correo') as string

  if (!nombre) return { error: 'El nombre es obligatorio' }

  const { data, error } = await supabase.from('proveedores').insert({
    nombre, telefono: telefono || null, correo: correo || null
  }).select().single()

  if (error) {
    if (error.code === '23505') return { error: 'Ya existe un proveedor con ese nombre.' }
    return { error: error.message }
  }
  
  revalidatePath('/proveedores')
  return { success: true, proveedor: data }
}

export async function actualizarProveedor(id: string, formData: FormData) {
  const supabase = await createClient()
  const nombre = formData.get('nombre') as string
  const telefono = formData.get('telefono') as string
  const correo = formData.get('correo') as string

  if (!nombre) return { error: 'El nombre es obligatorio' }

  const { error } = await supabase.from('proveedores').update({
    nombre, telefono: telefono || null, correo: correo || null
  }).eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Ya existe otro proveedor con ese nombre.' }
    return { error: error.message }
  }

  revalidatePath('/proveedores')
  return { success: true }
}

export async function eliminarProveedor(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').delete().eq('id', id)
  if (error) return { error: 'No se puede eliminar el proveedor porque tiene historial.' }
  revalidatePath('/proveedores')
  return { success: true }
}

// --- GESTIÓN DE PRECIOS (RELACIÓN) ---

export async function asignarPrecioAProducto(proveedorId: string, productoId: string, precio: number) {
  const supabase = await createClient()
  
  const { data: productoExiste } = await supabase.from('productos').select('id').eq('id', productoId).single()
  if (!productoExiste) return { error: 'El producto seleccionado no existe en el inventario.' }

  const { data: yaAsignado } = await supabase.from('producto_proveedores')
    .select('id').eq('proveedor_id', proveedorId).eq('producto_id', productoId).maybeSingle()

  if (yaAsignado) return { error: 'Este producto ya tiene un precio registrado con este proveedor.' }

  // 👇 Agregamos .select().single() para obtener el ID de la relación recién creada
  const { data: nuevaRelacion, error } = await supabase.from('producto_proveedores').insert({
    proveedor_id: proveedorId,
    producto_id: productoId,
    precio_unitario: precio
  }).select().single()

  if (error) return { error: error.message }

  revalidatePath('/proveedores')
  return { success: true, id: nuevaRelacion.id } // Devolvemos el ID
}

export async function actualizarPrecioProducto(idRelacion: string, nuevoPrecio: number) {
  const supabase = await createClient()
  const { error } = await supabase.from('producto_proveedores').update({ precio_unitario: nuevoPrecio }).eq('id', idRelacion)
  if (error) return { error: error.message }
  revalidatePath('/proveedores')
  return { success: true }
}

export async function quitarProductoAProveedor(idRelacion: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('producto_proveedores').delete().eq('id', idRelacion)
  if (error) return { error: error.message }
  revalidatePath('/proveedores')
  return { success: true }
}