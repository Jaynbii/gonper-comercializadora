import { createClient } from '@/utils/supabase/server'
import DashboardView, { type FilaProyeccion, type UltimaOrden } from './DashboardView'

type OrdenActiva = {
  id: string
  estado: string
  orden_items: Array<{
    cantidad_solicitada: number
    cantidad_surtida: number
    producto_id: string
  }> | null
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: ordenesPendientes },
    { count: ordenesParciales },
    { data: productos },
    { data: ultimasOrdenes },
    { data: ordenesActivas },
  ] = await Promise.all([
    supabase
      .from('ordenes')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'PENDIENTE'),
    supabase
      .from('ordenes')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'PARCIAL'),
    supabase
      .from('productos')
      .select('id, nombre, sku, stock_actual, stock_minimo'),
    supabase
      .from('ordenes')
      .select('id, folio, estado, created_at, clientes (nombre)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('ordenes')
      .select(
        `
        id, estado,
        orden_items ( cantidad_solicitada, cantidad_surtida, producto_id )
      `,
      )
      .in('estado', ['PENDIENTE', 'PARCIAL']),
  ])

  const demandaPorProducto: Record<string, number> = {}

  ;(ordenesActivas as unknown as OrdenActiva[] | null)?.forEach((orden) => {
    orden.orden_items?.forEach((item) => {
      const pendiente =
        Number(item.cantidad_solicitada) - Number(item.cantidad_surtida)

      if (pendiente > 0) {
        demandaPorProducto[item.producto_id] =
          (demandaPorProducto[item.producto_id] ?? 0) + pendiente
      }
    })
  })

  const proyeccion: FilaProyeccion[] = (productos ?? [])
    .map((producto) => {
      const requerido = demandaPorProducto[producto.id] ?? 0
      const stock = Number(producto.stock_actual) || 0

      return {
        id: producto.id,
        nombre: producto.nombre,
        sku: producto.sku,
        requerido,
        stock,
        faltante: Math.max(0, requerido - stock),
      }
    })
    .filter((producto) => producto.requerido > 0)
    .sort((a, b) => b.faltante - a.faltante)

  const stockCritico =
    productos?.filter(
      (producto) => Number(producto.stock_actual) <= Number(producto.stock_minimo),
    ).length ?? 0

  const hoyCrudo = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mazatlan',
  }).format(new Date())
  const hoy = hoyCrudo.charAt(0).toUpperCase() + hoyCrudo.slice(1)

  return (
    <DashboardView
      hoy={hoy}
      pendientes={ordenesPendientes ?? 0}
      parciales={ordenesParciales ?? 0}
      stockCritico={stockCritico}
      totalProductos={productos?.length ?? 0}
      ultimasOrdenes={(ultimasOrdenes ?? []) as UltimaOrden[]}
      proyeccion={proyeccion}
    />
  )
}
