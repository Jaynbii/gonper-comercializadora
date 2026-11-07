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

const FILA_REQUISICION = new RegExp(
  `(?:^|\\D)(\\d{3,8})\\s+(\\d+(?:[.,:]\\d{1,3})?)\\s+((?:${UNIDADES})[.,]?\\s+)?((?!\\d).+)$`,
  'i',
)

const FILA_SAT = /^(\d+(?:[.,]\d+)?)\s+[A-Z0-9]+\s*-\s*([A-Za-z]+)\s+(\d{3,8})\s*-\s*(.+)$/i
const FILA_SAT_SIN_GUIONES = /^(\d+(?:[.,]\d+)?)\s+[A-Z0-9]+\s+([A-Za-z]+)\s+(\d{3,8})\s+(.+)$/i

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

  // El OCR confunde el punto decimal con dos puntos ("5:00" por "5.00").
  if (limpio.includes(':')) {
    return Number(limpio.replace(':', '.'))
  }

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

/**
 * LIMPIEZA AGRESIVA: Corta la descripción en el primer precio decimal que
 * encuentre, y elimina cualquier texto basura del SAT que venga después.
 * Además quita la basura que el OCR deja pegada al final de la descripción
 * (letras sueltas, restos de precios mal leídos, guiones): en una foto,
 * el texto de las columnas vecinas se cuela en la fila ("ROLLO E",
 * "MANOS ANE16 - A7E.16", "MANOS O"). Los números internos de la
 * descripción (12/200) se conservan: solo se tocan los tokens del final.
 * Un número suelto al final NO es basura por sí solo: los nombres reales
 * llevan números ("400", "12/200"). Por eso aquí solo se quitan los
 * decimales (restos de precio) y los enteros de 1 dígito o de 4+ dígitos;
 * los enteros de 2-3 dígitos los decide el paso 5 según lo que tengan
 * antes ("JUMBO 400" se queda, "KGS. 38" se va).
 */
const TOKEN_BASURA_FINAL =
  /^(?:\d+[.,]\d+|\d{4,}(?:[.,]\d+)?|\d|[A-Za-zÁÉÍÓÚÜÑ]|[^\p{L}\p{N}]+)$/u
// Letras y dígitos mezclados ("ANE16", "A7E.16"): un precio mal leído.
// Se exceptúan las medidas tipo 12/200, que sí son parte del nombre.
const TOKEN_MIXTO_BASURA =
  /^(?![\d/]+$)(?=[^ ]*[A-Za-zÁÉÍÓÚÜÑ])(?=[^ ]*\d)[^ ]+$/u

function esTokenBasura(token: string) {
  return TOKEN_BASURA_FINAL.test(token) || TOKEN_MIXTO_BASURA.test(token)
}

function limpiarDescripcion(texto: string) {
  let limpio = texto.replace(/\s+/g, ' ').trim()

  // 1. Cortar desde el primer número decimal (ej. 614.00, 635.00) hacia adelante
  // Esto elimina precios, importes y textos como "02 - Sí Objeto De Impuesto"
  limpio = limpio.split(/\s+\d+(?:[.,]\d{2,3})\b/)[0]

  // 2. Eliminar basura adicional del SAT por si acaso
  limpio = limpio.replace(/\b\d{2}\s*-\s*S[ií]\s*objeto\s*de\s*impuesto\b/gi, '')
  limpio = limpio.replace(/\bIVA\s*:.*$/gi, '')
  limpio = limpio.replace(/\bIMPORTE\b.*$/gi, '')

  // 3. Limpieza estándar de caracteres
  limpio = limpio.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/u, '')
  limpio = limpio.replace(/[^\p{L}\p{N}\s/#,.+-]/gu, '')
  limpio = limpio.replace(/\s+/g, ' ').trim()
  limpio = limpio.replace(/^[\s/#,.+-]+|[\s/#,.+-]+$/g, '')

  // 4. Quitar los tokens basura del final y una letra suelta del inicio.
  const tokens = limpio.split(' ').filter(Boolean)
  while (tokens.length > 0 && esTokenBasura(tokens[tokens.length - 1])) {
    tokens.pop()
  }
  while (tokens.length > 0 && /^[A-Za-zÁÉÍÓÚÜÑ]$/.test(tokens[0])) {
    tokens.shift()
  }

  // 5. Quitar la cola de basura: el OCR a veces pega al final de la
  // descripción restos de las columnas vecinas. Tres formas vistas en
  // fotos reales:
  //  - fragmentos cortos ("DES LO", restos de "DESCRIPCIÓN" o del pie);
  //  - restos del precio/importe leídos como basura ("1840 Y Teno",
  //    "— ¡18:43 AT": el importe 7,540.00 o 19,140.00 colado en la
  //    línea, con un número de 4+ dígitos y fragmentos);
  //  - puntos y letras sueltas del precio ("... Ta", "a e :").
  // Un número suelto NO es basura por sí solo: los nombres reales
  // llevan números ("400", "12/200", "20 LITROS", "C/9 KG"). Por eso
  // la cola solo se quita con evidencia: 2+ fragmentos cortos, o un
  // número de 4+ dígitos / puntuación junto con un fragmento, o un
  // fragmento final de 2 letras. Un número de 2-3 dígitos solo se
  // quita si no sigue a una palabra real del nombre ("JUMBO 400" se
  // queda; "KGS. 38" se va porque 38 sigue a una unidad y es resto
  // del precio 388.60). Se exige que queden 2+ tokens para no tocar
  // nombres cortos ("TANQUE DE GAS").
  const esUnidadConocida = (token: string) => {
    const mayus = token.toUpperCase()
    return (
      (UNIDADES_COMUNES as readonly string[]).includes(mayus) ||
      normalizarUnidad(mayus) !== mayus
    )
  }
  // Palabra real del nombre: 3+ letras que no es una unidad conocida.
  const esPalabraNombre = (token: string) =>
    /^[A-Za-zÁÉÍÓÚÜÑ]{3,}$/.test(token) && !esUnidadConocida(token)
  const esFragmentoCorto = (token: string) => {
    if (!/^[A-Za-zÁÉÍÓÚÜÑ]{2,3}$/.test(token)) return false
    // OJO: normalizarUnidad devuelve MAYÚSCULAS, así que la comparación
    // debe hacerse en la misma caja: el OCR del teléfono devuelve la cola
    // a veces en Title Case ("Des Lo") o minúsculas y la regla no la
    // atrapaba — los tests solo alimentaban MAYÚSCULAS y pasaban.
    return !esUnidadConocida(token.toUpperCase())
  }
  // Fragmento de 4 letras ("TENO", "BAÑOS"): solo cuenta como cola
  // cuando hay evidencia fuerte; solo no se toca ("PINO AZUL" es un
  // nombre real). Las unidades de 4 letras ("CAJA", "KILO") no son
  // fragmentos.
  const esFragmentoCuatro = (token: string) => {
    if (!/^[A-Za-zÁÉÍÓÚÜÑ]{4}$/.test(token)) return false
    return !esUnidadConocida(token.toUpperCase())
  }
  const esEntero = (token: string) => /^\d+$/.test(token)
  const esPuntuacionSola = (token: string) => /^[^\p{L}\p{N}]+$/u.test(token)

  let cola = 0
  let fragmentosCortos = 0
  let fragmentos = 0
  let evidenciaFuerte = false
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    if (esFragmentoCorto(token)) {
      cola++
      fragmentosCortos++
      fragmentos++
    } else if (esFragmentoCuatro(token)) {
      cola++
      fragmentos++
    } else if (esEntero(token)) {
      // Un número de 4+ dígitos siempre es resto de precio. Uno de
      // 2-3 dígitos solo sigue en la cola si NO sigue a una palabra
      // real del nombre (es medida del producto: "JUMBO 400"); si
      // sigue a una unidad, un fragmento o un número, es resto del
      // precio.
      if (token.length >= 4) {
        cola++
        evidenciaFuerte = true
      } else {
        const anterior = tokens[i - 1]
        if (anterior !== undefined && esPalabraNombre(anterior)) break
        cola++
      }
    } else if (/^[A-Za-zÁÉÍÓÚÜÑ]$/.test(token)) {
      cola++
    } else if (esPuntuacionSola(token)) {
      cola++
      evidenciaFuerte = true
    } else {
      break
    }
  }

  const ultimoToken = tokens[tokens.length - 1]
  const tokenAntesDeCola = cola > 0 ? tokens[tokens.length - cola - 1] : undefined
  // Fragmento final de 2 letras ("BS", "TA", "CA"): un nombre real no
  // termina en una palabra de 2 letras que no sea medida (las medidas
  // de 2 letras como "KG" están protegidas como unidades). Se quita si
  // la cola trae una letra suelta ("E CA") o si es el único token de
  // la cola y sigue a una palabra real ("CEPILLO IXTLE BS"); no se
  // quita si sigue a un número ("500 ML" se queda: ML sigue a 500).
  const esFragmentoDosLetras =
    ultimoToken !== undefined &&
    /^[A-Za-zÁÉÍÓÚÜÑ]{2}$/.test(ultimoToken) &&
    esFragmentoCorto(ultimoToken)
  const colaTieneLetraSuelta = tokens
    .slice(tokens.length - cola)
    .some((token) => /^[A-Za-zÁÉÍÓÚÜÑ]$/.test(token))
  const quitarPorFragmentoDosLetras =
    esFragmentoDosLetras &&
    (colaTieneLetraSuelta ||
      (cola === 1 &&
        tokenAntesDeCola !== undefined &&
        esPalabraNombre(tokenAntesDeCola)))
  // Un número suelto al final de la cola solo se quita si no sigue a
  // una palabra real del nombre ("KGS. 38" se va; "JUMBO 400" se queda).
  const quitarPorEnteroSuelto =
    cola === 1 &&
    ultimoToken !== undefined &&
    esEntero(ultimoToken) &&
    !(tokenAntesDeCola !== undefined && esPalabraNombre(tokenAntesDeCola))

  if (
    tokens.length - cola >= 2 &&
    (fragmentosCortos >= 2 ||
      quitarPorFragmentoDosLetras ||
      (evidenciaFuerte && fragmentos >= 1) ||
      quitarPorEnteroSuelto)
  ) {
    tokens.length -= cola
  }
  // Al quitar la cola puede quedar puntuación colgando ("KGS." de
  // "KGS. 38"); se limpia el final como en el paso 3.
  limpio = tokens.join(' ').replace(/[\s/#,.+-]+$/g, '')

  return limpio.toUpperCase()
}

// Una fila de requisición real tiene cantidades pequeñas (unidades,
// cajas, galones) y una descripción que es un nombre de producto.
// El OCR a veces junta el encabezado o el pie en una línea que
// parece fila ("2026 1 CAJA E In", "004 46080 CAJA Omo"): esas
// filas inventadas se descartan aquí en vez de llegar al modal.
const CANTIDAD_MAXIMA_PLAUSIBLE = 10000

function esFilaPlausible(cantidad: number, descripcion: string): boolean {
  if (
    !Number.isFinite(cantidad) ||
    cantidad <= 0 ||
    cantidad > CANTIDAD_MAXIMA_PLAUSIBLE
  ) {
    return false
  }
  const tokens = descripcion.split(' ').filter(Boolean)
  // El nombre del producto tiene al menos una palabra de 3+ letras;
  // restos como "E IN" no son un artículo.
  return tokens.some((token) => /[A-Za-zÁÉÍÓÚÜÑ]{3,}/.test(token))
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
const RE_CANTIDAD_UNIDAD = new RegExp(`(\\d+(?:[.,:]\\d{1,3})?)\\s*((?:${UNIDADES})[.,]?)(?=\\s|$)`, 'gi')

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

// Carta de entrega (Mercado Municipal "José María Pino Suárez",
// 19/10/2026): otra forma en que piden material. No es una tabla — es
// una lista de viñetas "cantidad unidad descripción", sin códigos ni
// precios:
//   • 2 porron de cloro
//   • ½ bulto de bolsas negras medianas
//   • 5 escobas de espiga reforzadas
// La detección exige la frase de la carta ("se hace entrega del
// siguiente material") con 2+ líneas de viñeta, o 2+ líneas que
// empiezan con viñeta y cantidad sin que haya encabezado de tabla.
// La frase sola no basta: las requisiciones en tabla dicen "SE
// SOLICITA EL SIGUIENTE MATERIAL" en Observaciones. Y la viñeta sola
// tampoco roba filas de la tabla: el encabezado de columnas la frena.
const FRACCIONES_VINETA: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

// El OCR del teléfono pega la cantidad a la palabra ("2porrones",
// "5escobas"), así que el espacio tras la cantidad es opcional.
// OJO: con \s* la fracción "1/2" se rompería ("1" + "/2 ..."), por
// eso la alternativa \d+/\d+ va primero: se intenta antes que \d+.
const CANTIDAD_VINETA =
  '(?:\\d+/\\d+|\\d+(?:[.,:]\\d{1,3})?|[½¼¾⅓⅔⅛⅜⅝⅞])'
const LINEA_VINETA = new RegExp(
  `^(?:[•\\-\\*·▪◦–—]\\s*)?(${CANTIDAD_VINETA})\\s*(.+)$`,
  'u',
)
const LINEA_VINETA_CON_MARCA = new RegExp(
  `^[•\\-\\*·▪◦–—]\\s*${CANTIDAD_VINETA}\\s*\\S`,
  'u',
)

function parseCantidadVineta(valor: string): number {
  const limpio = valor.trim()
  if (FRACCIONES_VINETA[limpio] !== undefined) return FRACCIONES_VINETA[limpio]
  const fraccion = limpio.match(/^(-?\d+)\s*\/\s*(\d+)$/)
  if (fraccion) {
    const denominador = Number(fraccion[2])
    return denominador === 0 ? NaN : Number(fraccion[1]) / denominador
  }
  return parseCantidad(limpio)
}

const esUnidadCarta = (token: string) =>
  (UNIDADES_COMUNES as readonly string[]).includes(normalizarUnidad(token))

// El OCR del teléfono deforma las viñetas de la carta de tres formas
// vistas en la foto real del Mercado Pino Suárez:
//  - la viñeta • sale como "e" o "+" ("e 2porrones de cloro");
//  - la cantidad va pegada a la palabra ("2porrones", "5escobas");
//  - el ½ desaparece ("e bulto de bolsas...") o sale como "Ya"/"Ys"
//    pegado a la unidad ("Yabulto", "Ysbulto").
// Antes de detectar la carta, cada línea se canoniza: la marca se
// vuelve "•", el artefacto de ½ se vuelve "½" y una línea que empieza
// por una unidad conocida sin cantidad se lee como ½ (es el único
// caso en que la cantidad se pierde del todo). Solo se usa en la ruta
// de la carta; la tabla y la factura no pasan por aquí.
function normalizarLineaCarta(linea: string): string {
  let texto = linea.trim()
  if (!texto) return texto

  // 1. Marca de viñeta → "•". La "e" solo es marca cuando lo que sigue
  // es una cantidad o una unidad conocida: una línea que empiece por
  // una palabra con "e" ("Escobas de espiga...") no se toca.
  const marca = texto.match(/^[•\-\*·▪◦–—+]\s*/)
  if (marca) {
    texto = `• ${texto.slice(marca[0].length)}`.trimEnd()
  } else {
    const conE = texto.match(/^e\s+(.+)$/i)
    if (conE) {
      const siguiente = conE[1]
      const primerToken = siguiente.split(/\s+/)[0] ?? ''
      if (
        /^(?:\d|[½¼¾⅓⅔⅛⅜⅝⅞])/.test(primerToken) ||
        esUnidadCarta(primerToken)
      ) {
        texto = `• ${siguiente}`
      }
    } else {
      // "e2porrones...": la "e" pegada a la cantidad.
      const pegada = texto.match(/^e(\d.*)$/i)
      if (pegada) texto = `• ${pegada[1]}`
    }
  }

  // 2. Resto después de la marca (o la línea entera si no hay marca).
  const conMarca = texto.match(/^•\s*(.*)$/)
  const resto = conMarca ? conMarca[1] : texto
  const prefijo = conMarca ? '• ' : ''

  // 3. "Yabulto" / "Ysbulto" / "%bulto": el ½ pegado a la unidad.
  // El resto del token debe ser una unidad de 2+ letras: "Ya" + "m"
  // (METRO) no basta, que "Yam..." no es un artefacto.
  const tokens = resto.split(/\s+/).filter(Boolean)
  const primer = tokens[0] ?? ''
  const artefacto = primer.match(/^(ya|ys|%)(.+)$/i)
  if (artefacto) {
    const restoToken = artefacto[2]
    if (restoToken.length >= 2 && esUnidadCarta(restoToken)) {
      return `${prefijo}½ ${restoToken}${resto.slice(primer.length)}`
    }
  }

  // 4. Sin cantidad y empieza por unidad conocida ("bulto de bolsas
  // negras medianas"): es el ½ que el OCR se comió.
  if (
    primer &&
    !/^(?:\d|[½¼¾⅓⅔⅛⅜⅝⅞])/.test(primer) &&
    esUnidadCarta(primer)
  ) {
    return `${prefijo}½ ${resto}`
  }

  return texto
}

function parsearLineaVineta(linea: string): ItemRequisicion | null {
  const match = linea.trim().match(LINEA_VINETA)
  if (!match) return null

  const cantidad = parseCantidadVineta(match[1])
  const resto = match[2].trim()
  const tokens = resto.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  let unidad = ''
  let descripcionTexto = resto
  const posibleUnidad = normalizarUnidad(tokens[0])
  if ((UNIDADES_COMUNES as readonly string[]).includes(posibleUnidad)) {
    unidad = posibleUnidad
    descripcionTexto = tokens.slice(1).join(' ')
  } else {
    // Sin unidad ("5 escobas de espiga reforzadas"): pieza.
    unidad = 'PIEZA'
  }
  // "2 porron de cloro" → la descripción es "cloro", no "de cloro".
  descripcionTexto = descripcionTexto.replace(/^de\s+/i, '')

  const descripcion = limpiarDescripcion(descripcionTexto)
  if (!esFilaPlausible(cantidad, descripcion) || descripcion.length < 3) {
    return null
  }
  // Sin código: el artículo se vincula por nombre como cualquier otro
  // sin vincular; no se inventa código ni precio.
  return { codigo_pdf: '', cantidad, unidad, descripcion_pdf: descripcion }
}

function esCartaEntrega(lineas: string[]): boolean {
  const texto = lineas.join('\n')
  const tieneFrase = /se\s+hace\s+entrega/i.test(sinAcentos(texto))
  const tieneEncabezadoTabla = lineas.some((linea) =>
    RE_ENCABEZADO_COLUMNAS.test(sinAcentos(linea)),
  )
  if (tieneEncabezadoTabla) return false
  const vinetasConMarca = lineas.filter((linea) =>
    LINEA_VINETA_CON_MARCA.test(linea.trim()),
  )
  if (vinetasConMarca.length >= 2) return true
  const lineasItem = lineas.filter((linea) => LINEA_VINETA.test(linea.trim()))
  return tieneFrase && lineasItem.length >= 2
}

function parsearCartaEntrega(lineas: string[]): ResultadoParseo | null {
  // El OCR deforma las viñetas: se detecta y se lee sobre las líneas
  // canonizadas, pero las no reconocidas se reportan con su texto
  // original para que la revisión muestre lo que de verdad se leyó.
  const lineasCarta = lineas.map(normalizarLineaCarta)
  if (!esCartaEntrega(lineasCarta)) return null

  const items: ItemRequisicion[] = []
  const lineasNoReconocidas: string[] = []

  for (const [indice, lineaOriginal] of lineas.entries()) {
    const item = parsearLineaVineta(lineasCarta[indice] ?? '')
    if (item) {
      items.push(item)
      continue
    }
    if (esLineaUtilParaRevision(lineaOriginal)) lineasNoReconocidas.push(lineaOriginal)
  }

  return items.length > 0 ? { items, lineasNoReconocidas } : null
}

export function parseRequisicion(textoCrudo: string): ResultadoParseo {
  const lineasBase = (textoCrudo || '')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)

  const carta = parsearCartaEntrega(lineasBase)
  if (carta) return carta

  const bloque = parsearBloquesColumnas(lineasBase)
  const lineas = unirLineasPartidas(lineasBase.filter((_, indice) => !bloque.consumidas.has(indice)))

  const items: ItemRequisicion[] = [...bloque.items]
  const lineasNoReconocidas: string[] = []

  for (const linea of lineas) {
    let match = linea.match(FILA_REQUISICION)
    if (match) {
      const codigo = match[1]
      const cantidad = parseCantidad(match[2])
      const descripcionDetectada = limpiarDescripcion(match[4])
      const { unidad, descripcion } = separarUnidadAlInicio(descripcionDetectada, normalizarUnidad(match[3] ?? ''))
      const esSoloUnidad = !descripcion.includes(' ') && (UNIDADES_COMUNES as readonly string[]).includes(normalizarUnidad(descripcion))

      if (esFilaPlausible(cantidad, descripcion) && descripcion.length >= 3 && !esSoloUnidad) {
        items.push({ codigo_pdf: codigo, cantidad, unidad, descripcion_pdf: descripcion })
        continue
      }
    }

    match = linea.match(FILA_SAT) || linea.match(FILA_SAT_SIN_GUIONES)
    if (match) {
      const cantidad = parseCantidad(match[1])
      const unidad = normalizarUnidad(match[2])
      const codigo = match[3]
      const descripcion = limpiarDescripcion(match[4])

      if (esFilaPlausible(cantidad, descripcion) && descripcion.length >= 3) {
        items.push({ codigo_pdf: codigo, cantidad, unidad, descripcion_pdf: descripcion })
        continue
      }
    }

    if (esLineaUtilParaRevision(linea)) lineasNoReconocidas.push(linea)
  }

  return { items, lineasNoReconocidas }
}