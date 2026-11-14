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