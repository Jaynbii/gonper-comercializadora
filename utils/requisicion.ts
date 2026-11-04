import { normalizarUnidad, patronUnidades, UNIDADES_COMUNES } from './unidades.ts'

export type ItemRequisicion = {
  codigo_pdf: string
  cantidad: number
  unidad: string
  descripcion_pdf: string
}

export type ResultadoParseo = {
  items: ItemRequisicion[]
  lineasNoReconocidas: string[]
}

const UNIDADES = patronUnidades()

/**
 * Una fila del documento tiene la forma:
 *   CODIGO  CANTIDAD  [UNIDAD]  DESCRIPCION  [PRECIO]  [IMPORTE]
 * El código y la cantidad pueden aparecer en cualquier parte de la línea
 * (el OCR a veces pega el encabezado con la primera fila).
 */
const FILA = new RegExp(
  `(?:^|\\D)(\\d{3,8})\\s+(\\d+(?:[.,]\\d{1,3})?)\\s+((?:${UNIDADES})[.,]?\\s+)?((?!\\d).+)$`,
  'i',
)

const MONEDA_AL_FINAL = /\s+\$?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*$/

const PALABRAS_ENCABEZADO = [
  'CODIGO',
  'CANTIDAD',
  'UNIDAD',
  'DESCRIPCION',
  'PRECIO',
  'IMPORTE',
  'SUBTOTAL',
  'TOTAL',
  'TOTALES',
  'IVA',
  'RFC',
  'FECHA',
  'FOLIO',
  'REQUISICION',
  'REQUISICIONES',
  'DEPARTAMENTO',
  'PROVEEDOR',
  'PROYECTO',
  'FONDOS',
  'POLIZA',
  'MAZATLAN',
  'PAGINA',
  'OFICIO',
  'PARTIDA',
  'ANEXO',
  'OBSERVACIONES',
  'FIRMA',
  'SELLO',
  'CONDICIONES',
]

const PALABRAS_ENCABEZADO_REGEX = new RegExp(
  `\\b(${PALABRAS_ENCABEZADO.join('|')})\\b`,
  'gi',
)

function sinAcentos(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function esLineaInformativa(linea: string) {
  const palabras = sinAcentos(linea).trim().split(/\s+/).filter(Boolean)
  const coincidencias = sinAcentos(linea).match(PALABRAS_ENCABEZADO_REGEX) ?? []

  if (coincidencias.length >= 2) return true
  return coincidencias.length === 1 && palabras.length <= 3
}

function parseCantidad(valor: string): number {
  const limpio = valor.trim()

  if (limpio.includes(',') && limpio.includes('.')) {
    // "2,209.80" es formato de miles; "2.209,80" es formato europeo.
    if (limpio.lastIndexOf(',') < limpio.lastIndexOf('.')) {
      return Number(limpio.replace(/,/g, ''))
    }
    return Number(limpio.replace(/\./g, '').replace(',', '.'))
  }

  if (limpio.includes(',')) {
    const decimales = limpio.split(',')[1] ?? ''
    // "1,000" se interpreta como mil; "3,00" como tres.
    return decimales.length === 3
      ? Number(limpio.replace(',', ''))
      : Number(limpio.replace(',', '.'))
  }

  return Number(limpio)
}

function quitarPreciosFinales(texto: string) {
  let limpio = texto.replace(/\s+/g, ' ').trim()

  // Se quitan únicamente los importes al final de la descripción. Nunca se
  // corta en el primer decimal porque hay descripciones como "BOLSA 1.5 KG"
  // o "JUMBO 12/200 MTS".
  for (let i = 0; i < 2; i++) {
    const siguiente = limpio.replace(MONEDA_AL_FINAL, '').trimEnd()
    if (siguiente === limpio) break
    limpio = siguiente
  }

  return limpio
}

/**
 * Cuando Tesseract conserva los espacios entre columnas, la descripción queda
 * separada de los precios por varios espacios. Si después de ese hueco hay
 * dígitos, la descripción termina ahí.
 */
function recortarColumnasDePrecio(texto: string) {
  const columnas = texto.split(/\s{2,}/)
  if (columnas.length < 2) return texto

  const resto = columnas.slice(1).join(' ')
  return /\d/.test(resto) ? columnas[0] : texto
}

function limpiarDescripcion(texto: string) {
  let limpio = quitarPreciosFinales(recortarColumnasDePrecio(texto))

  limpio = limpio.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/u, '')
  limpio = limpio.replace(/[^\p{L}\p{N}\s/#,.+-]/gu, '')
  limpio = limpio.replace(/\s+/g, ' ').trim()
  limpio = limpio.replace(/^[\s/#,.+-]+|[\s/#,.+-]+$/g, '')

  return limpio.toUpperCase()
}

/**
 * El OCR a veces duplica la unidad al inicio de la descripción con una letra
 * extra ("FPORRON FABULOSO DE 20 LITROS"). Si al quitar esa letra queda una
 * unidad conocida, se usa como unidad y se retira de la descripción.
 */
function separarUnidadAlInicio(descripcion: string, unidad: string) {
  const [primera, ...resto] = descripcion.split(' ')
  if (!primera || primera.length < 4 || resto.length === 0) {
    return { unidad, descripcion }
  }

  const posible = normalizarUnidad(primera.slice(1))
  if (
    !(UNIDADES_COMUNES as readonly string[]).includes(posible) ||
    normalizarUnidad(primera) === posible
  ) {
    return { unidad, descripcion }
  }

  return { unidad: posible, descripcion: resto.join(' ') }
}

const SOLO_CODIGO = /^\d{3,8}$/
const CODIGO_Y_CANTIDAD = /^\d{3,8}\s+\d+(?:[.,]\d{1,3})?$/
const EMPIEZA_CON_CANTIDAD = /^\d+(?:[.,]\d{1,3})?(?:\s+|$)/
const COLA_DE_UNIDAD = new RegExp(
  `^\\d{3,8}\\s+\\d+(?:[.,]\\d{1,3})?\\s+(?:${UNIDADES})[.,]?$`,
  'i',
)

/**
 * Une filas que el OCR partió en dos o tres líneas, por ejemplo:
 *   "13747 3.00"
 *   "CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80"
 */
function unirLineasPartidas(lineas: string[]) {
  let actual = lineas

  for (let pasada = 0; pasada < 3; pasada++) {
    const unidas: string[] = []
    let huboCambio = false

    for (let i = 0; i < actual.length; i++) {
      const linea = actual[i]
      const siguiente = actual[i + 1]

      const seParte =
        !!siguiente &&
        ((SOLO_CODIGO.test(linea) &&
          !SOLO_CODIGO.test(siguiente) &&
          EMPIEZA_CON_CANTIDAD.test(siguiente)) ||
          CODIGO_Y_CANTIDAD.test(linea) ||
          COLA_DE_UNIDAD.test(linea))

      if (seParte) {
        unidas.push(`${linea} ${siguiente}`)
        i++
        huboCambio = true
      } else {
        unidas.push(linea)
      }
    }

    actual = unidas
    if (!huboCambio) break
  }

  return actual
}

function esLineaUtilParaRevision(linea: string) {
  if (linea.length < 3) return false
  if (/^\d{1,4}$/.test(linea)) return false
  if (esLineaInformativa(linea)) return false
  if (!/\p{L}/u.test(linea) && !/\d{3,8}\s+\d{3,8}/.test(linea)) return false
  return true
}

const RE_ENCABEZADO_COLUMNAS = /CODIGO.*CANTIDAD.*UNIDAD.*DESCRIPCION/i
const RE_FIN_BLOQUE = /\b(SUBTOTAL|TOTAL|IVA|FIRMA|OBSERVACIONES|CONDICIONES)\b/i
const RE_SOLO_CODIGOS = /^\d{3,8}(?:\s+\d{3,8})*$/
const RE_CANTIDAD_UNIDAD = new RegExp(
  `(\\d+(?:[.,]\\d{1,3})?)\\s*((?:${UNIDADES})[.,]?)(?=\\s|$)`,
  'gi',
)

/**
 * Algunos OCR entregan la tabla por columnas: primero todos los códigos,
 * luego todas las cantidades con su unidad y al final las descripciones.
 * Este lector reconstruye esas filas antes de intentar el modo línea por línea.
 */
function parsearBloquesColumnas(lineas: string[]): {
  items: ItemRequisicion[]
  consumidas: Set<number>
} {
  const sinResultado = { items: [], consumidas: new Set<number>() }
  const indiceEncabezado = lineas.findIndex((linea) =>
    RE_ENCABEZADO_COLUMNAS.test(sinAcentos(linea)),
  )
  if (indiceEncabezado < 0) return sinResultado

  const codigos: string[] = []
  const indicesCodigos: number[] = []
  let indice = indiceEncabezado + 1

  while (indice < lineas.length) {
    const linea = lineas[indice].trim()
    if (!RE_SOLO_CODIGOS.test(linea)) break
    codigos.push(...linea.split(/\s+/))
    indicesCodigos.push(indice)
    indice++
  }

  if (codigos.length === 0) return sinResultado

  const cantidades: { cantidad: number; unidad: string }[] = []
  const indicesCantidades: number[] = []

  while (indice < lineas.length && cantidades.length < codigos.length) {
    const linea = lineas[indice].trim()
    const coincidencias = [...linea.matchAll(RE_CANTIDAD_UNIDAD)]
    if (coincidencias.length === 0) break

    for (const coincidencia of coincidencias) {
      const cantidad = parseCantidad(coincidencia[1])
      if (Number.isFinite(cantidad) && cantidad > 0) {
        cantidades.push({
          cantidad,
          unidad: normalizarUnidad(coincidencia[2]),
        })
      }
    }

    indicesCantidades.push(indice)
    indice++
  }

  if (cantidades.length !== codigos.length) return sinResultado

  const descripciones: string[] = []
  const indicesDescripciones: number[] = []

  while (indice < lineas.length && descripciones.length < codigos.length) {
    const linea = lineas[indice].trim()
    if (RE_ENCABEZADO_COLUMNAS.test(sinAcentos(linea))) break
    if (RE_FIN_BLOQUE.test(sinAcentos(linea))) break

    const descripcion = limpiarDescripcion(linea)
    if (descripcion.length >= 3) {
      descripciones.push(descripcion)
      indicesDescripciones.push(indice)
    }
    indice++
  }

  if (descripciones.length !== codigos.length) return sinResultado

  return {
    items: codigos.map((codigo, posicion) => {
      const ajuste = separarUnidadAlInicio(
        descripciones[posicion],
        cantidades[posicion].unidad,
      )

      return {
        codigo_pdf: codigo,
        cantidad: cantidades[posicion].cantidad,
        unidad: ajuste.unidad,
        descripcion_pdf: ajuste.descripcion,
      }
    }),
    consumidas: new Set([
      ...indicesCodigos,
      ...indicesCantidades,
      ...indicesDescripciones,
    ]),
  }
}

/**
 * Convierte el texto crudo del OCR en filas de requerimiento.
 * Es una función pura: no consulta la base de datos ni decide productos.
 */
export function parseRequisicion(textoCrudo: string): ResultadoParseo {
  const lineasBase = (textoCrudo || '')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)

  const bloque = parsearBloquesColumnas(lineasBase)
  const lineas = unirLineasPartidas(
    lineasBase.filter((_, indice) => !bloque.consumidas.has(indice)),
  )

  const items: ItemRequisicion[] = [...bloque.items]
  const lineasNoReconocidas: string[] = []

  for (const linea of lineas) {
    const match = linea.match(FILA)

    if (!match) {
      if (esLineaUtilParaRevision(linea)) lineasNoReconocidas.push(linea)
      continue
    }

    const codigo = match[1]
    const cantidad = parseCantidad(match[2])
    const descripcionDetectada = limpiarDescripcion(match[4])
    const { unidad, descripcion } = separarUnidadAlInicio(
      descripcionDetectada,
      normalizarUnidad(match[3] ?? ''),
    )
    const esSoloUnidad =
      !descripcion.includes(' ') &&
      (UNIDADES_COMUNES as readonly string[]).includes(
        normalizarUnidad(descripcion),
      )

    if (
      !Number.isFinite(cantidad) ||
      cantidad <= 0 ||
      descripcion.length < 3 ||
      esSoloUnidad
    ) {
      if (esLineaUtilParaRevision(linea)) lineasNoReconocidas.push(linea)
      continue
    }

    items.push({
      codigo_pdf: codigo,
      cantidad,
      unidad,
      descripcion_pdf: descripcion,
    })
  }

  return { items, lineasNoReconocidas }
}
