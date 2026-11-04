export const UNIDADES_COMUNES = [
  'PIEZA',
  'CAJA',
  'BULTO',
  'PAQUETE',
  'BOLSA',
  'METRO',
  'LITRO',
  'GALON',
  'KILO',
  'DOCENA',
  'ROLLO',
  'SACO',
  'TONELADA',
  'TAMBOR',
  'CUBETA',
  'PORRON',
] as const

/**
 * Alias que aparecen en los requerimientos (incluyendo plurales y
 * abreviaturas que suele producir el OCR). Todos se guardan en singular.
 */
const ALIAS: Record<string, string> = {
  PIEZA: 'PIEZA',
  PIEZAS: 'PIEZA',
  PZA: 'PIEZA',
  PZAS: 'PIEZA',
  PZ: 'PIEZA',
  CAJA: 'CAJA',
  CAJAS: 'CAJA',
  CJ: 'CAJA',
  CJAS: 'CAJA',
  BULTO: 'BULTO',
  BULTOS: 'BULTO',
  PAQUETE: 'PAQUETE',
  PAQUETES: 'PAQUETE',
  PAQ: 'PAQUETE',
  PAQS: 'PAQUETE',
  BOLSA: 'BOLSA',
  BOLSAS: 'BOLSA',
  METRO: 'METRO',
  METROS: 'METRO',
  MTS: 'METRO',
  MT: 'METRO',
  M: 'METRO',
  LITRO: 'LITRO',
  LITROS: 'LITRO',
  LTS: 'LITRO',
  LT: 'LITRO',
  L: 'LITRO',
  GALON: 'GALON',
  GALONES: 'GALON',
  GAL: 'GALON',
  GALS: 'GALON',
  GLN: 'GALON',
  KILO: 'KILO',
  KILOS: 'KILO',
  KGS: 'KILO',
  KG: 'KILO',
  DOCENA: 'DOCENA',
  DOCENAS: 'DOCENA',
  DOC: 'DOCENA',
  ROLLO: 'ROLLO',
  ROLLOS: 'ROLLO',
  SACO: 'SACO',
  SACOS: 'SACO',
  TONELADA: 'TONELADA',
  TONELADAS: 'TONELADA',
  TON: 'TONELADA',
  TAMBOR: 'TAMBOR',
  TAMBORES: 'TAMBOR',
  CUBETA: 'CUBETA',
  CUBETAS: 'CUBETA',
  PORRON: 'PORRON',
  PORRONES: 'PORRON',
  UNIDAD: 'PIEZA',
  UNIDADES: 'PIEZA',
}

/** Devuelve la unidad en singular y mayúsculas, o el texto limpio si no es conocida. */
export function normalizarUnidad(valor: string | null | undefined): string {
  if (!valor) return ''
  const limpio = valor
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
  return ALIAS[limpio] ?? limpio
}

/** Patrón de alternativas para reconocer la unidad dentro de una línea del documento. */
export function patronUnidades(): string {
  return Object.keys(ALIAS)
    .sort((a, b) => b.length - a.length)
    .map((unidad) => unidad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
}
