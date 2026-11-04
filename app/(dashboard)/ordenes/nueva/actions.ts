'use server'

import { randomUUID } from 'crypto'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearUrlSubidaPDF(nombreOriginal: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'No autorizado. Inicia sesión nuevamente.' }
    }

    if (typeof nombreOriginal !== 'string' || !nombreOriginal.trim()) {
      return { error: 'El nombre del archivo no es válido.' }
    }

    const nombreSeguro = nombreOriginal
      .split(/[\\/]/)
      .pop()!
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-100)

    if (!nombreSeguro || !/\.(pdf|jpe?g|png|gif|webp)$/i.test(nombreSeguro)) {
      return { error: 'El archivo debe ser un PDF o una imagen válida.' }
    }

    const nombreArchivo = `${Date.now()}_${randomUUID()}_${nombreSeguro}`

    const { data, error } = await supabase.storage
      .from('pdf-facturas')
      .createSignedUploadUrl(nombreArchivo)

    if (error || !data) {
      console.error('Error al generar URL de subida:', error)
      return { error: 'No se pudo preparar la subida del archivo. Inténtalo nuevamente.' }
    }

    return {
      success: true,
      path: data.path,
      token: data.token,
    }
  } catch (err: unknown) {
    console.error('Error al preparar la subida:', err)
    return { error: 'Ocurrió un error al preparar la subida del archivo.' }
  }
}

export async function registrarOrdenConPDF(cliente_id: string, pdfPath: string) {
  const supabase = await createClient()
  let rutaArchivo: string | null = null

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'No autorizado. Inicia sesión nuevamente.' }
    }

    if (!cliente_id || typeof cliente_id !== 'string') {
      return { error: 'Debes seleccionar un cliente.' }
    }

    // La ruta debe ser un nombre generado por el servidor, sin carpetas ni rutas externas.
    if (
      typeof pdfPath !== 'string' ||
      pdfPath.includes('/') ||
      !/^\d+_[a-f0-9-]+_[a-zA-Z0-9._-]+$/i.test(pdfPath)
    ) {
      return { error: 'La ruta del archivo no es válida.' }
    }

    rutaArchivo = pdfPath

    // Verificar que el archivo realmente exista en el bucket antes de registrar la orden.
    const { error: verificacionError } = await supabase.storage
      .from('pdf-facturas')
      .createSignedUrl(rutaArchivo, 60)

    if (verificacionError) {
      console.error('No se encontró el archivo subido:', verificacionError)
      return { error: 'El archivo no se encontró en el almacenamiento. Vuelve a subirlo.' }
    }

    const timestamp = Date.now()
    const folio = `ORD-${timestamp.toString().slice(-6)}`

    const { error: dbError } = await supabase
      .from('ordenes')
      .insert({
        folio,
        cliente_id,
        pdf_path: rutaArchivo,
        estado: 'BORRADOR',
        created_by: user.id,
      })

    if (dbError) {
      console.error('Error DB:', dbError)
      await supabase.storage.from('pdf-facturas').remove([rutaArchivo])
      return { error: `Error al crear la orden en la base de datos: ${dbError.message}` }
    }

    revalidatePath('/ordenes')
    return { success: true }
  } catch (err: unknown) {
    console.error('Error inesperado al registrar la orden:', err)
    if (rutaArchivo) {
      await supabase.storage.from('pdf-facturas').remove([rutaArchivo])
    }
    return { error: 'Ocurrió un error inesperado al registrar la orden.' }
  }
}
