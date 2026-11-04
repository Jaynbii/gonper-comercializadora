'use server'

import { createClient } from '@/utils/supabase/server'
import { extractText, getDocumentProxy } from 'unpdf'

/**
 * Extrae la capa de texto de un PDF. Es mucho más rápido que pasar el PDF
 * completo por Tesseract; si el PDF es escaneado y no tiene texto, el cliente
 * cae automáticamente al OCR.
 */
export async function extraerTextoDelPDF(pdfPath: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autorizado')

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('pdf-facturas')
      .download(pdfPath)

    if (downloadError || !fileData) throw new Error('No se pudo descargar el PDF.')

    const arrayBuffer = await fileData.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer))
    const { text } = await extractText(pdf, { mergePages: true })

    const textoExtraido = Array.isArray(text) ? text.join('\n') : text
    return { success: true as const, textoExtraido }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
