'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function subirYProcesarPDF(formData: FormData) {
  try {
    const supabase = await createClient()

    const file = formData.get('pdf') as File
    const cliente_id = formData.get('cliente_id') as string

    if (!file || !cliente_id) {
      return { error: 'Faltan datos obligatorios (PDF o Cliente).' }
    }

    // 1. Obtener el usuario actual (Zero Trust)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado. Inicia sesión nuevamente.' }

    // 2. Generar nombre único para el archivo
    const timestamp = new Date().getTime()
    const nombreArchivo = `${timestamp}_${file.name.replace(/\s+/g, '_')}`

    // 3. Subir el archivo al bucket privado 'pdf-facturas'
    const { error: uploadError } = await supabase.storage
      .from('pdf-facturas') 
      .upload(nombreArchivo, file)

    if (uploadError) {
      console.error('Error Storage:', uploadError)
      return { error: 'Fallo al subir PDF a Supabase. Revisa la terminal.' }
    }

    // 4. Generar folio para la orden
    const folio = `ORD-${timestamp.toString().slice(-6)}`

    // 5. Crear la orden en la base de datos guardando SOLO LA RUTA (pdf_path)
    const { error: dbError } = await supabase
      .from('ordenes')
      .insert({
        folio,
        cliente_id,
        pdf_path: nombreArchivo, // 👈 Aquí se guarda la ruta del archivo
        estado: 'BORRADOR',
        created_by: user.id
      })

    if (dbError) {
      console.error('Error DB:', dbError)
      return { error: `Error al crear la orden en la base de datos: ${dbError.message}` }
    }

    // 6. Refrescar la lista de órdenes para que aparezca la nueva
    revalidatePath('/ordenes')
    return { success: true }

  } catch (err: any) {
    console.error('Error inesperado:', err)
    return { error: 'Ocurrió un error inesperado en el servidor.' }
  }
}