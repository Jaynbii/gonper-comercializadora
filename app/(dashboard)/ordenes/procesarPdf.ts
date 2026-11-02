'use server'
import { createClient } from '@/utils/supabase/server'
import { extractText, getDocumentProxy } from 'unpdf'

export async function extraerTextoDelPDF(ordenId: string, pdfPath: string) {
  try {
    const supabase = await createClient()
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('pdf-facturas')
      .download(pdfPath)

    if (downloadError || !fileData) throw new Error('No se pudo descargar el PDF.')

    const arrayBuffer = await fileData.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer))
    const { text } = await extractText(pdf, { mergePages: true })

    return { success: true, textoExtraido: text }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}