'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function generarOrdenCompra(proveedorId: string, items: any[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  // 1. Calcular el total estimado
  const totalEstimado = items.reduce((acc, item) => acc + (item.cantidad * item.precio), 0)
  const folio = `COM-${Math.floor(Math.random() * 1000000)}`

  // 2. Crear la cabecera de la orden
  const { data: ordenData, error: ordenError } = await supabase
    .from('ordenes_compra')
    .insert({
      folio,
      proveedor_id: proveedorId,
      estado: 'PENDIENTE',
      total_estimado: totalEstimado
    })
    .select()
    .single()

  if (ordenError) throw new Error(`Error al crear orden: ${ordenError.message}`)

  // 3. Insertar los items
  const itemsAInsertar = items.map(item => ({
    orden_compra_id: ordenData.id,
    producto_id: item.producto_id,
    cantidad_solicitada: item.cantidad,
    cantidad_recibida: 0
  }))

  const { error: itemsError } = await supabase.from('orden_compra_items').insert(itemsAInsertar)
  if (itemsError) throw new Error(`Error al guardar items: ${itemsError.message}`)

  revalidatePath('/compras')
  return { success: true, folio }
}

export async function recibirMercancia(ordenCompraId: string, items: any[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  // 1. Recorrer los items recibidos y actualizar el stock
  for (const item of items) {
    if (item.cantidad_recibida > 0) {
      // Obtener stock actual
      const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single()
      const nuevoStock = (Number(prod?.stock_actual) || 0) + Number(item.cantidad_recibida)

      // Actualizar producto
      await supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', item.producto_id)

      // Registrar movimiento de entrada (Usando la nueva columna orden_compra_id)
      await supabase.from('movimientos_inventario').insert({
        producto_id: item.producto_id,
        tipo_movimiento: 'ENTRADA_COMPRA',
        cantidad: item.cantidad_recibida,
        motivo: 'Recepción de Orden de Compra',
        orden_compra_id: ordenCompraId, // 👈 Aquí está la corrección
        usuario_id: user.id
      })

      // Actualizar la cantidad recibida en el detalle de la orden
      await supabase.from('orden_compra_items').update({ cantidad_recibida: item.cantidad_recibida }).eq('id', item.id)
    }
  }

  // 2. Marcar la orden como RECIBIDA
  await supabase.from('ordenes_compra').update({ estado: 'RECIBIDA' }).eq('id', ordenCompraId)

  revalidatePath('/compras')
  revalidatePath('/inventario') // Para que el inventario refleje el nuevo stock
  return { success: true }
}