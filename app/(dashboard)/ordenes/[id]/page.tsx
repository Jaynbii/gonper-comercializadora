import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import BotonSurtir from './BotonSurtir'

export default async function OrdenDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: orden, error } = await supabase
    .from('ordenes')
    .select(`
      id, folio, estado, created_at,
      clientes (nombre),
      orden_items (
        id, cantidad_solicitada, cantidad_surtida, estado_item, unidad,
        productos (nombre, sku, stock_actual, unidad_medida)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !orden) return notFound()

  // Calcular si hay algo para surtir en general
  let hayStockTotal = false
  let hayStockParcial = false

  orden.orden_items.forEach((item: any) => {
    const prod = Array.isArray(item.productos) ? item.productos[0] : item.productos
    if (prod && prod.stock_actual >= item.cantidad_solicitada) hayStockTotal = true
    if (prod && prod.stock_actual > 0) hayStockParcial = true
  })

  const getBadgeColor = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-amber-100 text-amber-700'
      case 'PARCIAL': return 'bg-orange-100 text-orange-700'
      case 'ENTREGADA': return 'bg-emerald-100 text-emerald-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 md:pb-0">
      {/* Header */}
      <div className="mb-6">
        <Link href="/ordenes" className="text-sm text-gonper-primary hover:underline mb-4 inline-block">&larr; Volver a Órdenes</Link>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gonper-surface p-6 rounded-xl border border-gonper-border shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gonper-text">{(orden.clientes as any)?.nombre}</h1>
            <p className="text-sm text-gonper-muted font-mono mt-1">Folio: {orden.folio}</p>
            <p className="text-xs text-gonper-muted mt-1">Fecha: {new Date(orden.created_at).toLocaleString('es-MX')}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getBadgeColor(orden.estado)}`}>
              {orden.estado}
            </span>
            
            {/* Solo mostramos el botón si no está entregada y si hay AL MENOS algo de stock */}
            {orden.estado !== 'ENTREGADA' && orden.estado !== 'PARCIAL' && (
              hayStockParcial ? (
                <BotonSurtir ordenId={orden.id} esParcial={!hayStockTotal} />
              ) : (
                <span className="text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                  ⚠️ Sin Stock: No se puede surtir
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Lista de Artículos */}
      <div className="bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gonper-border bg-gray-50 flex justify-between items-center">
          <h2 className="font-bold text-gonper-text">Cotejo de Inventario</h2>
          <span className="text-xs text-gray-500">El sistema descontará el stock automáticamente al surtir.</span>
        </div>
        <div className="divide-y divide-gonper-border">
          {orden.orden_items.map((item: any) => {
            const prod = Array.isArray(item.productos) ? item.productos[0] : item.productos
            const solicitado = Number(item.cantidad_solicitada)
            const stock = Number(prod?.stock_actual) || 0
            const unidad = item.unidad || prod?.unidad_medida || ''
            
            // Lógica de faltantes
            const aSurtir = Math.min(stock, solicitado)
            const faltante = solicitado - aSurtir

            // Colores de la fila según el stock
            let rowColor = "bg-white"
            if (faltante === solicitado) rowColor = "bg-red-50/30" // No hay nada
            else if (faltante > 0) rowColor = "bg-amber-50/30" // Falta una parte
            else rowColor = "bg-emerald-50/10" // Hay todo

            return (
              <div key={item.id} className={`p-4 flex flex-col md:flex-row justify-between md:items-center gap-4 transition-colors ${rowColor}`}>
                <div className="flex-1">
                  <p className="font-bold text-gonper-text">{prod?.nombre || 'Producto eliminado'}</p>
                  <p className="text-xs text-gonper-muted font-mono">{prod?.sku}</p>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-center w-16">
                    <p className="text-xs text-gonper-muted mb-1">Solicitado</p>
                    <p className="font-bold text-lg text-gray-700">{solicitado} <span className="text-xs font-normal text-gray-500">{unidad}</span></p>
                  </div>
                  <div className="text-center w-16">
                    <p className="text-xs text-gonper-muted mb-1">En Stock</p>
                    <p className={`font-bold text-lg ${stock === 0 ? 'text-red-500' : 'text-blue-600'}`}>{stock} <span className="text-xs font-normal text-gray-500">{unidad}</span></p>
                  </div>
                  <div className="text-center w-20 border-l pl-4 border-gray-200">
                    <p className="text-xs text-gonper-muted mb-1">Faltante</p>
                    <p className={`font-bold text-lg ${faltante > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {faltante > 0 ? faltante : '0'} <span className="text-xs font-normal text-gray-500">{unidad}</span>
                    </p>
                  </div>
                  
                  {orden.estado === 'ENTREGADA' || orden.estado === 'PARCIAL' ? (
                    <div className="text-center w-16 border-l pl-4 border-gray-200">
                      <p className="text-xs text-gonper-muted mb-1">Surtido</p>
                      <p className="font-bold text-lg text-gray-700">{item.cantidad_surtida} <span className="text-xs font-normal text-gray-500">{unidad}</span></p>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}