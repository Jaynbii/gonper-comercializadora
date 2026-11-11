'use server'

import { createClient } from '@/utils/supabase/server'
import { vincularItems, type ProductoCatalogo } from '@/utils/vincularProductos'
import {
  construirCuerpoGemini,
  parsearRespuestaGemini,
} from '@/utils/geminiExtraccion'
import { crearLimiteUso } from '@/utils/limiteUso'

// Lectura de la foto de una requisición con Gemini (la que ya usa el
// generador de títulos de Patología Oscura): el modelo lee la imagen
// y devuelve los artículos en JSON, y aquí se cotejan con el catálogo
// igual que con el texto del OCR. Vive en su propio archivo, separado
// del flujo actual: si la IA falla (sin llave, sin red, foto
// ilegible) devuelve null y el cliente sigue con Tesseract. Los PDF
// no pasan por aquí: los de texto los lee pdfjs y los escaneados
// siguen con OCR.
const MODELO_GEMINI = 'gemini-3.5-flash-lite'
const TAMANO_MAXIMO_IMAGEN = 10 * 1024 * 1024
const TIPOS_IMAGEN_ACEPTADOS = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Freno suave contra bucles o doble envio de fotos a Gemini
// (10 por minuto y por usuario). En serverless el contador vive en
// memoria por instancia: no es un control global exacto, pero corta
// el abuso accidental; al excederlo se devuelve null y el cliente
// sigue con Tesseract, sin romper el flujo.
const limiteGemini = crearLimiteUso(10, 60_000)

export async function extraerItemsConGemini(pdfPath: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GEMINI_API_KEY no configurada: se usa Tesseract.')
    return null
  }
  if (!pdfPath || typeof pdfPath !== 'string') return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  if (!limiteGemini.permitir(`gemini:${user.id}`, Date.now())) return null

  const { data: firmado, error: errorFirma } = await supabase.storage
    .from('pdf-facturas')
    .createSignedUrl(pdfPath, 300)
  if (errorFirma || !firmado) return null

  const respuestaImagen = await fetch(firmado.signedUrl)
  if (!respuestaImagen.ok) return null

  const mimeType = (respuestaImagen.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!TIPOS_IMAGEN_ACEPTADOS.has(mimeType)) return null

  const bytes = await respuestaImagen.arrayBuffer()
  if (bytes.byteLength === 0 || bytes.byteLength > TAMANO_MAXIMO_IMAGEN) {
    return null
  }
  const base64 = Buffer.from(bytes).toString('base64')

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), 30_000)

  let respuestaGemini: Response
  try {
    respuestaGemini = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(construirCuerpoGemini(mimeType, base64)),
        signal: controlador.signal,
      },
    )
  } catch {
    return null
  } finally {
    clearTimeout(temporizador)
  }

  if (!respuestaGemini.ok) {
    console.warn(
      'Gemini respondió',
      respuestaGemini.status,
      'al leer la foto; se usa Tesseract.',
    )
    return null
  }

  const datos = (await respuestaGemini.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const texto = datos.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const items = parsearRespuestaGemini(texto)
  if (items.length === 0) return null

  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida, codigo_sat')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const productos = (productosDB ?? []) as ProductoCatalogo[]
  const detectados = vincularItems(items, productos)

  return {
    success: true as const,
    items: detectados,
    lineasNoReconocidas: [] as string[],
  }
}
