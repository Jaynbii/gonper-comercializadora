import { createClient } from '@/utils/supabase/server'
import ComprasClient from './ComprasClient'

export default async function ComprasPage() {
  const supabase = await createClient()

  // 1. Calcular faltantes (Órdenes activas vs Stock)
  const { data: ordenesActivas } = await supabase
    .from('ordenes')
    .select(`orden_items (cantidad_solicitada, cantidad_surtida, producto_id)`)
    .in('estado', ['PENDIENTE', 'PARCIAL'])

  const demandaPorProducto: Record<string, number> = {}
  ordenesActivas?.forEach(orden => {
    orden.orden_items?.forEach((item: any) => {
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
    { data: ordenesCompra }
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
    `).order('created_at', { ascending: false })
  ])

  // 3. Unir proveedores con sus precios manualmente
  const proveedores = (rawProveedores || []).map(prov => {
    const relacionesProv = rawRelaciones?.filter(rel => rel.proveedor_id === prov.id) || []
    return {
      ...prov,
      producto_proveedores: relacionesProv
    }
  })

  return (
    <ComprasClient 
      faltantes={faltantes} 
      proveedores={proveedores || []} 
      ordenesCompra={ordenesCompra || []}
    />
  )
}