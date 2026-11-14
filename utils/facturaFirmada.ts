// Foto de la factura firmada y sellada como comprobante de entrega.
//
// La requisición SIGUE en estado ENTREGADA ("surtida"): la foto y su
// fecha son campos aparte (factura_firmada_path / factura_firmada_en),
// para reportes después. Sin cambios al enum de estado ni a la RPC
// de surtido.

/** Tipos de imagen que acepta la foto de la factura firmada. */
export const TIPOS_FOTO_FIRMADA = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Peso máximo de la foto: 10 MB (mismo tope que la lectura con IA). */
export const TAMANO_MAXIMO_FOTO_FIRMADA = 10 * 1024 * 1024

/**
 * Valida la foto antes de subirla. Devuelve el mensaje de error en
 * palabras simples, o null si la foto es válida.
 */
export function validarFotoFirmada(
  archivo: { type: string; size: number } | null | undefined,
): string | null {
  if (!archivo) {
    return 'Toma o elige la foto de la factura firmada y sellada.'
  }
  if (!(TIPOS_FOTO_FIRMADA as readonly string[]).includes(archivo.type)) {
    return 'La foto debe ser JPG, PNG o WebP.'
  }
  if (archivo.size <= 0) {
    return 'La foto está vacía. Toma otra.'
  }
  if (archivo.size > TAMANO_MAXIMO_FOTO_FIRMADA) {
    return 'La foto pesa más de 10 MB. Toma otra con menos peso.'
  }
  return null
}

/**
 * Ruta en el bucket pdf-facturas para la foto firmada. El prefijo
 * `firmadas/` la separa de los PDF de requisición; el timestamp evita
 * choques si se sube dos veces la misma foto.
 */
export function construirRutaFacturaFirmada(
  ordenId: string,
  nombreArchivo: string,
  ahoraMs: number = Date.now(),
): string {
  const limpio =
    nombreArchivo
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9._-]/g, '') || 'foto.jpg'
  return `firmadas/${ordenId}_${ahoraMs}_${limpio}`
}

/** True cuando la orden ya tiene foto de factura firmada. */
export function tieneFacturaFirmada(orden: {
  factura_firmada_path?: string | null
} | null | undefined): boolean {
  return Boolean(orden?.factura_firmada_path)
}
