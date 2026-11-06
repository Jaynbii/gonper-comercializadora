// Surtido de requisiciones (Gonper).
//
// Código puro, sin Supabase ni Next.js, para poder probarlo con
// `node --test` sin base de datos.
//
// Por qué existe este módulo (error #441 al surtir REQ-0003, nov 2026):
// el `surtirOrden()` anterior hacía los writes con `Promise.all` y sin
// transacción, y además tragaba en silencio los errores de los updates
// de stock (los builders de PostgREST resuelven `{ data, error }`, no
// lanzan). Reproducción con mock de PostgREST (`/tmp/repro_surtir.mjs`,
// no versionado):
//   - Si el insert en movimientos_inventario falla (p. ej. la columna
//     `orden_id` no existe en la BD real — el repo ya tiene precedentes
//     de deriva código-vs-esquema, como `productos.codigo_sat`), el
//     surtido LANZA después de haber descontado ya el stock de todos
//     los artículos y marcado los items como surtidos, pero deja la
//     requisición en PENDIENTE. En producción ese throw llega al
//     cliente como "Minified React error #441" (Next.js redacta el
//     mensaje real del servidor) y el reintento ya no puede surtir
//     nada porque el stock quedó en 0.
//   - Si el update de productos falla (p. ej. RLS `is_admin`), NO
//     lanza nada: la requisición queda PARCIAL/ENTREGADA, se registran
//     movimientos, pero el stock nunca baja.
//   - Además, el cálculo ignoraba `cantidad_surtida`: al volver a
//     surtir una requisición PARCIAL volvía a descontar la cantidad
//     completa solicitada, no solo lo pendiente.
//
// La vía principal ahora es la RPC transaccional `surtir_orden`
// (migración supabase/migrations/20261106020000_surtir_orden_rpc.sql):
// todo el surtido ocurre en UNA transacción de Postgres, o no ocurre.
// La vía de respaldo (si la RPC aún no existe en Supabase) usa este
// plan y escribe en secuencia verificando CADA error, para que un
// fallo aborte antes de marcar la requisición como surtida.
//
// Reglas de negocio (no cambiar sin acordarlo con Alex):
// - El surtido PARCIAL se preserva: piden 10, hay 6, se surten 6 y la
//   requisición queda PARCIAL. Transaccional NO significa
//   todo-o-nada en negocio, sino que los writes de UN surtido van
//   juntos o no van.

export type SurtirItemEntrada = {
  id: string
  productoId: string
  /** Cantidad solicitada en la requisición. */
  cantidadSolicitada: number
  /** Cantidad ya surtida en intentos anteriores (0 si es el primero). */
  cantidadSurtida?: number | null
  /** Stock actual del producto (null = sin producto / sin stock). */
  stockActual: number | null
}

export type EstadoItemSurtido =
  | 'SURTIMIENTO_COMPLETO'
  | 'PARCIAL'
  | 'SIN_STOCK'

export type SurtirItemPlan = {
  id: string
  productoId: string
  /** Lo que queda por surtir: solicitada - ya surtida. */
  pendiente: number
  /** Lo que se va a surtir ahora: min(stock, pendiente). */
  cantidadASurtir: number
  nuevoStock: number
  /** Cantidad surtida acumulada tras este surtido. */
  nuevaCantidadSurtida: number
  nuevoEstadoItem: EstadoItemSurtido
  /** false = el artículo ya estaba totalmente surtido; no se escribe. */
  hayQueEscribir: boolean
}

export type PlanSurtido = {
  items: SurtirItemPlan[]
  /** Suma de lo pendiente de todos los artículos. */
  totalPendiente: number
  /** Suma de lo que se surte ahora. */
  totalSurtido: number
  nuevoEstadoOrden: 'ENTREGADA' | 'PARCIAL'
}

/**
 * Calcula el plan de un surtido a partir de lo pendiente de cada
 * artículo. No toca ninguna base de datos.
 *
 * Lanza Error('La requisición no tiene artículos') si la lista está
 * vacía, y Error('No hay stock de NINGÚN artículo...') si no se
 * puede surtir nada (para que el llamador no marque la requisición
 * como surtida).
 */
export function planSurtido(items: SurtirItemEntrada[]): PlanSurtido {
  if (!items || items.length === 0) {
    throw new Error('La requisición no tiene artículos')
  }

  const planes: SurtirItemPlan[] = []
  let totalPendiente = 0
  let totalSurtido = 0

  for (const item of items) {
    const solicitada = Number(item.cantidadSolicitada) || 0
    const yaSurtida = Number(item.cantidadSurtida) || 0
    const stock = Number(item.stockActual) || 0
    const pendiente = Math.max(0, solicitada - yaSurtida)

    if (pendiente <= 0) {
      // Ya estaba totalmente surtido: no se vuelve a descontar nada.
      planes.push({
        id: item.id,
        productoId: item.productoId,
        pendiente: 0,
        cantidadASurtir: 0,
        nuevoStock: stock,
        nuevaCantidadSurtida: yaSurtida,
        nuevoEstadoItem:
          yaSurtida >= solicitada && solicitada > 0
            ? 'SURTIMIENTO_COMPLETO'
            : 'SIN_STOCK',
        hayQueEscribir: false,
      })
      continue
    }

    const cantidadASurtir = Math.min(stock, pendiente)
    totalPendiente += pendiente
    totalSurtido += cantidadASurtir

    planes.push({
      id: item.id,
      productoId: item.productoId,
      pendiente,
      cantidadASurtir,
      nuevoStock: stock - cantidadASurtir,
      nuevaCantidadSurtida: yaSurtida + cantidadASurtir,
      nuevoEstadoItem:
        cantidadASurtir === pendiente
          ? 'SURTIMIENTO_COMPLETO'
          : cantidadASurtir > 0
            ? 'PARCIAL'
            : 'SIN_STOCK',
      hayQueEscribir: true,
    })
  }

  if (totalSurtido === 0) {
    throw new Error(
      'No hay stock de NINGÚN artículo. No se puede surtir la requisición.',
    )
  }

  return {
    items: planes,
    totalPendiente,
    totalSurtido,
    nuevoEstadoOrden:
      totalSurtido === totalPendiente ? 'ENTREGADA' : 'PARCIAL',
  }
}

/**
 * Error que devuelve la RPC `surtir_orden` cuando la función no
 * existe todavía en Supabase (migración sin correr). PostgREST lo
 * devuelve con código PGRST202.
 */
export function esErrorFuncionInexistente(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message = (error as { message?: unknown }).message
  if (typeof code === 'string' && code === 'PGRST202') return true
  return (
    typeof message === 'string' &&
    /could not find the function/i.test(message)
  )
}

/**
 * Convierte el error que llega al cliente al fallar `surtirOrden()` en
 * un mensaje humano. En producción Next.js redacta el mensaje real
 * del servidor y el cliente solo recibe "Minified React error #441"
 * (error de render de Server Components) con un `digest` que es la
 * clave para buscar el error real en el registro del servidor. En ese
 * caso nunca se muestra el "#441" tal cual al usuario.
 */
export function mensajeErrorSurtir(error: unknown): {
  mensaje: string
  digest?: string
} {
  const digestRaw = (error as { digest?: unknown } | null)?.digest
  const digest =
    typeof digestRaw === 'string' && digestRaw.length > 0
      ? digestRaw
      : undefined
  const texto =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  if (
    /minified react error #441/i.test(texto) ||
    /an error occurred in the server components render/i.test(texto)
  ) {
    return {
      mensaje:
        'No se pudo surtir la requisición. El servidor registró el error, pero el mensaje no llegó al teléfono. Inténtalo de nuevo; si persiste, revisa el registro del servidor' +
        (digest ? ` (código: ${digest})` : '') +
        '.',
      digest,
    }
  }

  return {
    mensaje:
      texto || 'No se pudo surtir la requisición. Inténtalo de nuevo.',
    digest,
  }
}
