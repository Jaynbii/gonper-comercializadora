'use server'

import { createClient, generarNuevoSku } from '@/utils/supabase/server' // 👈 Importamos generarNuevoSku
import { revalidatePath } from 'next/cache'
import { normalizarUnidad } from '@/utils/unidades'
import { planSurtido, esErrorFuncionInexistente } from '@/utils/surtir'

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
    throw new Error(`Error al actualizar la requisición: ${updateError.message}`)
  }

  revalidatePath('/ordenes')
  revalidatePath(`/ordenes/${ordenId}`)
  return { success: true }
}

export async function surtirOrden(ordenId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuario no autenticado')

  // Vía principal: RPC transaccional `surtir_orden` (migración
  // supabase/migrations/20261106020000_surtir_orden_rpc.sql). Todo el
  // surtido ocurre en UNA transacción de Postgres, o no ocurre: si
  // algo falla a mitad, no queda el stock descontado a medias (eso
  // fue el error #441 al surtir REQ-0003). El surtido PARCIAL se
  // preserva: piden 10, hay 6, se surten 6 y queda PARCIAL.
  const { data: estadoRpc, error: errorRpc } = await supabase.rpc(
    'surtir_orden',
    { p_orden_id: ordenId },
  )
  if (!errorRpc) {
    revalidatePath('/ordenes')
    revalidatePath(`/ordenes/${ordenId}`)
    revalidatePath('/inventario')
    return { success: true, estado: String(estadoRpc) }
  }

  // Si la RPC aún no existe en Supabase (migración sin correr), se
  // usa la vía secuencial de respaldo. Cualquier OTRO error de la
  // RPC (p. ej. sin stock) es real y NO se reintenta por la vía de
  // respaldo: se lanza tal cual.
  if (!esErrorFuncionInexistente(errorRpc)) {
    throw new Error(errorRpc.message)
  }

  // Vía de respaldo (sin transacción, solo si la RPC no existe):
  // plan puro + writes en secuencia, VERIFICANDO cada error. Antes
  // los updates de stock se hacían con Promise.all y sus errores se
  // tragaban en silencio (los builders de PostgREST resuelven
  // `{ data, error }`, no lanzan): la requisición quedaba marcada
  // como surtida sin bajar el stock. Aquí un fallo aborta ANTES de
  // marcar la requisición como surtida.
  const { data: ordenActual } = await supabase
    .from('ordenes')
    .select('estado')
    .eq('id', ordenId)
    .single()
  if (ordenActual?.estado === 'ENTREGADA')
    throw new Error(
      'Esta requisición ya fue surtida y entregada previamente.',
    )

  const { data: items, error: itemsError } = await supabase
    .from('orden_items')
    .select(
      `id, cantidad_solicitada, cantidad_surtida, producto_id, productos (nombre, stock_actual)`,
    )
    .eq('orden_id', ordenId)
  if (itemsError)
    throw new Error(`Error al leer items: ${itemsError.message}`)
  if (!items || items.length === 0)
    throw new Error('La requisición no tiene artículos')

  const plan = planSurtido(
    items.map((item) => {
      const producto = Array.isArray(item.productos)
        ? item.productos[0]
        : item.productos
      return {
        id: item.id,
        productoId: item.producto_id,
        cantidadSolicitada: Number(item.cantidad_solicitada) || 0,
        cantidadSurtida: Number(item.cantidad_surtida) || 0,
        stockActual: producto ? Number(producto.stock_actual) || 0 : null,
      }
    }),
  )

  for (const item of plan.items) {
    if (!item.hayQueEscribir) continue

    const { error: errorStock } = await supabase
      .from('productos')
      .update({ stock_actual: item.nuevoStock })
      .eq('id', item.productoId)
    if (errorStock)
      throw new Error(
        `Error al actualizar el stock: ${errorStock.message}`,
      )

    const { error: errorItem } = await supabase
      .from('orden_items')
      .update({
        cantidad_surtida: item.nuevaCantidadSurtida,
        estado_item: item.nuevoEstadoItem,
      })
      .eq('id', item.id)
    if (errorItem)
      throw new Error(
        `Error al actualizar el artículo: ${errorItem.message}`,
      )

    if (item.cantidadASurtir > 0) {
      const { error: errorMovimiento } = await supabase
        .from('movimientos_inventario')
        .insert({
          producto_id: item.productoId,
          tipo_movimiento: 'SALIDA_ORDEN',
          cantidad: item.cantidadASurtir,
          motivo: 'Surtido de requisición',
          orden_id: ordenId,
          usuario_id: user.id,
        })
      if (errorMovimiento)
        throw new Error(
          `Error al registrar el movimiento: ${errorMovimiento.message}`,
        )
    }
  }

  const { error: updateError } = await supabase
    .from('ordenes')
    .update({ estado: plan.nuevoEstadoOrden })
    .eq('id', ordenId)
  if (updateError)
    throw new Error(
      `Error al actualizar la requisición: ${updateError.message}`,
    )

  revalidatePath('/ordenes')
  revalidatePath(`/ordenes/${ordenId}`)
  revalidatePath('/inventario')
  return { success: true, estado: plan.nuevoEstadoOrden }
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