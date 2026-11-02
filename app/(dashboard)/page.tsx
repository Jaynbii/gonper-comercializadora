import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import DashboardProjectionCard from './DashboardProjectionCard'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Consultas básicas
  const [
    { count: ordenesPendientes },
    { data: productos },
    { count: totalProveedores }, // 👈 Cambiamos la consulta
    { data: ultimasOrdenes }
  ] = await Promise.all([
    supabase.from('ordenes').select('*', { count: 'exact', head: true }).eq('estado', 'PENDIENTE'),
    supabase.from('productos').select('id, nombre, sku, stock_actual, stock_minimo'),
    // Contamos los proveedores en la nueva tabla
    supabase.from('proveedores').select('*', { count: 'exact', head: true }), 
    supabase.from('ordenes').select(`id, folio, estado, created_at, clientes (nombre)`).order('created_at', { ascending: false }).limit(3)
  ])

  // 2. Consulta de órdenes activas
  const { data: ordenesActivas } = await supabase
    .from('ordenes')
    .select(`
      id, estado,
      orden_items ( cantidad_solicitada, cantidad_surtida, producto_id )
    `)
    .in('estado', ['PENDIENTE', 'PARCIAL'])

  // 3. Cálculo de demanda
  const demandaPorProducto: Record<string, number> = {}
  ordenesActivas?.forEach(orden => {
    orden.orden_items?.forEach((item: any) => {
      const pendiente = Number(item.cantidad_solicitada) - Number(item.cantidad_surtida)
      if (pendiente > 0) {
        if (!demandaPorProducto[item.producto_id]) demandaPorProducto[item.producto_id] = 0
        demandaPorProducto[item.producto_id] += pendiente
      }
    })
  })

  // 4. Cotejo con Inventario
  const reporteInventario = (productos || [])
    .map(prod => {
      const requerido = demandaPorProducto[prod.id] || 0
      const stock = Number(prod.stock_actual) || 0
      const faltante = Math.max(0, requerido - stock) 
      return { ...prod, requerido, stock, faltante }
    })
    .filter(p => p.requerido > 0) 
    .sort((a, b) => b.faltante - a.faltante) 

  // Contadores para las tarjetas
  const stockCritico = productos?.filter(p => p.stock_actual <= p.stock_minimo).length || 0
  const totalFaltantes = reporteInventario.filter(p => p.faltante > 0).length

  const getBadgeColor = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-amber-100 text-amber-700'
      case 'PARCIAL': return 'bg-orange-100 text-orange-700'
      case 'ENTREGADA': return 'bg-emerald-100 text-emerald-700'
      case 'CANCELADA': return 'bg-red-100 text-red-700'
      case 'BORRADOR': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      
      {/* ENCABEZADO CON BOTÓN RÁPIDO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gonper-text">Resumen General</h1>
          <p className="text-sm text-gonper-muted mt-1">Estado actual de Gonper Comercializadora</p>
        </div>
        
        <Link 
          href="/ordenes/nueva" 
          className="w-full md:w-auto bg-gonper-primary hover:bg-gonper-primary-hover text-white px-6 py-3 rounded-xl font-bold shadow-md transition-transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
        >
          <span className="text-xl">📄</span> Subir Nueva Requisición
        </Link>
      </div>

      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        
        {/* Tarjeta 1: Órdenes Pendientes */}
        <div className="bg-gonper-surface p-6 rounded-xl border border-gonper-border shadow-sm border-l-4 border-l-amber-500 flex flex-col justify-between">
          <h3 className="text-gonper-muted text-sm font-medium">Órdenes Pendientes</h3>
          <div className="flex items-end justify-between mt-4">
            <p className="text-4xl font-bold text-amber-500">{ordenesPendientes || 0}</p>
            <Link href="/ordenes" className="text-sm text-gonper-primary hover:underline font-medium">Ver todas &rarr;</Link>
          </div>
        </div>

        {/* Tarjeta 2: Stock Crítico */}
        <div className="bg-gonper-surface p-6 rounded-xl border border-gonper-border shadow-sm border-l-4 border-l-red-500 flex flex-col justify-between">
          <h3 className="text-gonper-muted text-sm font-medium">Stock Crítico (Mínimo)</h3>
          <div className="flex items-end justify-between mt-4">
            <p className="text-4xl font-bold text-red-500">{stockCritico}</p>
            <Link href="/inventario" className="text-sm text-gonper-primary hover:underline font-medium">Ver inventario &rarr;</Link>
          </div>
        </div>

        {/* Tarjeta 3: PROVEEDORES (Actualizada) */}
        <div className="bg-gonper-surface p-6 rounded-xl border border-gonper-border shadow-sm border-l-4 border-l-blue-500 flex flex-col justify-between">
          <h3 className="text-gonper-muted text-sm font-medium">Directorio de Proveedores</h3>
          <div className="flex items-end justify-between mt-4">
            <p className="text-4xl font-bold text-blue-500">{totalProveedores || 0}</p>
            <Link href="/proveedores" className="text-sm text-gonper-primary hover:underline font-medium">Ver proveedores &rarr;</Link>
          </div>
        </div>

        {/* Tarjeta 4: Proyección de Demanda (Componente Client) */}
        <DashboardProjectionCard data={reporteInventario} totalFaltantes={totalFaltantes} />

      </div>

      {/* ÚLTIMAS ÓRDENES RECIBIDAS */}
      <div className="bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gonper-border flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold text-gonper-text">Últimas órdenes recibidas</h2>
          <Link href="/ordenes" className="text-sm text-gonper-primary hover:underline font-medium">Ir a órdenes &rarr;</Link>
        </div>
        <div className="divide-y divide-gonper-border">
          {ultimasOrdenes && ultimasOrdenes.length > 0 ? (
            ultimasOrdenes.map((orden) => (
              <div key={orden.id} className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gonper-bg/50 transition-colors">
                <div>
                  <p className="font-bold text-gonper-text">{(orden.clientes as any)?.nombre || 'Cliente Desconocido'}</p>
                  <p className="text-sm text-gonper-muted font-mono mt-1">{orden.folio}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${getBadgeColor(orden.estado)}`}>{orden.estado}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gonper-muted">No hay órdenes registradas todavía.</div>
          )}
        </div>
      </div>

    </div>
  )
}