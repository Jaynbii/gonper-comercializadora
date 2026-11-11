import { createClient, esUsuarioAdmin } from '@/utils/supabase/server'
import ComprasClient from './ComprasClient'
import {
  calcularFaltantePorOrden,
  type FaltantePorOrden,
  type PrecioProveedor,
  type ProductoStock,
} from '@/utils/faltantesPorOrden'

type Relacion<T> = T | T[] | null

type ItemActivo = {
  cantidad_solicitada: number | string
  cantidad_surtida: number | string | null
  producto_id: string
}

type ProductoCompra = {
  id: string
  nombre: string
  sku: string
  unidad_medida: string | null
}

type OrdenActiva = {
  id: string
  folio: string
  estado: string
  created_at: string
  clientes: Relacion<{ nombre: string }>
  orden_items: ItemActivo[] | null
}

type RequisicionActiva = {
  id: string
  folio: string
  estado: string
  created_at: string
  clientes: Relacion<{ nombre: string }>
}

type OrdenCompraCruda = {
  id: string
  folio: string
  estado: string
  total_estimado: number | string
  created_at: string
  proveedores: Relacion<{ nombre: string }>
  orden_compra_items:
    | {
        id: string
        cantidad_solicitada: number | string
        cantidad_recibida: number | string
        productos: Relacion<ProductoCompra>
      }[]
    | null
}

export default async function ComprasPage({
  searchParams,
}: {
  // ?orden=<id> llega desde el detalle de una requisición: abre Compras ya
  // filtrada a esa requisición (vista "Por requisición" y card seleccionada).
  // &comprar=1 abre además el diálogo de compra de su faltante.
  searchParams?: Promise<{ orden?: string | string[]; comprar?: string | string[] }>
}) {
  const supabase = await createClient()
  const params = (await searchParams) || {}
  const ordenIdInicial = Array.isArray(params.orden)
    ? params.orden[0]
    : params.orden
  const comprarRaw = Array.isArray(params.comprar)
    ? params.comprar[0]
    : params.comprar
  const comprarInicial = comprarRaw === '1'

  // ¿El usuario actual es admin? Solo el admin ve la opción de
  // eliminar órdenes de compra (anidada en el menú "..." de la
  // card). El servidor vuelve a comprobarlo en eliminarOrdenCompra;
  // esto solo decide si se muestra la opción.
  const esAdmin = await esUsuarioAdmin(supabase)

  // 1. Calcular faltantes (Requisiciones activas vs Stock)
  const { data: ordenesActivas } = await supabase
    .from('ordenes')
    .select(
      `id, folio, estado, created_at, clientes (nombre), orden_items (cantidad_solicitada, cantidad_surtida, producto_id)`,
    )
    .in('estado', ['PENDIENTE', 'PARCIAL'])

  const demandaPorProducto: Record<string, number> = {}
  ;(ordenesActivas as unknown as OrdenActiva[] | null)?.forEach((orden) => {
    orden.orden_items?.forEach((item: ItemActivo) => {
      const pendiente = Number(item.cantidad_solicitada) - Number(item.cantidad_surtida)
      if (pendiente > 0) {
        demandaPorProducto[item.producto_id] = (demandaPorProducto[item.producto_id] || 0) + pendiente
      }
    })
  })

  const { data: productos } = await supabase.from('productos').select('id, nombre, sku, stock_actual, unidad_medida')

  const faltantes = (productos || []).map(prod => {
    const requerido = demandaPorProducto[prod.id] || 0
    const stock = Number(prod.stock_actual) || 0
    const faltante = Math.max(0, requerido - stock)
    return { ...prod, requerido, stock, faltante }
  }).filter(p => p.faltante > 0)

  // 2. Traer datos de forma separada (A PRUEBA DE FALLOS)
  const [
    { data: rawProveedores },
    { data: rawRelaciones },
    { data: ordenesCompra },
    { data: requisicionesCrudas }
  ] = await Promise.all([
    supabase.from('proveedores').select('id, nombre'),
    supabase.from('producto_proveedores').select('*'),
    supabase.from('ordenes_compra').select(`
      id, folio, estado, total_estimado, created_at,
      proveedores (nombre),
      orden_compra_items (
        id, cantidad_solicitada, cantidad_recibida,
        productos (nombre, sku, id, unidad_medida)
      )
    `).order('created_at', { ascending: false }),
    supabase
      .from('ordenes')
      .select('id, folio, estado, created_at, clientes (nombre)')
      .in('estado', ['PENDIENTE', 'PARCIAL'])
      .order('created_at', { ascending: false })
  ])

  // 3. Unir proveedores con sus precios manualmente
  const proveedores = (rawProveedores || []).map(prov => {
    const relacionesProv = rawRelaciones?.filter(rel => rel.proveedor_id === prov.id) || []
    return {
      ...prov,
      producto_proveedores: relacionesProv
    }
  })

  // 4. Faltante por requisición (Fase 1): una card por requisición activa, con su
  // proveedor sugerido (el más barato con precio registrado) y su
  // costo estimado. El surtido parcial se preserva: el % incluye lo
  // ya surtido y lo que hay en stock.
  const nombreProveedor = new Map<string, string>(
    (rawProveedores || []).map((p: { id: string; nombre: string }) => [p.id, p.nombre]),
  )
  const preciosPorProducto = new Map<string, PrecioProveedor[]>()
  for (const rel of rawRelaciones || []) {
    const precio = Number(rel.precio_unitario)
    if (!Number.isFinite(precio) || precio <= 0) continue
    const lista = preciosPorProducto.get(rel.producto_id) || []
    lista.push({
      proveedorId: rel.proveedor_id,
      proveedorNombre: nombreProveedor.get(rel.proveedor_id) || 'Proveedor',
      precioUnitario: precio,
    })
    preciosPorProducto.set(rel.producto_id, lista)
  }

  const productosMap = new Map<string, ProductoStock>(
    (productos || []).map((p) => [
      p.id,
      {
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        unidadMedida: p.unidad_medida,
        stockActual: Number(p.stock_actual) || 0,
      },
    ]),
  )

  const nombreCliente = (clientes: Relacion<{ nombre: string }>) =>
    Array.isArray(clientes)
      ? clientes[0]?.nombre || 'Cliente desconocido'
      : clientes?.nombre || 'Cliente desconocido'

  const faltantesPorOrden: FaltantePorOrden[] = (
    (ordenesActivas as unknown as OrdenActiva[] | null) || []
  )
    .map((orden) =>
      calcularFaltantePorOrden({
        ordenId: orden.id,
        folio: orden.folio,
        clienteNombre: nombreCliente(orden.clientes),
        estado: orden.estado,
        createdAt: orden.created_at,
        items: (orden.orden_items || []).map((item) => ({
          productoId: item.producto_id,
          cantidadSolicitada: Number(item.cantidad_solicitada) || 0,
          cantidadSurtida: Number(item.cantidad_surtida) || 0,
        })),
        productos: productosMap,
        preciosPorProducto,
      }),
    )
    // Las más antiguas primero: son las que Alex y su jefe priorizan cada mañana.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // 5. Vínculo compra -> requisición (Fase 1c ampliada). La columna
  // requisition_id solo existe después de correr la migración
  // 20261106010000_add_requisition_id_to_ordenes_compra.sql: si la
  // consulta falla (columna aún no existe), la página sigue cargando
  // y las compras se muestran como "Sin requisición".
  const vinculos = new Map<string, string>()
  const { data: links, error: linksError } = await supabase
    .from('ordenes_compra')
    .select('id, requisition_id')
  if (!linksError && links) {
    for (const link of links as unknown as {
      id: string
      requisition_id: string | null
    }[]) {
      if (link.requisition_id) vinculos.set(link.id, link.requisition_id)
    }
  }
  const infoRequisicion = new Map<
    string,
    { folio: string; clienteNombre: string }
  >()
  if (vinculos.size > 0) {
    const { data: reqsVinculadas } = await supabase
      .from('ordenes')
      .select('id, folio, clientes (nombre)')
      .in('id', [...new Set(vinculos.values())])
    for (const req of (reqsVinculadas as unknown as {
      id: string
      folio: string
      clientes: Relacion<{ nombre: string }>
    }[] | null) || []) {
      infoRequisicion.set(req.id, {
        folio: req.folio,
        clienteNombre: nombreCliente(req.clientes),
      })
    }
  }

  return (
    <ComprasClient
      faltantes={faltantes}
      proveedores={proveedores || []}
      ordenesCompra={normalizarOrdenes(ordenesCompra, vinculos, infoRequisicion)}
      requisiciones={normalizarRequisiciones(requisicionesCrudas)}
      faltantesPorOrden={faltantesPorOrden}
      ordenIdInicial={ordenIdInicial}
      comprarInicial={comprarInicial}
      esAdmin={esAdmin}
    />
  )
}

// Supabase entrega las relaciones como arreglos cuando no hay tipos
// generados. La interfaz del cliente usa el primer elemento.
function normalizarOrdenes(
  ordenes: OrdenCompraCruda[] | null,
  vinculos: Map<string, string>,
  infoRequisicion: Map<string, { folio: string; clienteNombre: string }>,
) {
  return (ordenes || []).map((orden) => {
    const requisicionId = vinculos.get(orden.id)
    const info = requisicionId
      ? infoRequisicion.get(requisicionId)
      : undefined
    return {
      ...orden,
      // Para qué requisición es esta compra (null = vieja o general).
      requisicion:
        requisicionId && info
          ? {
              id: requisicionId,
              folio: info.folio,
              clienteNombre: info.clienteNombre,
            }
          : null,
      proveedores: Array.isArray(orden.proveedores)
        ? orden.proveedores[0] ?? null
        : orden.proveedores,
      orden_compra_items: (orden.orden_compra_items || []).map((item) => ({
        ...item,
        productos: Array.isArray(item.productos)
          ? item.productos[0] ?? null
          : item.productos,
      })),
    }
  })
}
function normalizarRequisiciones(ordenes: RequisicionActiva[] | null) {
  return (ordenes || []).map((orden) => ({
    ...orden,
    clientes: Array.isArray(orden.clientes)
      ? orden.clientes[0] ?? null
      : orden.clientes,
  }))
}
