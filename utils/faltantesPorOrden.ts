// Cálculo de faltantes por requisición de cliente (Gonper, Fase 1).
//
// Es código puro, sin Supabase ni Next.js, para poder probarlo con
// `node --test` sin base de datos.
//
// Reglas de negocio (no cambiar sin acordarlo con Alex):
// - El surtido parcial se preserva: si piden 10 y hay 6 en stock, se
//   surten 6 y el faltante es 4. Nada de todo-o-nada.
// - El faltante de un artículo es lo que queda por surtir después de
//   descontar lo ya surtido y lo que hay en stock:
//   pendiente = solicitada - surtida
//   aSurtir   = min(stock, pendiente)
//   faltante  = pendiente - aSurtir
// - El % que ya se puede surtir incluye lo ya surtido:
//   (surtida + aSurtir) / solicitada.
// - El proveedor sugerido es el más barato con precio registrado
//   (> 0) en producto_proveedores. Sin precio registrado, no se
//   inventa uno: el artículo queda como "sin precio".
// - Al consolidar varias órdenes, el stock se descuenta UNA sola vez:
//   faltanteConsolidado = max(0, suma(pendientes) - stock).
//   Sumar los faltantes por orden subestimaría la compra cuando dos
//   órdenes piden el mismo producto.

export type ItemDemanda = {
  productoId: string
  cantidadSolicitada: number
  cantidadSurtida?: number | null
}

export type ProductoStock = {
  id: string
  nombre: string
  sku: string
  unidadMedida: string | null
  stockActual: number
}

export type PrecioProveedor = {
  proveedorId: string
  proveedorNombre: string
  precioUnitario: number
}

export type FaltantePorOrdenItem = {
  productoId: string
  nombre: string
  sku: string
  unidadMedida: string | null
  cantidadSolicitada: number
  cantidadSurtida: number
  pendiente: number
  enStock: number
  faltante: number
  proveedorSugerido: PrecioProveedor | null
  costoEstimado: number | null
}

export type FaltantePorOrden = {
  ordenId: string
  folio: string
  clienteNombre: string
  estado: string
  createdAt: string
  porcentajeSurtible: number
  faltantes: FaltantePorOrdenItem[]
  costoEstimadoTotal: number
  tieneSinPrecio: boolean
  // Demanda pendiente por producto (incluye artículos ya cubiertos),
  // para recalcular el consolidado de las órdenes seleccionadas
  // descontando el stock una sola vez.
  demanda: { productoId: string; pendiente: number; enStock: number }[]
}

export function proveedorSugerido(
  precios: PrecioProveedor[],
): PrecioProveedor | null {
  const conPrecio = precios.filter(
    (p) => Number.isFinite(p.precioUnitario) && p.precioUnitario > 0,
  )
  if (conPrecio.length === 0) return null
  return conPrecio.reduce((mejor, actual) =>
    actual.precioUnitario < mejor.precioUnitario ? actual : mejor,
  )
}

export function calcularFaltantePorOrden(args: {
  ordenId: string
  folio: string
  clienteNombre: string
  estado: string
  createdAt: string
  items: ItemDemanda[]
  productos: Map<string, ProductoStock>
  preciosPorProducto: Map<string, PrecioProveedor[]>
}): FaltantePorOrden {
  const { ordenId, folio, clienteNombre, estado, createdAt, items, productos, preciosPorProducto } =
    args

  let solicitadoTotal = 0
  let surtibleTotal = 0
  const faltantes: FaltantePorOrdenItem[] = []
  const demanda: { productoId: string; pendiente: number; enStock: number }[] = []

  for (const item of items) {
    const producto = productos.get(item.productoId)
    if (!producto) continue
    const solicitada = Number(item.cantidadSolicitada) || 0
    const surtida = Number(item.cantidadSurtida) || 0
    const pendiente = Math.max(0, solicitada - surtida)
    const enStock = Number(producto.stockActual) || 0
    const aSurtir = Math.min(enStock, pendiente)
    const faltante = pendiente - aSurtir

    solicitadoTotal += solicitada
    surtibleTotal += surtida + aSurtir
    if (pendiente > 0) demanda.push({ productoId: item.productoId, pendiente, enStock })

    if (faltante <= 0) continue

    const sugerido = proveedorSugerido(
      preciosPorProducto.get(item.productoId) || [],
    )
    faltantes.push({
      productoId: item.productoId,
      nombre: producto.nombre,
      sku: producto.sku,
      unidadMedida: producto.unidadMedida,
      cantidadSolicitada: solicitada,
      cantidadSurtida: surtida,
      pendiente,
      enStock,
      faltante,
      proveedorSugerido: sugerido,
      costoEstimado: sugerido ? faltante * sugerido.precioUnitario : null,
    })
  }

  const porcentajeSurtible =
    solicitadoTotal > 0
      ? Math.round((surtibleTotal / solicitadoTotal) * 100)
      : 100

  return {
    ordenId,
    folio,
    clienteNombre,
    estado,
    createdAt,
    porcentajeSurtible,
    faltantes,
    costoEstimadoTotal: faltantes.reduce(
      (acc, f) => acc + (f.costoEstimado ?? 0),
      0,
    ),
    tieneSinPrecio: faltantes.some((f) => f.costoEstimado === null),
    demanda,
  }
}

// Compra por requisición (Fase 1b): agrupa el faltante de UNA
// requisición por proveedor sugerido, para generar una orden de
// compra por proveedor con `generarOrdenCompra`. Solo entran los
// artículos con precio registrado; los "sin precio" se devuelven
// aparte para avisar que hay que pedirlos por WhatsApp y NO se compran.
export type ItemCompraPorProveedor = {
  productoId: string
  nombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export type GrupoCompraProveedor = {
  proveedorId: string
  proveedorNombre: string
  items: ItemCompraPorProveedor[]
  subtotal: number
}

export type ArticuloSinPrecio = {
  productoId: string
  nombre: string
  cantidad: number
}

export function agruparCompraPorProveedor(faltantes: FaltantePorOrdenItem[]): {
  grupos: GrupoCompraProveedor[]
  sinPrecio: ArticuloSinPrecio[]
} {
  const grupos: GrupoCompraProveedor[] = []
  const porProveedor = new Map<string, GrupoCompraProveedor>()
  const sinPrecio: ArticuloSinPrecio[] = []

  for (const item of faltantes) {
    if (!item.proveedorSugerido || item.costoEstimado === null) {
      sinPrecio.push({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.faltante,
      })
      continue
    }
    const sugerido = item.proveedorSugerido
    let grupo = porProveedor.get(sugerido.proveedorId)
    if (!grupo) {
      grupo = {
        proveedorId: sugerido.proveedorId,
        proveedorNombre: sugerido.proveedorNombre,
        items: [],
        subtotal: 0,
      }
      porProveedor.set(sugerido.proveedorId, grupo)
      grupos.push(grupo)
    }
    const subtotal = item.faltante * sugerido.precioUnitario
    grupo.items.push({
      productoId: item.productoId,
      nombre: item.nombre,
      cantidad: item.faltante,
      precioUnitario: sugerido.precioUnitario,
      subtotal,
    })
    grupo.subtotal += subtotal
  }

  return { grupos, sinPrecio }
}

// Anti-duplicado (Fase 1c ampliada): dos compras son "la misma" cuando
// tienen los mismos productos con las mismas cantidades, sin importar
// el orden. Se usa en el servidor antes de generar una orden de compra
// por requisición: si ya existe una PENDIENTE igual para esa
// requisición y ese proveedor, no se genera otra en silencio.
export function esMismaCompra(
  a: { productoId: string; cantidad: number }[],
  b: { productoId: string; cantidad: number }[],
): boolean {
  if (a.length === 0 || a.length !== b.length) return false
  const clave = (items: { productoId: string; cantidad: number }[]) =>
    items
      .map((item) => `${item.productoId}:${Number(item.cantidad) || 0}`)
      .sort()
      .join('|')
  return clave(a) === clave(b)
}

// Comprar+recibir (revisión mobile first): construye los ítems para
// `recibirMercancia` a partir de una orden de compra recién generada
// y de los artículos que se pidieron en ella. La recepción es por lo
// solicitado: cantidad_recibida = cantidad pedida. Solo entran los
// artículos que existen en la orden generada y con cantidad > 0; si
// la orden no trae sus ítems (p. ej. la columna aún no existe en
// producción), no se recibe nada y el llamador debe avisar.
export type ItemOrdenCompraGenerada = {
  id: string
  producto_id: string
  cantidad_solicitada: number
}

export type ItemRecepcionCompra = {
  id: string
  producto_id: string
  cantidad_recibida: number
}

export function construirItemsRecepcion(
  itemsGenerados: ItemOrdenCompraGenerada[],
  itemsPedidos: { productoId: string; cantidad: number }[],
): ItemRecepcionCompra[] {
  const porProducto = new Map(
    itemsGenerados.map((item) => [item.producto_id, item]),
  )
  const resultado: ItemRecepcionCompra[] = []
  for (const pedido of itemsPedidos) {
    const generado = porProducto.get(pedido.productoId)
    const cantidad = Number(pedido.cantidad) || 0
    if (!generado || cantidad <= 0) continue
    resultado.push({
      id: generado.id,
      producto_id: generado.producto_id,
      cantidad_recibida: cantidad,
    })
  }
  return resultado
}

// Agrupado de órdenes de compra por requisición (Fase 1c ampliada):
// un grupo por requisición vinculada, en orden de primera aparición,
// y al final el grupo "Sin requisición" (null) para las compras viejas
// o generadas desde la vista General.
export type RequisicionVinculada = {
  id: string
  folio: string
  clienteNombre: string
}

export type GrupoComprasPorRequisicion<T> = {
  requisicion: RequisicionVinculada | null
  ordenes: T[]
}

/**
 * ¿Se puede eliminar una orden de compra desde la app?
 *
 * Solo el admin y solo si la orden está PENDIENTE. Una orden
 * RECIBIDA no se puede borrar: el stock ya subió al recibirla y
 * borrar la orden no lo bajaría, así que quedaría el inventario
 * inflado sin rastro de la compra. La comprobación del servidor
 * (`eliminarOrdenCompra`) vuelve a verificar estado y admin; esto
 * solo decide si se muestra la opción en la UI.
 */
export function puedeEliminarOrdenCompra(
  estado: string,
  esAdmin: boolean,
): boolean {
  return esAdmin && estado === 'PENDIENTE'
}

export function agruparComprasPorRequisicion<
  T extends { requisicion?: RequisicionVinculada | null },
>(ordenes: T[]): GrupoComprasPorRequisicion<T>[] {
  const grupos: GrupoComprasPorRequisicion<T>[] = []
  const porId = new Map<string, GrupoComprasPorRequisicion<T>>()
  let sinRequisicion: GrupoComprasPorRequisicion<T> | null = null

  for (const orden of ordenes) {
    const req = orden.requisicion ?? null
    if (!req) {
      if (!sinRequisicion) {
        sinRequisicion = { requisicion: null, ordenes: [] }
      }
      sinRequisicion.ordenes.push(orden)
      continue
    }
    let grupo = porId.get(req.id)
    if (!grupo) {
      grupo = { requisicion: req, ordenes: [] }
      porId.set(req.id, grupo)
      grupos.push(grupo)
    }
    grupo.ordenes.push(orden)
  }

  if (sinRequisicion) grupos.push(sinRequisicion)
  return grupos
}

// Consolida el faltante de las órdenes seleccionadas, descontando el
// stock una sola vez por producto. Si no hay selección, el llamador
// debe usar el consolidado general ya calculado en el servidor.
export function consolidarFaltantesSeleccionados(args: {
  ordenes: { items: ItemDemanda[] }[]
  productos: Map<string, ProductoStock>
}): { productoId: string; faltante: number }[] {
  const demandaPorProducto = new Map<string, number>()
  for (const orden of args.ordenes) {
    for (const item of orden.items) {
      const pendiente = Math.max(
        0,
        (Number(item.cantidadSolicitada) || 0) -
          (Number(item.cantidadSurtida) || 0),
      )
      if (pendiente <= 0) continue
      demandaPorProducto.set(
        item.productoId,
        (demandaPorProducto.get(item.productoId) || 0) + pendiente,
      )
    }
  }

  return [...demandaPorProducto.entries()]
    .map(([productoId, demanda]) => {
      const stock = Number(args.productos.get(productoId)?.stockActual) || 0
      return { productoId, faltante: Math.max(0, demanda - stock) }
    })
    .filter((f) => f.faltante > 0)
}
