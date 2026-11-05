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

// 1. Patrón Original (Requisiciones Municipales)
const FILA_REQUISICION = new RegExp(
  `(?:^|\\D)(\\d{3,8})\\s+(\\d+(?:[.,]\\d{1,3})?)\\s+((?:${UNIDADES})[.,]?\\s+)?((?!\\d).+)$`,
  'i',
)

// 2. Patrón Factura SAT / Tabla (Ej: "1 XBX - Caja 14111704 - PAPEL...")
const FILA_SAT = /^(\d+(?:[.,]\d+)?)\s+[A-Z0-9]+\s*-\s*([A-Za-z]+)\s+(\d{3,8})\s*-\s*(.+)$/i

// 3. Patrón Factura SAT sin guiones (Por si el OCR los omite)
const FILA_SAT_SIN_GUIONES = /^(\d+(?:[.,]\d+)?)\s+[A-Z0-9]+\s+([A-Za-z]+)\s+(\d{3,8})\s+(.+)$/i

const MONEDA_AL_FINAL = /\s+\$?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*$/

const PALABRAS_ENCABEZADO = [
  'CODIGO', 'CANTIDAD', 'UNIDAD', 'DESCRIPCION', 'PRECIO', 'IMPORTE',
  'SUBTOTAL', 'TOTAL', 'TOTALES', 'IVA', 'RFC', 'FECHA', 'FOLIO',
  'REQUISICION', 'REQUISICIONES', 'DEPARTAMENTO', 'PROVEEDOR', 'PROYECTO',
  'FONDOS', 'POLIZA', 'MAZATLAN', 'PAGINA', 'OFICIO', 'PARTIDA', 'ANEXO',
  'OBSERVACIONES', 'FIRMA', 'SELLO', 'CONDICIONES', 'CLIENTE', 'EXPEDIDO',
  'EMISION', 'REGIMEN', 'DOMICILIO', 'METODO', 'FORMA', 'TIMBRADO', 'SELLO DIGITAL'
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
    if (limpio.lastIndexOf(',') < limpio.lastIndexOf('.')) {
      return Number(limpio.replace(/,/g, ''))
    }
    return Number(limpio.replace(/\./g, '').replace(',', '.'))
  }

  if (limpio.includes(',')) {
    const decimales = limpio.split(',')[1] ?? ''
    return decimales.length === 3
      ? Number(limpio.replace(',', ''))
      : Number(limpio.replace(',', '.'))
  }

  return Number(limpio)
}

function quitarPreciosFinales(texto: string) {
  let limpio = texto.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 2; i++) {
    const siguiente = limpio.replace(MONEDA_AL_FINAL, '').trimEnd()
    if (siguiente === limpio) break
    limpio = siguiente
  }
  return limpio
}

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
const COLA_DE_UNIDAD = new RegExp(`^\\d{3,8}\\s+\\d+(?:[.,]\\d{1,3})?\\s+(?:${UNIDADES})[.,]?$`, 'i')
const ES_SOLO_NUMERO = /^\d+(?:[.,]\d+)?$/
const ES_UNIDAD_SAT = /^[A-Z0-9]+\s*-\s*[A-Za-z]+$/
const ES_CODIGO_DESC_SAT = /^\d{3,8}\s*-\s*(.+)$/

function unirLineasPartidas(lineas: string[]) {
  let actual = lineas
  for (let pasada = 0; pasada < 3; pasada++) {
    const unidas: string[] = []
    let huboCambio = false
    for (let i = 0; i < actual.length; i++) {
      const linea = actual[i]
      const siguiente = actual[i + 1]
      const subsiguiente = actual[i + 2]

      const seParte =
        !!siguiente &&
        (
          (SOLO_CODIGO.test(linea) && !SOLO_CODIGO.test(siguiente) && EMPIEZA_CON_CANTIDAD.test(siguiente)) ||
          CODIGO_Y_CANTIDAD.test(linea) ||
          COLA_DE_UNIDAD.test(linea) ||
          // Unir formato SAT: "1" + "XBX - Caja" + "14111704 - PAPEL..."
          (ES_SOLO_NUMERO.test(linea) && ES_UNIDAD_SAT.test(siguiente) && subsiguiente && ES_CODIGO_DESC_SAT.test(subsiguiente)) ||
          (ES_SOLO_NUMERO.test(linea) && ES_UNIDAD_SAT.test(siguiente))
        )

      if (seParte) {
        if (ES_SOLO_NUMERO.test(linea) && ES_UNIDAD_SAT.test(siguiente) && subsiguiente && ES_CODIGO_DESC_SAT.test(subsiguiente)) {
          unidas.push(`${linea} ${siguiente} ${subsiguiente}`)
          i += 2
        } else {
          unidas.push(`${linea} ${siguiente}`)
          i++
        }
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
const RE_CANTIDAD_UNIDAD = new RegExp(`(\\d+(?:[.,]\\d{1,3})?)\\s*((?:${UNIDADES})[.,]?)(?=\\s|$)`, 'gi')

function parsearBloquesColumnas(lineas: string[]): { items: ItemRequisicion[], consumidas: Set<number> } {
  const sinResultado = { items: [], consumidas: new Set<number>() }
  const indiceEncabezado = lineas.findIndex((linea) => RE_ENCABEZADO_COLUMNAS.test(sinAcentos(linea)))
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
        cantidades.push({ cantidad, unidad: normalizarUnidad(coincidencia[2]) })
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
      const ajuste = separarUnidadAlInicio(descripciones[posicion], cantidades[posicion].unidad)
      return {
        codigo_pdf: codigo,
        cantidad: cantidades[posicion].cantidad,
        unidad: ajuste.unidad,
        descripcion_pdf: ajuste.descripcion,
      }
    }),
    consumidas: new Set([...indicesCodigos, ...indicesCantidades, ...indicesDescripciones]),
  }
}

export function parseRequisicion(textoCrudo: string): ResultadoParseo {
  const lineasBase = (textoCrudo || '')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)

  const bloque = parsearBloquesColumnas(lineasBase)
  const lineas = unirLineasPartidas(lineasBase.filter((_, indice) => !bloque.consumidas.has(indice)))

  const items: ItemRequisicion[] = [...bloque.items]
  const lineasNoReconocidas: string[] = []

  for (const linea of lineas) {
    // 1. Intentar con el formato original (Requisición)
    let match = linea.match(FILA_REQUISICION)
    if (match) {
      const codigo = match[1]
      const cantidad = parseCantidad(match[2])
      const descripcionDetectada = limpiarDescripcion(match[4])
      const { unidad, descripcion } = separarUnidadAlInicio(descripcionDetectada, normalizarUnidad(match[3] ?? ''))
      const esSoloUnidad = !descripcion.includes(' ') && (UNIDADES_COMUNES as readonly string[]).includes(normalizarUnidad(descripcion))

      if (Number.isFinite(cantidad) && cantidad > 0 && descripcion.length >= 3 && !esSoloUnidad) {
        items.push({ codigo_pdf: codigo, cantidad, unidad, descripcion_pdf: descripcion })
        continue
      }
    }

    // 2. Intentar con el formato Factura SAT / Tabla
    match = linea.match(FILA_SAT) || linea.match(FILA_SAT_SIN_GUIONES)
    if (match) {
      const cantidad = parseCantidad(match[1])
      const unidad = normalizarUnidad(match[2])
      const codigo = match[3]
      const descripcion = limpiarDescripcion(match[4])

      if (Number.isFinite(cantidad) && cantidad > 0 && descripcion.length >= 3) {
        items.push({ codigo_pdf: codigo, cantidad, unidad, descripcion_pdf: descripcion })
        continue
      }
    }

    // Si no coincidió con ningún formato, se guarda para revisión manual
    if (esLineaUtilParaRevision(linea)) lineasNoReconocidas.push(linea)
  }

  return { items, lineasNoReconocidas }
}