'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  generarFolioRequisicion,
  siguienteConsecutivo,
} from '@/utils/folioRequisicion'

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

    // 4. Generar folio para la requisición: REQ-0001, REQ-0002...
    // con CONSECUTIVO GLOBAL en orden de creación, nunca se repite
    // (Fase 1b, decisión de Alex). Las viejas conservan su folio
    // ORD-... hasta que se corra la migración. Si dos subidas chocan
    // en el mismo folio (único en BD), se reintenta con el siguiente.
    const { data: foliosReq } = await supabase
      .from('ordenes')
      .select('folio')
      .like('folio', 'REQ-%')
    let consecutivo = siguienteConsecutivo(
      (foliosReq || []).map((f: { folio: string }) => f.folio),
    )

    // 5. Crear la requisición en la base de datos guardando SOLO LA RUTA (pdf_path)
    let folio = generarFolioRequisicion(consecutivo)
    let insertado = false
    let dbError: { code?: string; message: string } | null = null
    for (let intento = 0; intento < 5 && !insertado; intento++) {
      const { error } = await supabase.from('ordenes').insert({
        folio,
        cliente_id,
        pdf_path: nombreArchivo, // 👈 Aquí se guarda la ruta del archivo
        estado: 'BORRADOR',
        created_by: user.id,
      })
      if (!error) {
        insertado = true
        break
      }
      // 23505 = folio duplicado (único): probar el siguiente número.
      if (error.code === '23505') {
        consecutivo += 1
        folio = generarFolioRequisicion(consecutivo)
        dbError = error
        continue
      }
      dbError = error
      break
    }

    if (!insertado) {
      console.error('Error DB:', dbError)
      return {
        error: `Error al crear la requisición en la base de datos: ${dbError?.message}`,
      }
    }

    // 6. Refrescar la lista de requisiciones para que aparezca la nueva
    revalidatePath('/ordenes')
    return { success: true }

  } catch (err: unknown) {
    console.error('Error inesperado:', err)
    return { error: 'Ocurrió un error inesperado en el servidor.' }
  }
}