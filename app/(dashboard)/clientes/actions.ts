'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearCliente(formData: FormData) {
  const supabase = await createClient()
  const nombre = formData.get('nombre') as string
  const contacto_nombre = formData.get('contacto_nombre') as string
  const telefono = formData.get('telefono') as string
  const direccion = formData.get('direccion') as string

  if (!nombre) return { error: 'El nombre del cliente es obligatorio' }

  // Agregamos .select().single() para que nos devuelva el cliente recién creado
  const { data, error } = await supabase.from('clientes').insert({
    nombre, contacto_nombre: contacto_nombre || null, telefono: telefono || null, direccion: direccion || null
  }).select().single()

  if (error) {
    if (error.code === '23505') return { error: 'Ya existe un cliente con ese nombre' }
    return { error: error.message }
  }

  revalidatePath('/clientes')
  revalidatePath('/ordenes/nueva')
  
  // Devolvemos el cliente para que el frontend lo agregue a la lista
  return { success: true, cliente: data }
}

export async function actualizarCliente(id: string, formData: FormData) {
  const supabase = await createClient()
  const nombre = formData.get('nombre') as string
  const contacto_nombre = formData.get('contacto_nombre') as string
  const telefono = formData.get('telefono') as string
  const direccion = formData.get('direccion') as string

  if (!nombre) return { error: 'El nombre del cliente es obligatorio' }

  const { error } = await supabase.from('clientes').update({
    nombre, contacto_nombre: contacto_nombre || null, telefono: telefono || null, direccion: direccion || null
  }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/clientes')
  revalidatePath('/ordenes/nueva')
  return { success: true }
}

export async function eliminarCliente(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  
  if (error) {
    if (error.code === '23503') return { error: 'No se puede eliminar porque tiene requisiciones asociadas.' }
    return { error: error.message }
  }

  revalidatePath('/clientes')
  return { success: true }
}