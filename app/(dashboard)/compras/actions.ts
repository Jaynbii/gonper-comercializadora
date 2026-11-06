
'use server'

// Importa el cliente de Supabase para ejecutar operaciones desde el servidor.
import { createClient, esUsuarioAdmin } from '@/utils/supabase/server'

// Permite actualizar las rutas afectadas después de modificar información.
import { revalidatePath } from 'next/cache'

// Comparación pura de artículos, para el anti-duplicado de compras.
import { esMismaCompra } from '@/utils/faltantesPorOrden'

// Define la estructura de los artículos que se reciben en una compra.
interface ItemRecepcion {
  id: string
  producto_id: string
  cantidad_recibida: number
}

// Define la estructura de los artículos que se piden en una compra.
interface ItemCompra {
  producto_id: string
  cantidad: number
  precio: number
}

// Crea una orden de compra y registra los productos solicitados.
// requisitionId (opcional, Fase 1c ampliada): si la compra se genera
// desde la card de una requisición, la orden queda vinculada a ella
// (columna requisition_id, migración
// 20261106010000_add_requisition_id_to_ordenes_compra.sql). Sin
// requisición (vista General), se guarda con NULL.
export async function generarOrdenCompra(
  proveedorId: string,
  items: ItemCompra[],
  requisitionId?: string | null,
) {
  // Inicializa el cliente de Supabase en el servidor.
  const supabase = await createClient()

  // Comprueba que exista una sesión autenticada.
  const {
    data: { user }
  } = await supabase.auth.getUser()

  // Impide crear órdenes sin autenticación.
  if (!user) {
    throw new Error('No autorizado')
  }

  // Valida que se haya seleccionado un proveedor y existan artículos.
  if (!proveedorId || !Array.isArray(items) || items.length === 0) {
    throw new Error('Datos de compra inválidos')
  }

  // Calcula el total estimado de la orden utilizando cantidades y precios.
  const totalEstimado = items.reduce(
    (acc, item) => acc + (item.cantidad * item.precio),
    0
  )

  // Anti-duplicado (Fase 1c ampliada): si esta requisición ya tiene
  // una orden de compra PENDIENTE con este mismo proveedor y los
  // mismos artículos y cantidades, no se genera otra en silencio: se
  // bloquea con un mensaje claro. Para comprar lo mismo a propósito
  // hay que usar la vista General (sin requisición) o recibir/cancelar
  // la pendiente. Si la columna requisition_id aún no existe (la
  // migración no se ha corrido), la comprobación no puede hacerse y
  // no bloquea la compra.
  if (requisitionId) {
    try {
      const { data: existentes, error: existentesError } = await supabase
        .from('ordenes_compra')
        .select('id, folio')
        .eq('proveedor_id', proveedorId)
        .eq('requisition_id', requisitionId)
        .eq('estado', 'PENDIENTE')

      if (!existentesError && existentes && existentes.length > 0) {
        const ids = existentes.map((orden) => orden.id)
        const { data: itemsExistentes } = await supabase
          .from('orden_compra_items')
          .select('orden_compra_id, producto_id, cantidad_solicitada')
          .in('orden_compra_id', ids)

        const nuevos = items.map((item) => ({
          productoId: item.producto_id,
          cantidad: item.cantidad,
        }))
        for (const existente of existentes) {
          const suyos = (itemsExistentes || [])
            .filter((item) => item.orden_compra_id === existente.id)
            .map((item) => ({
              productoId: item.producto_id,
              cantidad: Number(item.cantidad_solicitada) || 0,
            }))
          if (esMismaCompra(suyos, nuevos)) {
            throw new Error(
              `Ya existe una orden de compra pendiente para esta requisición con este proveedor y los mismos artículos (${existente.folio}). Revísala en la pestaña "Órdenes de compra" antes de generar otra.`,
            )
          }
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Ya existe una orden de compra pendiente')
      ) {
        throw error
      }
      console.error('No se pudo comprobar duplicados:', error)
    }
  }

  // Genera un folio para identificar la orden de compra.
  const folio = `COM-${Math.floor(Math.random() * 1000000)}`

  // Inserta la información principal de la orden de compra. Si la
  // columna requisition_id aún no existe (migración sin correr), el
  // primer intento falla y se reintenta sin el vínculo para no romper
  // la compra; en ese caso la orden queda como "Sin requisición".
  const insertarOrden = (conVinculo: boolean) =>
    supabase
      .from('ordenes_compra')
      .insert({
        folio,
        proveedor_id: proveedorId,
        estado: 'PENDIENTE',
        total_estimado: totalEstimado,
        ...(conVinculo && requisitionId ? { requisition_id: requisitionId } : {}),
      })
      .select()
      .single()

  let { data: ordenData, error: ordenError } =
    await insertarOrden(!!requisitionId)
  if (
    ordenError &&
    requisitionId &&
    /requisition_id|does not exist/i.test(ordenError.message)
  ) {
    ;({ data: ordenData, error: ordenError } = await insertarOrden(false))
  }

  // Detiene el proceso si no fue posible crear la orden de compra.
  if (ordenError) {
    throw new Error(`Error al crear la orden de compra: ${ordenError.message}`)
  }

  // Prepara los artículos para relacionarlos con la orden recién creada.
  const itemsAInsertar = items.map(item => ({
    orden_compra_id: ordenData.id,
    producto_id: item.producto_id,
    cantidad_solicitada: item.cantidad,
    cantidad_recibida: 0
  }))

  // Guarda todos los artículos de la orden de compra.
  // Se devuelven con su id para que el flujo comprar+recibir pueda
  // llamar a recibirMercancia con ellos (la RPC pide el id de cada
  // orden_compra_items). Si la devolución falla, la compra ya existe
  // pero no se puede recibir en el mismo paso: se avisa con error.
  const { data: itemsGuardados, error: itemsError } = await supabase
    .from('orden_compra_items')
    .insert(itemsAInsertar)
    .select('id, producto_id, cantidad_solicitada')

  // Informa si ocurrió un error al guardar los artículos.
  if (itemsError) {
    throw new Error(`Error al guardar items: ${itemsError.message}`)
  }

  // Actualiza la información visible de la sección de compras.
  revalidatePath('/compras')

  // Devuelve el resultado de la operación, el folio generado y la
  // orden con sus artículos (id + producto + cantidad), para
  // comprar+recibir y para mostrar el resultado sin otra consulta.
  return {
    success: true,
    folio,
    id: ordenData.id,
    items: (itemsGuardados || []).map((item) => ({
      id: item.id,
      producto_id: item.producto_id,
      cantidad_solicitada: Number(item.cantidad_solicitada) || 0,
    })),
  }
}

// Registra la recepción parcial o completa de mercancía.
// La actualización del inventario y del movimiento se ejecuta dentro
// de la función SQL recibir_mercancia, en una sola transacción.
export async function recibirMercancia(
  ordenCompraId: string,
  items: ItemRecepcion[]
): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
  // Como `surtirOrden()`: DEVUELVE el resultado, nunca lanza. En
  // producción Next.js redacta el mensaje real de un error lanzado
  // por una Server Action ("Minified React error #441"); los valores
  // devueltos llegan tal cual al teléfono.
  const supabase = await createClient()

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'No autorizado' }
  }

  if (!ordenCompraId || !Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'Datos de recepción inválidos' }
  }

  const itemsInvalidos = items.some(item =>
    !item.id ||
    !item.producto_id ||
    !Number.isFinite(Number(item.cantidad_recibida)) ||
    Number(item.cantidad_recibida) < 0
  )

  if (itemsInvalidos) {
    return { success: false, error: 'Hay artículos con datos inválidos' }
  }

  const itemsARecibir = items
    .filter(item => Number(item.cantidad_recibida) > 0)
    .map(item => ({
      id: item.id,
      cantidad_recibida: Number(item.cantidad_recibida)
    }))

  if (itemsARecibir.length === 0) {
    return { success: false, error: 'Debes indicar al menos una cantidad recibida' }
  }

  const ids = itemsARecibir.map(item => item.id)

  if (new Set(ids).size !== ids.length) {
    return { success: false, error: 'Hay artículos duplicados en la recepción' }
  }

  const { data, error } = await supabase.rpc('recibir_mercancia', {
    p_orden_compra_id: ordenCompraId,
    p_items: itemsARecibir
  })

  if (error) {
    return { success: false, error: `Error al recibir mercancía: ${error.message}` }
  }

  // Si la recepción fue completa (todo lo solicitado ya está
  // recibido), la orden queda como RECIBIDA. La RPC es la que sube
  // el stock; este paso solo actualiza el estado para que la card
  // ya no ofrezca "Recibir" y el flujo comprar+recibir deje la
  // orden marcada como recibida. Es best-effort: si falla, la
  // recepción (stock) ya quedó registrada y solo se registra el
  // error, no se revierte nada.
  try {
    const { data: itemsOrden } = await supabase
      .from('orden_compra_items')
      .select('cantidad_solicitada, cantidad_recibida')
      .eq('orden_compra_id', ordenCompraId)
    const completa =
      Array.isArray(itemsOrden) &&
      itemsOrden.length > 0 &&
      itemsOrden.every(
        (item) =>
          Number(item.cantidad_recibida) >=
          Number(item.cantidad_solicitada),
      )
    if (completa) {
      const { error: estadoError } = await supabase
        .from('ordenes_compra')
        .update({ estado: 'RECIBIDA' })
        .eq('id', ordenCompraId)
        .eq('estado', 'PENDIENTE')
      if (estadoError) {
        console.error('No se pudo marcar la orden como RECIBIDA:', estadoError)
      }
    }
  } catch (e) {
    console.error('No se pudo marcar la orden como RECIBIDA:', e)
  }

  revalidatePath('/compras')
  revalidatePath('/inventario')
  revalidatePath('/ordenes')

  return { success: true, data }
}

// Elimina una orden de compra (solo admin, solo si está PENDIENTE).
//
// Como `surtirOrden()` y `recibirMercancia()`: DEVUELVE el
// resultado, nunca lanza. En producción Next.js redacta el mensaje
// real de un error lanzado por una Server Action ("Minified React
// error #441"); los valores devueltos llegan tal cual al teléfono.
//
// Solo PENDIENTE: una orden RECIBIDA ya subió el stock al recibirla
// y borrarla no lo bajaría, así que quedaría el inventario inflado
// sin rastro de la compra. Los artículos se borran en cascada
// (`orden_compra_items.orden_compra_id` REFERENCES ... ON DELETE
// CASCADE). La RLS "Admin modifica ordenes_compra" FOR ALL USING
// (public.is_admin()) es la que manda al final: un no-admin no
// puede borrar aunque llegara aquí.
export async function eliminarOrdenCompra(
  ordenCompraId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'No autorizado' }
  }

  if (!ordenCompraId) {
    return { success: false, error: 'Datos de compra inválidos' }
  }

  if (!(await esUsuarioAdmin(supabase))) {
    return {
      success: false,
      error: 'Solo un administrador puede eliminar órdenes de compra.',
    }
  }

  const { data: orden, error: lecturaError } = await supabase
    .from('ordenes_compra')
    .select('id, folio, estado')
    .eq('id', ordenCompraId)
    .single()

  if (lecturaError || !orden) {
    return {
      success: false,
      error: 'No se encontró la orden de compra.',
    }
  }

  if (orden.estado !== 'PENDIENTE') {
    return {
      success: false,
      error: `La orden ${orden.folio} ya está recibida y no se puede eliminar: el stock ya subió al recibirla y borrarla no lo bajaría.`,
    }
  }

  const { error: borradoError } = await supabase
    .from('ordenes_compra')
    .delete()
    .eq('id', ordenCompraId)
    .eq('estado', 'PENDIENTE')

  if (borradoError) {
    return {
      success: false,
      error: `No se pudo eliminar la orden de compra: ${borradoError.message}`,
    }
  }

  revalidatePath('/compras')

  return { success: true }
}

