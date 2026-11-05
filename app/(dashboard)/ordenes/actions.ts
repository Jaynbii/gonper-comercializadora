'use server'

import { createClient, generarNuevoSku } from '@/utils/supabase/server' // 👈 Importamos generarNuevoSku
import { revalidatePath } from 'next/cache'
import { normalizarUnidad } from '@/utils/unidades'

type ItemDetectado = {
  codigo_pdf: string
  cantidad: number | string
  unidad?: string | null
  producto_nombre?: string
  descripcion_pdf?: string
  id_bd?: string | null
}

export async function obtenerUrlPDF(pdfPath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data, error } = await supabase.storage.from('pdf-facturas').createSignedUrl(pdfPath, 120)
  if (error || !data) throw new Error('No se pudo generar el enlace del PDF')
  return data.signedUrl
}

export async function obtenerUrlParaOCR(pdfPath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data, error } = await supabase.storage.from('pdf-facturas').createSignedUrl(pdfPath, 300)
  if (error || !data) throw new Error('No se pudo obtener la URL del PDF para el OCR')
  return data.signedUrl
}

export async function registrarProductoEnInventario(item: ItemDetectado) {
  const supabase = await createClient()

  // 👇 AHORA EL CÓDIGO DEL PDF ES EL CÓDIGO SAT
  const codigo_sat = String(item.codigo_pdf ?? '').trim()
  const nombre = String(item.producto_nombre || item.descripcion_pdf || '').trim()
  const unidad = normalizarUnidad(item.unidad) || null

  if (!codigo_sat) throw new Error('El artículo no tiene código SAT de referencia.')
  if (!nombre) throw new Error('El artículo no tiene descripción.')

  // 🛡️ FRENO DE MANO: Buscamos si el código SAT ya existe en el inventario
  const { data: existeSat } = await supabase
    .from('productos')
    .select('*')
    .eq('codigo_sat', codigo_sat)
    .maybeSingle()

  if (existeSat) {
    throw new Error(`Este producto ya existe en tu inventario como "${existeSat.nombre}" (${existeSat.sku}). Por favor, usa la sugerencia en lugar de registrar uno nuevo.`)
  }

  // 🏷️ GENERAMOS EL NUEVO SKU INTERNO (ARTXXXX)
  const nuevoSku = await generarNuevoSku(supabase)

  const { data, error } = await supabase
    .from('productos')
    .insert({
      sku: nuevoSku,           // 👈 El código interno ARTXXXX
      nombre,                  // 👈 El nombre completo de la factura
      codigo_sat,              // 👈 El código del SAT
      unidad_medida: unidad,
      stock_actual: 0,
      stock_minimo: 0,
      precio_unitario: 0,
    })
    .select()
    .single()

  if (error) {
    // En caso de que alguien más lo haya registrado exactamente al mismo tiempo
    if (error.code === '23505') {
      const { data: recienCreado } = await supabase
        .from('productos')
        .select('*')
        .eq('codigo_sat', codigo_sat)
        .maybeSingle()
      if (recienCreado) return recienCreado
    }
    throw new Error(error.message)
  }

  return data
}

export async function guardarItemsEnOrden(
  ordenId: string,
  items: ItemDetectado[],
) {
  const supabase = await createClient()

  const itemsSinId = items.filter((item) => !item.id_bd)
  if (itemsSinId.length > 0) {
    throw new Error(
      `Artículos no registrados: ${itemsSinId
        .map((i) => i.producto_nombre || i.codigo_pdf)
        .join(', ')}`,
    )
  }

  const itemsAInsertar = items.map((item) => {
    const cantidad = Number(item.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error(`Cantidad inválida para ${item.producto_nombre || item.codigo_pdf}`)
    }

    return {
      orden_id: ordenId,
      producto_id: item.id_bd,
      cantidad_solicitada: cantidad,
      cantidad_surtida: 0,
      unidad: normalizarUnidad(item.unidad) || null,
    }
  })

  const { error: deleteError } = await supabase
    .from('orden_items')
    .delete()
    .eq('orden_id', ordenId)
  if (deleteError) {
    throw new Error(`No se pudieron reemplazar los artículos: ${deleteError.message}`)
  }

  const { error: insertError } = await supabase
    .from('orden_items')
    .insert(itemsAInsertar)
  if (insertError) {
    throw new Error(`Error de BD: ${insertError.message}`)
  }

  const { error: updateError } = await supabase
    .from('ordenes')
    .update({ estado: 'PENDIENTE' })
    .eq('id', ordenId)
  if (updateError) {
    throw new Error(`Error al actualizar la orden: ${updateError.message}`)
  }

  revalidatePath('/ordenes')
  revalidatePath(`/ordenes/${ordenId}`)
  return { success: true }
}

export async function surtirOrden(ordenId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuario no autenticado')

    const { data: ordenActual } = await supabase.from('ordenes').select('estado').eq('id', ordenId).single()
    if (ordenActual?.estado === 'ENTREGADA') throw new Error('Esta orden ya fue surtida y entregada previamente.')

    const { data: items, error: itemsError } = await supabase
      .from('orden_items').select(`id, cantidad_solicitada, producto_id, productos (nombre, stock_actual)`).eq('orden_id', ordenId)
    if (itemsError) throw new Error(`Error al leer items: ${itemsError.message}`)
    if (!items || items.length === 0) throw new Error('La orden no tiene items')

    let totalSolicitado = 0;
    let totalSurtido = 0;

    const promesas = items.map(async (item) => {
      const producto = Array.isArray(item.productos) ? item.productos[0] : item.productos
      if (!producto) return 
      const stockActual = Number(producto.stock_actual) || 0
      const cantidadSolicitada = Number(item.cantidad_solicitada) || 0
      const cantidadASurtir = Math.min(stockActual, cantidadSolicitada)
      
      totalSolicitado += cantidadSolicitada;
      totalSurtido += cantidadASurtir;

      const nuevoStock = stockActual - cantidadASurtir
      let nuevoEstadoItem = 'SIN_STOCK'
      if (cantidadASurtir === cantidadSolicitada) nuevoEstadoItem = 'SURTIMIENTO_COMPLETO'
      else if (cantidadASurtir > 0) nuevoEstadoItem = 'PARCIAL'

      const p1 = supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', item.producto_id)
      const p2 = supabase.from('orden_items').update({ cantidad_surtida: cantidadASurtir, estado_item: nuevoEstadoItem }).eq('id', item.id)
      let p3: Promise<void> = Promise.resolve()
      if (cantidadASurtir > 0) {
        p3 = (async () => {
          const { error } = await supabase.from('movimientos_inventario').insert({
            producto_id: item.producto_id, tipo_movimiento: 'SALIDA_ORDEN', cantidad: cantidadASurtir, motivo: 'Surtido de Orden', orden_id: ordenId, usuario_id: user.id
          })
          if (error) throw new Error(`Error al registrar el movimiento: ${error.message}`)
        })()
      }
      await Promise.all([p1, p2, p3])
    })

    await Promise.all(promesas)

    if (totalSurtido === 0) throw new Error('No hay stock de NINGÚN artículo. No se puede surtir la orden.')

    const nuevoEstadoOrden = totalSurtido === totalSolicitado ? 'ENTREGADA' : 'PARCIAL';
    const { error: updateError } = await supabase.from('ordenes').update({ estado: nuevoEstadoOrden }).eq('id', ordenId)
    if (updateError) throw new Error(`Error al actualizar orden: ${updateError.message}`)

    return { success: true, estado: nuevoEstadoOrden }
  } catch (error: unknown) {
    throw new Error(error instanceof Error ? error.message : String(error))
  }
}

export async function eliminarOrden(ordenId: string, pdfPath: string | null) {
  const supabase = await createClient()

  // 1. Borrar el PDF del Storage si existe
  if (pdfPath) {
    await supabase.storage.from('pdf-facturas').remove([pdfPath])
  }

  // 2. Borrar la orden de la base de datos (los items se borran en cascada)
  const { error } = await supabase.from('ordenes').delete().eq('id', ordenId)
  if (error) throw new Error(error.message)

  revalidatePath('/ordenes')
  return { success: true }
}

export async function editarOrden(ordenId: string, cliente_id: string, estado: string) {
  const supabase = await createClient()
  
  const { error } = await supabase.from('ordenes').update({
    cliente_id,
    estado
  }).eq('id', ordenId)

  if (error) throw new Error(error.message)
  
  revalidatePath('/ordenes')
  return { success: true }
}