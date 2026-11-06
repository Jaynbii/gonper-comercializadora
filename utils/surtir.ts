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
// Segunda vuelta (digest 2179146847, nov 2026): el surtido SEGUÍA
// fallando y el teléfono solo veía el mensaje humano del #441, no la
// causa. Causa confirmada en Supabase por Alex: REQ-0003 quedó en
// PENDIENTE con 10 de 13 artículos ya marcados SURTIMIENTO_COMPLETO
// (cantidad_surtida = solicitada) y stock 0, y los 3 restantes
// SIN_STOCK (Fabuloso 20L, Jabón C/3 Kgs, Papel P/WC jumbo 400)
// también con stock 0. `planSurtido()` veía totalSurtido = 0 y
// lanzaba "No hay stock de NINGÚN artículo", y ese throw se redactaba
// como #441 en producción. Por eso `surtirOrden()` ya NO lanza: la
// función `surtirConCliente()` de este módulo DEVUELVE
// `{ success: false, error: 'mensaje real' }`, porque los valores
// devueltos por una Server Action NO se redactan, solo los throws.
// El mensaje de "sin stock" ahora además dice cuántos artículos ya
// están surtidos y cuáles son los que no tienen stock.
//
// Reglas de negocio (no cambiar sin acordarlo con Alex):
// - El surtido PARCIAL se preserva: piden 10, hay 6, se surten 6 y la
//   requisición queda PARCIAL. Transaccional NO significa
//   todo-o-nada en negocio, sino que los writes de UN surtido van
//   juntos o no van.

export type SurtirItemEntrada = {
  id: string
  productoId: string
  /** Nombre del producto, solo para los mensajes de error. */
  nombre?: string | null
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
  // Nombres para el diagnóstico cuando no se puede surtir nada (ver
  // abajo): sin ellos el error "No hay stock" no dice qué falta.
  const nombres = new Map<string, string>()
  for (const item of items) {
    if (item.nombre) nombres.set(item.id, item.nombre)
  }

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
    // Diagnóstico con el estado real, no solo "no hay stock": con
    // REQ-0003 (confirmado en Supabase 2026-11-06 01:01 MST) esto es lo
    // que pasaba: 10 de 13 artículos ya estaban marcados como surtidos
    // (cantidad_surtida = solicitada) con stock 0, y los 3 pendientes
    // (Fabuloso 20L, Jabón C/3 Kgs, Papel P/WC jumbo 400) tampoco
    // tenían stock. El mensaje genérico no decía nada de eso.
    const yaSurtidos = planes.filter((p) => p.pendiente <= 0).length
    const pendientes = planes.filter((p) => p.pendiente > 0)
    if (totalPendiente === 0) {
      throw new Error(
        `Todos los artículos de esta requisición ya aparecen como surtidos (cantidad surtida = cantidad solicitada, ${yaSurtidos} de ${items.length}), pero la requisición sigue sin marcarse como surtida. No hay nada pendiente por surtir. Si la requisición ya se entregó, corrige su estado a ENTREGADA en Supabase; si aún falta mercancía, corrige cantidad_surtida y estado_item de los artículos y vuelve a intentar.`,
      )
    }
    const sinStock = pendientes
      .map(
        (p) =>
          `${nombres.get(p.id) ?? `artículo ${p.id}`} (pendiente ${p.pendiente})`,
      )
      .join(', ')
    throw new Error(
      `No hay stock de NINGÚN artículo pendiente. Ya surtidos: ${yaSurtidos} de ${items.length}. Sin stock para surtir: ${sinStock}. Para surtir lo que falta, primero recibe mercancía de esos artículos; si la requisición ya se entregó, corrige su estado en Supabase.`,
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
 * devuelve con código PGRST202 y el mensaje "Could not find the
 * function ... in the schema cache" — verificado con la librería
 * real (@supabase/postgrest-js 2.118.0) y un fetch simulado
 * (/tmp/repro_rpc.mjs, no versionado): `supabase.rpc()` RESUELVE
 * `{ data: null, error: { code: 'PGRST202', message: ... } }`, no
 * lanza. Por si otra versión de PostgREST devuelve el error sin
 * código, también se aceptan "does not exist" y "schema cache".
 */
export function esErrorFuncionInexistente(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message = (error as { message?: unknown }).message
  const details = (error as { details?: unknown }).details
  if (typeof code === 'string' && code === 'PGRST202') return true
  const texto = [message, details]
    .filter((t): t is string => typeof t === 'string')
    .join(' ')
  return (
    /could not find the function/i.test(texto) ||
    /schema cache/i.test(texto) ||
    /function .* does not exist/i.test(texto)
  )
}

/**
 * Resultado de `surtirOrden()`: NUNCA se lanza un error, se devuelve.
 * En producción Next.js redacta el mensaje real de cualquier error
 * lanzado por una Server Action y el cliente solo recibe "Minified
 * React error #441" con un digest (eso fue el digest 2179146847 al
 * surtir REQ-0003). Los valores DEVUELTOS por una Server Action, en
 * cambio, llegan tal cual al teléfono: por eso el fallo se devuelve
 * como `{ success: false, error: 'mensaje real' }`.
 */
export type ResultadoSurtido =
  | { success: true; estado: string }
  | { success: false; error: string }

/** Error con la forma que devuelve PostgREST/Supabase. */
export type ErrorPostgrest = {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

/**
 * Cliente mínimo de Supabase que necesita el surtido. Se tipa como
 * estructura mínima (no como el cliente completo) para poder probarlo
 * con un mock fiel de PostgREST sin base de datos. Los builders de
 * PostgREST son thenables: `.eq()` se puede esperar directamente
 * (lista) o rematar con `.single()` (una fila).
 */
export type ClienteSurtido = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: ErrorPostgrest | null }>
  from: (tabla: string) => {
    select: (columnas: string) => {
      eq: <T>(
        columna: string,
        valor: unknown,
      ) => Promise<{ data: T | null; error: ErrorPostgrest | null }> & {
        single: () => Promise<{
          data: T | null
          error: ErrorPostgrest | null
        }>
      }
    }
    update: (valores: Record<string, unknown>) => {
      eq: (
        columna: string,
        valor: unknown,
      ) => Promise<{ data: unknown; error: ErrorPostgrest | null }>
    }
    insert: (
      valores: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: ErrorPostgrest | null }>
  }
}

type FilaOrdenItem = {
  id: string
  cantidad_solicitada: number | string
  cantidad_surtida: number | string | null
  producto_id: string
  productos:
    | { nombre?: string | null; stock_actual: number | string | null }
    | Array<{ nombre?: string | null; stock_actual: number | string | null }>
    | null
}

/**
 * Surtido completo con un cliente de Supabase (real o mock): RPC
 * transaccional si existe, vía secuencial de respaldo si la RPC aún
 * no existe. Devuelve el resultado, nunca lanza: así el mensaje real
 * del fallo llega al teléfono en vez de redactarse como #441.
 * `surtirOrden()` en app/(dashboard)/ordenes/actions.ts solo crea el
 * cliente, valida al usuario y llama a esta función.
 */
export async function surtirConCliente(
  cliente: unknown,
  ordenId: string,
  usuarioId: string,
): Promise<ResultadoSurtido> {
  const supabase = cliente as ClienteSurtido
  try {
    // Vía principal: RPC transaccional `surtir_orden` (migración
    // supabase/migrations/20261106020000_surtir_orden_rpc.sql).
    const { data: estadoRpc, error: errorRpc } = await supabase.rpc(
      'surtir_orden',
      { p_orden_id: ordenId },
    )
    if (!errorRpc) {
      return { success: true, estado: String(estadoRpc) }
    }

    // Si la RPC aún no existe en Supabase (migración sin correr), se
    // usa la vía secuencial de respaldo. Cualquier OTRO error de la
    // RPC (p. ej. sin stock, ya entregada) es real y NO se reintenta
    // por la vía de respaldo: se devuelve tal cual.
    if (!esErrorFuncionInexistente(errorRpc)) {
      return { success: false, error: errorRpc.message }
    }

    // Vía de respaldo (sin transacción, solo si la RPC no existe):
    // plan puro + writes en secuencia, VERIFICANDO cada error.
    const { data: ordenActual } = await supabase
      .from('ordenes')
      .select('estado')
      .eq<{ estado?: string }>('id', ordenId)
      .single()
    if (ordenActual?.estado === 'ENTREGADA') {
      return {
        success: false,
        error: 'Esta requisición ya fue surtida y entregada previamente.',
      }
    }

    const { data: items, error: itemsError } = await supabase
      .from('orden_items')
      .select(
        `id, cantidad_solicitada, cantidad_surtida, producto_id, productos (nombre, stock_actual)`,
      )
      .eq<FilaOrdenItem[]>('orden_id', ordenId)
    if (itemsError) {
      return { success: false, error: `Error al leer items: ${itemsError.message}` }
    }
    if (!items || items.length === 0) {
      return { success: false, error: 'La requisición no tiene artículos' }
    }

    let plan: PlanSurtido
    try {
      plan = planSurtido(
        items.map((item) => {
          const producto = Array.isArray(item.productos)
            ? item.productos[0]
            : item.productos
          return {
            id: item.id,
            productoId: item.producto_id,
            nombre: producto?.nombre ?? null,
            cantidadSolicitada: Number(item.cantidad_solicitada) || 0,
            cantidadSurtida: Number(item.cantidad_surtida) || 0,
            stockActual: producto ? Number(producto.stock_actual) || 0 : null,
          }
        }),
      )
    } catch (error: unknown) {
      // planSurtido ya trae el diagnóstico (p. ej. REQ-0003: 10 de 13
      // ya surtidos y los 3 pendientes sin stock). Se devuelve, no se
      // lanza, para que llegue tal cual al teléfono.
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo surtir la requisición.',
      }
    }

    for (const item of plan.items) {
      if (!item.hayQueEscribir) continue

      const { error: errorStock } = await supabase
        .from('productos')
        .update({ stock_actual: item.nuevoStock })
        .eq('id', item.productoId)
      if (errorStock) {
        return {
          success: false,
          error: `Error al actualizar el stock: ${errorStock.message}`,
        }
      }

      const { error: errorItem } = await supabase
        .from('orden_items')
        .update({
          cantidad_surtida: item.nuevaCantidadSurtida,
          estado_item: item.nuevoEstadoItem,
        })
        .eq('id', item.id)
      if (errorItem) {
        return {
          success: false,
          error: `Error al actualizar el artículo: ${errorItem.message}`,
        }
      }

      if (item.cantidadASurtir > 0) {
        const { error: errorMovimiento } = await supabase
          .from('movimientos_inventario')
          .insert({
            producto_id: item.productoId,
            tipo_movimiento: 'SALIDA_ORDEN',
            cantidad: item.cantidadASurtir,
            motivo: 'Surtido de requisición',
            orden_id: ordenId,
            usuario_id: usuarioId,
          })
        if (errorMovimiento) {
          return {
            success: false,
            error: `Error al registrar el movimiento: ${errorMovimiento.message}`,
          }
        }
      }
    }

    const { error: updateError } = await supabase
      .from('ordenes')
      .update({ estado: plan.nuevoEstadoOrden })
      .eq('id', ordenId)
    if (updateError) {
      return {
        success: false,
        error: `Error al actualizar la requisición: ${updateError.message}`,
      }
    }

    return { success: true, estado: plan.nuevoEstadoOrden }
  } catch (error: unknown) {
    // Seguridad: nada de lo que falle dentro del surtido debe llegar
    // al cliente como un throw redactado (#441).
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo surtir la requisición.',
    }
  }
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
