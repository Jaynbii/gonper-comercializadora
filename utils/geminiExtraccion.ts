import type { ItemRequisicion } from './requisicion.ts'
import { normalizarUnidad, UNIDADES_COMUNES } from './unidades.ts'

// Lectura de fotos de requisiciones con Gemini (gemini-3.5-flash-lite).
// El modelo lee la imagen directamente y devuelve los artículos en
// JSON; este módulo solo arma el cuerpo de la petición y valida la
// respuesta. La llamada a la API vive en el Server Action
// extraerItemsConGemini (procesarTexto.ts), donde está la llave.

export const PROMPT_EXTRACCION_REQUISICION = `Eres un lector de requisiciones de compra del municipio de Mazatlán. La imagen es una foto o escaneo de una requisición (tabla o lista de artículos). Extrae SOLO los artículos solicitados.

Devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, con esta forma exacta:
{"items":[{"codigo_pdf":"código tal como aparece, o cadena vacía si no se ve","cantidad":número,"unidad":"una de ${UNIDADES_COMUNES.join(', ')}, según se vea en la imagen, o PIEZA si no hay","descripcion_pdf":"nombre del artículo en MAYÚSCULAS"}]}

Reglas:
- cantidad como número; las fracciones (½, 1/4) como decimal (0.5, 0.25).
- La unidad va en singular y mayúsculas, elegida de la lista del JSON; nunca inventes otra unidad (ni plurales como "porrones").
- Ignora encabezados, totales, precios, importes, firmas, sellos y observaciones.
- No inventes artículos, códigos ni cantidades: solo lo que se lea en la imagen.
- Si un artículo se lee a medias, inclúyelo con lo que se alcance a leer.
- Si no hay artículos legibles, devuelve {"items":[]}.`

export function construirCuerpoGemini(mimeType: string, datosBase64: string) {
  return {
    contents: [
      {
        parts: [
          { text: PROMPT_EXTRACCION_REQUISICION },
          { inline_data: { mime_type: mimeType, data: datosBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
      maxOutputTokens: 4096,
    },
  }
}

function extraerJson(texto: string): unknown | null {
  const limpio = texto.replace(/```(?:json)?/gi, '').trim()
  try {
    return JSON.parse(limpio)
  } catch {
    // El modelo a veces envuelve el JSON en una frase: se rescata
    // del primer { al último }.
    const inicio = limpio.indexOf('{')
    const fin = limpio.lastIndexOf('}')
    if (inicio < 0 || fin <= inicio) return null
    try {
      return JSON.parse(limpio.slice(inicio, fin + 1))
    } catch {
      return null
    }
  }
}

export function parsearRespuestaGemini(texto: string): ItemRequisicion[] {
  const datos = extraerJson(texto ?? '')
  if (!datos || typeof datos !== 'object') return []

  const lista = (datos as { items?: unknown }).items
  if (!Array.isArray(lista)) return []

  const items: ItemRequisicion[] = []
  for (const crudo of lista) {
    if (!crudo || typeof crudo !== 'object') continue
    const fila = crudo as Record<string, unknown>

    const descripcion = String(fila.descripcion_pdf ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!descripcion) continue

    const cantidad = Number(fila.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue

    items.push({
      codigo_pdf: String(fila.codigo_pdf ?? '').trim(),
      cantidad,
      unidad: normalizarUnidad(String(fila.unidad ?? '')),
      descripcion_pdf: descripcion.toUpperCase(),
    })
    if (items.length >= 200) break
  }
  return items
}
