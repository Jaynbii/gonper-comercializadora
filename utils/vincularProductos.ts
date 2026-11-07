import Fuse from 'fuse.js'
import { normalizarUnidad } from './unidades.ts'

/**
 * Vinculación de los artículos leídos de una requisición (factura CONTPAQi)
 * con los productos del catálogo de inventario.
 *
 * REGLA CLAVE (Factura A570): el código SAT es una CLASE de producto, no la
 * identidad del producto. Dos artículos distintos pueden compartir el mismo
 * código SAT (ej. 14111704: "Papel P/wc Jumbo Junior" y "Papel para Manos
 * en Rollo"). Por eso una coincidencia por código solo se confía cuando el
 * nombre también concuerda; si el nombre no concuerda, no se vincula por
 * código y se cae a la búsqueda difusa por nombre. Y un artículo sin
 * vínculo conserva SU propia descripción del PDF, nunca el nombre de otro
 * producto.
 */

export type ProductoCatalogo = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
  codigo_sat: string | null
}

export type ItemPdf = {
  codigo_pdf: string
  cantidad: number | string
  unidad?: string | null
  descripcion_pdf: string
}

export type SugerenciaProducto = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
}

export type ItemVinculado = {
  codigo_pdf: string
  cantidad: number | string
  unidad: string
  descripcion_pdf: string
  producto_nombre: string
  existe_en_bd: boolean
  id_bd: string | null
  sugerencia: SugerenciaProducto | null
}

// Score <= 0.35 = coincidencia muy alta (auto-vincula)
// Score <= 0.40 = coincidencia alta (sugerencia, o acuerdo de nombre)
export const UMBRAL_VINCULO_AUTO = 0.35
export const UMBRAL_SUGERENCIA = 0.4
export const UMBRAL_ACUERDO_NOMBRE = 0.4

export function formatearNombre(str: string) {
  if (!str) return str
  return str
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase())
}

// Limpia palabras comunes y unifica el formato para comparar nombres
export function limpiarParaBusqueda(texto: string) {
  return texto
    .toLowerCase() // Todo a minúsculas para evitar problemas de Case
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/\b(de|del|la|el|los|las|en|con|para|y)\b/g, '') // Quitar conectores
    .replace(/[.,#/-]/g, ' ') // Quitar símbolos
    .replace(/\s+/g, ' ')
    .trim()
}

// Tokens de un nombre ya limpio, separando número y unidad pegados
// ("9kgs" -> ["9", "kgs"], "20l" -> ["20", "l"]) para que "c/9kgs" y
// "c/9 kgs" comparen igual.
export function tokenizarNombre(nombreLimpio: string): string[] {
  return nombreLimpio
    .split(' ')
    .flatMap((token) => token.match(/\d+|[a-z]+/g) ?? [token])
    .filter((token) => token.length > 0)
}

// Cobertura por tokens: qué fracción de los tokens del nombre del catálogo
// aparece en el nombre escrito. Complementa a Fuse: Fuse castiga las
// palabras de más ("Jabón en polvo c/9kgs" contra "Jabón c/9 kgs" puntúa
// 0.624 y no sugiere nada), pero si todas las palabras del catálogo están
// en lo escrito, es el mismo producto aunque el usuario haya agregado
// palabras ("en polvo") o el peso venga pegado ("9kgs").
function coberturaPorTokens(
  tokensConsulta: string[],
  tokensCatalogo: string[],
): { cobertura: number; coincidencias: number } {
  if (tokensCatalogo.length === 0) return { cobertura: 0, coincidencias: 0 }
  const enConsulta = new Set(tokensConsulta)
  const coincidencias = tokensCatalogo.filter((t) => enConsulta.has(t)).length
  return { cobertura: coincidencias / tokensCatalogo.length, coincidencias }
}

function crearFuse(productos: ProductoCatalogo[]) {
  return new Fuse(
    productos.map((p) => ({ ...p, nombreLimpio: limpiarParaBusqueda(p.nombre) })),
    {
      keys: ['nombreLimpio'],
      threshold: UMBRAL_SUGERENCIA,
      ignoreLocation: true,
      includeScore: true,
    },
  )
}

/**
 * ¿Los dos nombres hablan del mismo producto? True si, ya limpios, son
 * iguales, uno contiene al otro, o Fuse los acerca lo suficiente
 * (score <= 0.35, el mismo umbral del auto-vínculo).
 */
export function nombresSimilares(nombreA: string, nombreB: string): boolean {
  const a = limpiarParaBusqueda(nombreA)
  const b = limpiarParaBusqueda(nombreB)
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const fuse = new Fuse([{ nombreLimpio: b }], {
    keys: ['nombreLimpio'],
    threshold: UMBRAL_VINCULO_AUTO,
    ignoreLocation: true,
    includeScore: true,
  })
  const mejor = fuse.search(a)[0]
  return !!mejor && (mejor.score ?? 1) <= UMBRAL_VINCULO_AUTO
}

/**
 * Dentro de una lista de productos que comparten el mismo código SAT,
 * devuelve el que tiene un nombre similar al dado, o null si ninguno lo
 * tiene. Es el freno que usa el registro de productos nuevos: mismo
 * código + nombre similar = duplicado; mismo código + nombre distinto =
 * producto distinto y se puede registrar.
 */
export function buscarProductoSimilarPorNombre(
  nombre: string,
  productos: ProductoCatalogo[],
): ProductoCatalogo | null {
  const nombreLimpio = limpiarParaBusqueda(nombre)
  if (!nombreLimpio) return null
  // Primero la comparación exacta/contención (barata y sin falsos negativos
  // por el umbral de Fuse) y luego la difusa.
  for (const producto of productos) {
    if (nombresSimilares(nombre, producto.nombre)) return producto
  }
  return null
}

function agruparPorCodigo(
  productos: ProductoCatalogo[],
  clave: (p: ProductoCatalogo) => string | null,
): Map<string, ProductoCatalogo[]> {
  const mapa = new Map<string, ProductoCatalogo[]>()
  for (const producto of productos) {
    const codigo = clave(producto)
    if (!codigo) continue
    const lista = mapa.get(codigo)
    if (lista) lista.push(producto)
    else mapa.set(codigo, [producto])
  }
  return mapa
}

/**
 * Vincula cada artículo del PDF con un producto del catálogo.
 *
 * 1. Candidatos por código (SAT o SKU): se consideran TODOS los productos
 *    que comparten ese código y solo se confía en el que además concuerda
 *    en nombre (score Fuse <= 0.4 contra la descripción del PDF).
 * 2. Si ningún candidato por código concuerda en nombre, búsqueda por
 *    nombre sobre todo el catálogo: Fuse (score <= 0.35 auto-vincula,
 *    <= 0.4 solo sugiere) más cobertura por tokens — si todos los tokens
 *    del nombre del catálogo (2 o más) están en lo escrito, auto-vincula;
 *    si están el 75% o más, solo sugiere. Entre varios candidatos gana
 *    el que tenga más tokens coincidentes (el más específico) y, en
 *    empate, el menor puntaje Fuse. Así "Jabón en polvo c/9kgs" vincula
 *    a "Jabón c/9 kgs" aunque Fuse lo puntúe 0.624, y con solo el de
 *    3 kilos en el catálogo solo sugiere (no auto-vincula el peso
 *    equivocado).
 * 3. Sin vínculo, la descripción mostrada es la del PDF (formateada),
 *    nunca el nombre de otro producto.
 */
export function vincularItems(
  items: ItemPdf[],
  productos: ProductoCatalogo[],
): ItemVinculado[] {
  const porSat = agruparPorCodigo(productos, (p) => p.codigo_sat)
  const porSku = agruparPorCodigo(productos, (p) => p.sku)
  const fuse = crearFuse(productos)

  return items.map((item) => {
    const descripcionLimpia = limpiarParaBusqueda(item.descripcion_pdf)
    // Scores de Fuse de la descripción del PDF contra TODO el catálogo,
    // para juzgar si un candidato por código concuerda en nombre.
    const puntajesPorId = new Map<string, number>()
    for (const resultado of fuse.search(descripcionLimpia)) {
      puntajesPorId.set(resultado.item.id, resultado.score ?? 1)
    }

    const candidatosPorCodigo: ProductoCatalogo[] = []
    const vistos = new Set<string>()
    for (const candidato of [...(porSat.get(item.codigo_pdf) ?? []), ...(porSku.get(item.codigo_pdf) ?? [])]) {
      if (!vistos.has(candidato.id)) {
        vistos.add(candidato.id)
        candidatosPorCodigo.push(candidato)
      }
    }

    let sugerencia: SugerenciaProducto | null = null
    let productoFinal: ProductoCatalogo | null = null

    // 1. Coincidencia por código SOLO si el nombre también concuerda.
    const candidatosQueConcuerdan = candidatosPorCodigo
      .filter((c) => (puntajesPorId.get(c.id) ?? 1) <= UMBRAL_ACUERDO_NOMBRE)
      .sort((a, b) => (puntajesPorId.get(a.id) ?? 1) - (puntajesPorId.get(b.id) ?? 1))
    if (candidatosQueConcuerdan.length > 0) {
      productoFinal = candidatosQueConcuerdan[0]
    } else {
      // 2. Sin código confiable, búsqueda por nombre: Fuse + cobertura
      // por tokens. La cobertura cubre lo que Fuse castiga: palabras de
      // más en lo escrito y peso pegado ("9kgs" vs "9 kgs").
      const tokensConsulta = tokenizarNombre(descripcionLimpia)
      const candidatos = productos
        .map((producto) => {
          const tokensCatalogo = tokenizarNombre(
            limpiarParaBusqueda(producto.nombre),
          )
          const { cobertura, coincidencias } = coberturaPorTokens(
            tokensConsulta,
            tokensCatalogo,
          )
          const fuseScore = puntajesPorId.get(producto.id) ?? 1
          const autoPorTokens = tokensCatalogo.length >= 2 && cobertura === 1
          const sugerirPorTokens =
            tokensCatalogo.length >= 2 &&
            coincidencias >= 2 &&
            cobertura >= 0.75
          return {
            producto,
            auto: fuseScore <= UMBRAL_VINCULO_AUTO || autoPorTokens,
            sugerir: fuseScore <= UMBRAL_SUGERENCIA || sugerirPorTokens,
            fuseScore,
            coincidencias,
          }
        })
        .filter((c) => c.auto || c.sugerir)
        .sort((a, b) => {
          if (a.auto !== b.auto) return a.auto ? -1 : 1
          if (a.coincidencias !== b.coincidencias)
            return b.coincidencias - a.coincidencias
          return a.fuseScore - b.fuseScore
        })
      const mejor = candidatos[0]
      if (mejor) {
        if (mejor.auto) {
          productoFinal = mejor.producto
        } else {
          sugerencia = {
            id: mejor.producto.id,
            sku: mejor.producto.sku,
            nombre: mejor.producto.nombre,
            unidad_medida: mejor.producto.unidad_medida,
          }
        }
      }
    }

    // 3. Sin vínculo, la descripción es la del PDF, no la de otro producto.
    // Corrección de un dígito mal leído por el OCR (foto 20759: el OCR
    // leyó 35580 en vez de 35980): si el artículo se vinculó por nombre
    // y su código NO coincidió con ningún producto del catálogo, y el
    // producto vinculado tiene un código de cliente (codigo_sat) que
    // difiere del leído en exactamente un dígito, ese dígito es casi
    // seguro un error de lectura. No se usa el sku: es un código interno
    // (ARTXXXX); el código del documento vive en codigo_sat. La
    // corrección solo hace visible el código del producto al que la fila
    // YA quedó vinculada por nombre; no crea un vínculo nuevo y no se
    // aplica cuando el código leído sí coincidió con algo (Factura A570:
    // 14111704 es un código SAT de clase compartido por dos productos,
    // y ahí el código del documento es el correcto).
    let codigoPdf = item.codigo_pdf
    if (candidatosPorCodigo.length === 0 && productoFinal?.codigo_sat) {
      const sat = productoFinal.codigo_sat.trim()
      if (/^\d+$/.test(sat) && /^\d+$/.test(codigoPdf) && sat.length === codigoPdf.length) {
        let diferencias = 0
        for (let i = 0; i < sat.length; i++) {
          if (sat[i] !== codigoPdf[i]) diferencias++
        }
        if (diferencias === 1) codigoPdf = sat
      }
    }

    const nombre = productoFinal?.nombre || formatearNombre(item.descripcion_pdf)

    return {
      codigo_pdf: codigoPdf,
      cantidad: item.cantidad,
      unidad: normalizarUnidad(productoFinal?.unidad_medida) || item.unidad || '',
      descripcion_pdf: nombre,
      producto_nombre: nombre,
      existe_en_bd: !!productoFinal,
      id_bd: productoFinal?.id || null,
      sugerencia,
    }
  })
}
