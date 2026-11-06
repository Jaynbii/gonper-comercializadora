
'use server'

// Importa el cliente de Supabase para ejecutar operaciones desde el servidor.
import { createClient } from '@/utils/supabase/server'

// Permite actualizar las rutas afectadas después de modificar información.
import { revalidatePath } from 'next/cache'

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
export async function generarOrdenCompra(
  proveedorId: string,
  items: ItemCompra[]
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

  // Genera un folio para identificar la orden de compra.
  const folio = `COM-${Math.floor(Math.random() * 1000000)}`

  // Inserta la información principal de la orden de compra.
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
  const { error: itemsError } = await supabase
    .from('orden_compra_items')
    .insert(itemsAInsertar)

  // Informa si ocurrió un error al guardar los artículos.
  if (itemsError) {
    throw new Error(`Error al guardar items: ${itemsError.message}`)
  }

  // Actualiza la información visible de la sección de compras.
  revalidatePath('/compras')

  // Devuelve el resultado de la operación y el folio generado.
  return {
    success: true,
    folio
  }
}

// Registra la recepción parcial o completa de mercancía.
// La actualización del inventario y del movimiento se ejecuta dentro
// de la función SQL recibir_mercancia, en una sola transacción.
export async function recibirMercancia(
  ordenCompraId: string,
  items: ItemRecepcion[]
) {
  // Inicializa el cliente de Supabase en el servidor.
  const supabase = await createClient()

  // Obtiene y valida al usuario autenticado.
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  // Impide que usuarios no autenticados registren recepciones.
  if (authError || !user) {
    throw new Error('No autorizado')
  }

  // Comprueba que se haya recibido una orden de compra y una lista de artículos.
  if (!ordenCompraId || !Array.isArray(items) || items.length === 0) {
    throw new Error('Datos de recepción inválidos')
  }

  // Comprueba que cada artículo tenga identificadores válidos
  // y una cantidad numérica igual o superior a cero.
  const itemsInvalidos = items.some(item =>
    !item.id ||
    !item.producto_id ||
    !Number.isFinite(Number(item.cantidad_recibida)) ||
    Number(item.cantidad_recibida) < 0
  )

  // Detiene el proceso si algún artículo no cumple las validaciones.
  if (itemsInvalidos) {
    throw new Error('Hay artículos con datos inválidos')
  }

  // Elimina los artículos cuya cantidad recibida sea cero.
  // Solo se enviarán a la base de datos los artículos con recepción.
  const itemsARecibir = items
    .filter(item => Number(item.cantidad_recibida) > 0)
    .map(item => ({
      id: item.id,
      cantidad_recibida: Number(item.cantidad_recibida)
    }))

  // Evita ejecutar una recepción sin cantidades positivas.
  if (itemsARecibir.length === 0) {
    throw new Error('Debes indicar al menos una cantidad recibida')
  }

  // Obtiene los identificadores de los artículos que se van a recibir.
  const ids = itemsARecibir.map(item => item.id)

  // Evita procesar dos veces el mismo artículo dentro de una solicitud.
  if (new Set(ids).size !== ids.length) {
    throw new Error('Hay artículos duplicados en la recepción')
  }

  // Ejecuta la función SQL que valida y registra la recepción
  // de forma transaccional en Supabase.
  const { data, error } = await supabase.rpc('recibir_mercancia', {
    p_orden_compra_id: ordenCompraId,
    p_items: itemsARecibir
  })

  // Informa cualquier error devuelto por la función SQL.
  if (error) {
    throw new Error(`Error al recibir mercancía: ${error.message}`)
  }

  // Actualiza las secciones que muestran compras, inventario y requisiciones.
  revalidatePath('/compras')
  revalidatePath('/inventario')
  revalidatePath('/ordenes')

  // Devuelve el resultado generado por la función SQL.
  return data
}
