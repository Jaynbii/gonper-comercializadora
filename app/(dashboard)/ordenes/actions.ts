'use server'

import { createClient, generarNuevoSku } from '@/utils/supabase/server' // Importamos generarNuevoSku
import { revalidatePath } from 'next/cache'
import { normalizarUnidad } from '@/utils/unidades'
import { buscarProductoSimilarPorNombre, type ProductoCatalogo } from '@/utils/vincularProductos'
import { surtirConCliente, type ResultadoSurtido } from '@/utils/surtir'
import {
  construirRutaFacturaFirmada,
  validarFotoFirmada,
} from '@/utils/facturaFirmada'
import { esRequisicionProtegida } from '@/utils/requisicionesCompletas'
import {
  validarEdicionItems,
  type ItemEditado,
  type ItemExistenteEdicion,
} from '@/utils/editarItemsOrden'

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

/**
 * Guarda la foto de la factura firmada y sellada como comprobante de
 * entrega. La requisición SIGUE en ENTREGADA ("surtida"): solo se
 * agregan la ruta de la foto y la fecha, para reportes después.
 * Devuelve el resultado, nunca lanza (regla anti-#441).
 */
export async function guardarFacturaFirmada(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado. Inicia sesión nuevamente.' }

  const ordenId = String(formData.get('orden_id') ?? '')
  const foto = formData.get('foto')
  if (!ordenId) return { success: false, error: 'Falta la requisición.' }

  const errorFoto = validarFotoFirmada(foto instanceof File ? foto : null)
  if (errorFoto) return { success: false, error: errorFoto }
  const archivo = foto as File

  // Solo una requisición surtida (ENTREGADA) puede marcarse como firmada.
  const { data: orden, error: errorOrden } = await supabase
    .from('ordenes')
    .select('estado')
    .eq('id', ordenId)
    .single()
  if (errorOrden || !orden) {
    return { success: false, error: 'No se encontró la requisición.' }
  }
  if (orden.estado !== 'ENTREGADA') {
    return {
      success: false,
      error: 'La requisición aún no está surtida. Súrtela primero y luego sube la foto.',
    }
  }

  // Mismo bucket privado que el PDF de la requisición, con prefijo
  // propio para no mezclar las fotos con los PDF.
  const ruta = construirRutaFacturaFirmada(ordenId, archivo.name)
  const { error: errorSubida } = await supabase.storage
    .from('pdf-facturas')
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false })
  if (errorSubida) {
    return { success: false, error: 'No se pudo subir la foto. Vuelve a intentarlo.' }
  }

  const { error: errorGuardado } = await supabase
    .from('ordenes')
    .update({
      factura_firmada_path: ruta,
      factura_firmada_en: new Date().toISOString(),
    })
    .eq('id', ordenId)
  if (errorGuardado) {
    // Limpieza: si no se pudo guardar la ruta, la foto huérfana no sirve.
    await supabase.storage.from('pdf-facturas').remove([ruta])
    if (
      errorGuardado.code === 'PGRST204' ||
      String(errorGuardado.message ?? '').includes('factura_firmada_path')
    ) {
      return {
        success: false,
        error: 'Falta aplicar la migración de la factura firmada en Supabase (supabase/migrations/20261113000000_add_factura_firmada_a_ordenes.sql).',
      }
    }
    return { success: false, error: 'No se pudo guardar la foto. Vuelve a intentarlo.' }
  }

  revalidatePath('/ordenes')
  revalidatePath(`/ordenes/${ordenId}`)
  return { success: true }
}

/** URL firmada (120 s) para ver la foto de la factura firmada. */
export async function obtenerUrlFacturaFirmada(
  ordenId: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado. Inicia sesión nuevamente.' }

  const { data: orden, error } = await supabase
    .from('ordenes')
    .select('factura_firmada_path')
    .eq('id', ordenId)
    .single()
  if (error || !orden?.factura_firmada_path) {
    return { success: false, error: 'Esta requisición aún no tiene foto de factura firmada.' }
  }

  const { data, error: errorUrl } = await supabase.storage
    .from('pdf-facturas')
    .createSignedUrl(orden.factura_firmada_path, 120)
  if (errorUrl || !data) {
    return { success: false, error: 'No se pudo abrir la foto.' }
  }
  return { success: true, url: data.signedUrl }
}

export async function registrarProductoEnInventario(item: ItemDetectado) {
  const supabase = await createClient()

  // AHORA EL CÓDIGO DEL PDF ES EL CÓDIGO SAT
  const codigo_sat = String(item.codigo_pdf ?? '').trim()
  const nombre = String(item.producto_nombre || item.descripcion_pdf || '').trim()
  const unidad = normalizarUnidad(item.unidad) || null

  if (!codigo_sat) throw new Error('El artículo no tiene código SAT de referencia.')
  if (!nombre) throw new Error('El artículo no tiene descripción.')

  // FRENO DE MANO: el código SAT es una CLASE, no la identidad del
  // producto — dos artículos distintos pueden compartirlo (Factura A570:
  // 14111704 es "Papel P/wc Jumbo Junior" y también "Papel para Manos en
  // Rollo"). Solo bloqueamos cuando YA existe un producto con ese código
  // SAT *y* un nombre similar; mismo código + nombre distinto sí se
  // puede registrar.
  const { data: mismoSat } = await supabase
    .from('productos')
    .select('*')
    .eq('codigo_sat', codigo_sat)

  const duplicado = buscarProductoSimilarPorNombre(
    nombre,
    ((mismoSat ?? []) as ProductoCatalogo[]),
  )

  if (duplicado) {
    throw new Error(`Este producto ya existe en tu inventario como "${duplicado.nombre}" (${duplicado.sku}). Por favor, usa la sugerencia en lugar de registrar uno nuevo.`)
  }

  // GENERAMOS EL NUEVO SKU INTERNO (ARTXXXX)
  const nuevoSku = await generarNuevoSku(supabase)

  const { data, error } = await supabase
    .from('productos')
    .insert({
      sku: nuevoSku,           // El código interno ARTXXXX
      nombre,                  // El nombre completo de la factura
      codigo_sat,              // El código del SAT
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
      const { data: mismoSat } = await supabase
        .from('productos')
        .select('*')
        .eq('codigo_sat', codigo_sat)
      // Solo devolvemos el recién creado si es el MISMO producto (nombre
      // similar); si otro artículo con el mismo código SAT se registró
      // antes, no es este producto y no se devuelve.
      const recienCreado = buscarProductoSimilarPorNombre(
        nombre,
        ((mismoSat ?? []) as ProductoCatalogo[]),
      )
      if (recienCreado) return recienCreado
      throw new Error('Otro producto con ese código SAT se registró al mismo tiempo. Vuelve a intentarlo.')
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

export async function surtirOrden(ordenId: string): Promise<ResultadoSurtido> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Usuario no autenticado' }

  // La lógica vive en utils/surtir.ts (`surtirConCliente`, probada
  // con un mock de PostgREST): RPC transaccional `surtir_orden` si
  // existe, vía secuencial de respaldo si la migración aún no se
  // corrió. El surtido PARCIAL se preserva: piden 10, hay 6, se
  // surten 6 y queda PARCIAL.
  //
  // IMPORTANTE (digest 2179146847): esto DEVUELVE el resultado, nunca
  // lanza. En producción Next.js redacta el mensaje real de cualquier
  // error lanzado por una Server Action y el cliente solo recibe
  // "Minified React error #441"; los valores DEVUELTOS llegan tal
  // cual al teléfono, con su mensaje real.
  const resultado = await surtirConCliente(supabase, ordenId, user.id)

  if (resultado.success) {
    revalidatePath('/ordenes')
    revalidatePath(`/ordenes/${ordenId}`)
    revalidatePath('/inventario')
  }
  return resultado
}

export async function eliminarOrden(ordenId: string, pdfPath: string | null) {
  const supabase = await createClient()

  // Candado: una requisición con foto firmada y sellada es evidencia de
  // entrega y no se puede borrar desde la app. Si alguna vez hay que
  // borrar una, se hace directo en Supabase, no desde Gonper.
  const { data: orden } = await supabase
    .from('ordenes')
    .select('factura_firmada_path')
    .eq('id', ordenId)
    .single()
  if (
    orden &&
    esRequisicionProtegida({
      facturaFirmadaPath:
        (orden as { factura_firmada_path?: string | null })
          .factura_firmada_path ?? null,
    })
  ) {
    throw new Error(
      'Esta requisición está firmada y sellada. No se puede eliminar.',
    )
  }

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

// Editar los artículos de una requisición (Alex, 2026-11-25): cambiar
// cantidades, quitar artículos y agregar nuevos del catálogo. A
// diferencia de `guardarItemsEnOrden` (que borra todo e inserta con
// surtido 0, porque es la captura inicial), aquí cada fila se
// actualiza por separado para NO perder lo ya surtido. Los candados
// viven en `validarEdicionItems` y se vuelven a verificar aquí: la
// interfaz nunca es la última palabra.
//
// DEVUELVE el resultado, nunca lanza (ver `surtirOrden`): en
// producción Next.js redacta el mensaje real de un error lanzado y
// el teléfono solo recibiría "Minified React error #441".
export async function editarItemsOrden(
  ordenId: string,
  items: ItemEditado[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // 1. Estado y candado de firmada: una requisición entregada y
  // firmada es evidencia de entrega y no se toca desde la app.
  const { data: orden, error: ordenError } = await supabase
    .from('ordenes')
    .select('estado, factura_firmada_path')
    .eq('id', ordenId)
    .single()
  if (ordenError || !orden) {
    return { success: false, error: 'Requisición no encontrada.' }
  }
  if (
    esRequisicionProtegida({
      facturaFirmadaPath: orden.factura_firmada_path ?? null,
    })
  ) {
    return {
      success: false,
      error: 'Esta requisición está firmada y sellada. No se puede editar.',
    }
  }
  if (orden.estado === 'ENTREGADA') {
    return {
      success: false,
      error: 'Esta requisición ya está entregada. No se puede editar.',
    }
  }
  if (!['BORRADOR', 'PENDIENTE', 'PARCIAL'].includes(orden.estado)) {
    return {
      success: false,
      error: 'Esta requisición no se puede editar en su estado actual.',
    }
  }

  // 2. Artículos actuales, con lo surtido y el nombre para los
  // mensajes de error.
  const { data: actuales, error: itemsError } = await supabase
    .from('orden_items')
    .select('id, producto_id, cantidad_solicitada, cantidad_surtida, unidad, productos (nombre)')
    .eq('orden_id', ordenId)
  if (itemsError || !actuales) {
    return { success: false, error: 'No se pudieron leer los artículos.' }
  }

  // Marca "Sin surtir": consulta aparte y tolerante — si la migración
  // aún no se corrió en Supabase, la columna no existe y la consulta
  // falla; se asume todo surtible y la página sigue funcionando.
  const { data: flagsSinSurtir } = await supabase
    .from('orden_items')
    .select('id, sin_surtir')
    .eq('orden_id', ordenId)
  const sinSurtirPorId = new Map<string, boolean>(
    (flagsSinSurtir || []).map((f) => [
      f.id as string,
      !!(f as { sin_surtir?: boolean }).sin_surtir,
    ]),
  )

  // 3. Candado de compra: productos que ya están en una orden de
  // compra de esta requisición. Si la consulta falla, no se edita
  // nada: mejor no guardar que guardar rompiendo una compra.
  const { data: compras, error: comprasError } = await supabase
    .from('ordenes_compra')
    .select('id')
    .eq('requisition_id', ordenId)
  if (comprasError) {
    return {
      success: false,
      error: 'No se pudieron verificar las órdenes de compra.',
    }
  }
  let comprados = new Set<string>()
  if (compras && compras.length > 0) {
    const { data: compradosItems, error: compradosError } = await supabase
      .from('orden_compra_items')
      .select('producto_id')
      .in(
        'orden_compra_id',
        compras.map((c) => c.id),
      )
    if (compradosError) {
      return {
        success: false,
        error: 'No se pudieron verificar las órdenes de compra.',
      }
    }
    comprados = new Set(
      (compradosItems || []).map((i) => i.producto_id as string),
    )
  }

  // 4. Validación pura (los candados de surtido, compra, duplicados
  // y cantidades).
  const existentes: ItemExistenteEdicion[] = actuales.map((it) => {
    const producto = it.productos as
      | { nombre?: string | null }
      | { nombre?: string | null }[]
      | null
    const nombre = Array.isArray(producto)
      ? (producto[0]?.nombre ?? null)
      : (producto?.nombre ?? null)
    return {
      itemId: it.id as string,
      productoId: it.producto_id as string,
      nombre: nombre || 'Producto',
      solicitado: Number(it.cantidad_solicitada) || 0,
      surtido: Number(it.cantidad_surtida) || 0,
      bloqueadoPorCompra: comprados.has(it.producto_id as string),
      sinSurtir: sinSurtirPorId.get(it.id as string) ?? false,
    }
  })
  const validacion = validarEdicionItems(existentes, items)
  if (!validacion.ok) {
    return { success: false, error: validacion.error }
  }

  // 5. Aplicar: quitar los que ya no están, actualizar los que
  // cambiaron e insertar los nuevos. Lo surtido se conserva porque
  // nunca se toca `cantidad_surtida`.
  const editadosPorId = new Map(
    items
      .filter((i) => i.itemId !== null)
      .map((i) => [i.itemId as string, i]),
  )
  for (const actual of actuales) {
    if (editadosPorId.has(actual.id as string)) continue
    const { error } = await supabase
      .from('orden_items')
      .delete()
      .eq('id', actual.id)
    if (error) {
      return {
        success: false,
        error: `No se pudo quitar un artículo: ${error.message}`,
      }
    }
  }
  for (const item of items) {
    if (!item.itemId) continue
    const actual = actuales.find((a) => a.id === item.itemId)
    if (!actual) continue
    const unidad = normalizarUnidad(item.unidad) || null
    const sinSurtir = item.sinSurtir ?? false
    const sinSurtirActual = sinSurtirPorId.get(item.itemId) ?? false
    if (
      actual.producto_id === item.productoId &&
      Number(actual.cantidad_solicitada) === Number(item.cantidad) &&
      (actual.unidad ?? null) === unidad &&
      sinSurtirActual === sinSurtir
    ) {
      continue
    }
    const { error } = await supabase
      .from('orden_items')
      .update({
        producto_id: item.productoId,
        cantidad_solicitada: item.cantidad,
        unidad,
        sin_surtir: sinSurtir,
      })
      .eq('id', item.itemId)
    if (error) {
      return {
        success: false,
        error: error.message.includes('sin_surtir')
          ? 'Falta correr la migración "Sin surtir" en Supabase para guardar este cambio.'
          : `No se pudo guardar un artículo: ${error.message}`,
      }
    }
  }
  const nuevos = items.filter((i) => i.itemId === null)
  if (nuevos.length > 0) {
    const { error } = await supabase.from('orden_items').insert(
      nuevos.map((n) => ({
        orden_id: ordenId,
        producto_id: n.productoId,
        cantidad_solicitada: n.cantidad,
        cantidad_surtida: 0,
        unidad: normalizarUnidad(n.unidad) || null,
        sin_surtir: n.sinSurtir ?? false,
      })),
    )
    if (error) {
      return {
        success: false,
        error: error.message.includes('sin_surtir')
          ? 'Falta correr la migración "Sin surtir" en Supabase para guardar este cambio.'
          : `No se pudieron agregar los artículos: ${error.message}`,
      }
    }
  }

  revalidatePath('/ordenes')
  revalidatePath(`/ordenes/${ordenId}`)
  revalidatePath('/compras')
  return { success: true }
}