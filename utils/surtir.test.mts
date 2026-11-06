import test from 'node:test'
import assert from 'node:assert/strict'

import {
  planSurtido,
  esErrorFuncionInexistente,
  mensajeErrorSurtir,
  surtirConCliente,
  TIPO_MOVIMIENTO_SALIDA,
  TIPO_MOVIMIENTO_ENTRADA,
} from './surtir.ts'

// Datos que imitan REQ-0003 (Aseo Urbano): 150/150, 100/100, 19.5 con
// stock 10, 5 con stock 0, 20 con stock 20.
const itemsReq0003 = [
  { id: 'i1', productoId: 'p1', cantidadSolicitada: 150, cantidadSurtida: 0, stockActual: 150 },
  { id: 'i2', productoId: 'p2', cantidadSolicitada: 100, cantidadSurtida: 0, stockActual: 100 },
  { id: 'i3', productoId: 'p3', cantidadSolicitada: 19.5, cantidadSurtida: 0, stockActual: 10 },
  { id: 'i4', productoId: 'p4', cantidadSolicitada: 5, cantidadSurtida: 0, stockActual: 0 },
  { id: 'i5', productoId: 'p5', cantidadSolicitada: 20, cantidadSurtida: 0, stockActual: 20 },
]

test('surtido parcial tipo REQ-0003: surte lo que hay, decimales incluidos, queda PARCIAL', () => {
  const plan = planSurtido(itemsReq0003)
  assert.equal(plan.totalPendiente, 150 + 100 + 19.5 + 5 + 20)
  assert.equal(plan.totalSurtido, 150 + 100 + 10 + 0 + 20)
  assert.equal(plan.nuevoEstadoOrden, 'PARCIAL')
  const porId = new Map(plan.items.map((i) => [i.id, i]))
  assert.equal(porId.get('i1')?.cantidadASurtir, 150)
  assert.equal(porId.get('i1')?.nuevoEstadoItem, 'SURTIMIENTO_COMPLETO')
  assert.equal(porId.get('i3')?.cantidadASurtir, 10)
  assert.equal(porId.get('i3')?.nuevaCantidadSurtida, 10)
  assert.equal(porId.get('i3')?.nuevoStock, 0)
  assert.equal(porId.get('i3')?.nuevoEstadoItem, 'PARCIAL')
  assert.equal(porId.get('i4')?.cantidadASurtir, 0)
  assert.equal(porId.get('i4')?.nuevoEstadoItem, 'SIN_STOCK')
})

test('todo cubierto queda ENTREGADA', () => {
  const plan = planSurtido([
    { id: 'a', productoId: 'p1', cantidadSolicitada: 10, cantidadSurtida: 0, stockActual: 10 },
    { id: 'b', productoId: 'p2', cantidadSolicitada: 6, cantidadSurtida: 0, stockActual: 20 },
  ])
  assert.equal(plan.nuevoEstadoOrden, 'ENTREGADA')
  assert.equal(plan.totalSurtido, 16)
})

test('piden 10, hay 6: se surten 6 y queda PARCIAL (el parcial se preserva)', () => {
  const plan = planSurtido([
    { id: 'a', productoId: 'p1', cantidadSolicitada: 10, cantidadSurtida: 0, stockActual: 6 },
  ])
  assert.equal(plan.totalSurtido, 6)
  assert.equal(plan.nuevoEstadoOrden, 'PARCIAL')
  assert.equal(plan.items[0].nuevaCantidadSurtida, 6)
})

test('volver a surtir una PARCIAL solo surte lo pendiente, no vuelve a descontar lo ya surtido', () => {
  // Primera vez: piden 10, había 6 -> se surtieron 6. Ahora llegó stock 10.
  const plan = planSurtido([
    { id: 'a', productoId: 'p1', cantidadSolicitada: 10, cantidadSurtida: 6, stockActual: 10 },
  ])
  assert.equal(plan.items[0].pendiente, 4)
  assert.equal(plan.items[0].cantidadASurtir, 4)
  assert.equal(plan.items[0].nuevaCantidadSurtida, 10)
  assert.equal(plan.items[0].nuevoStock, 6)
  assert.equal(plan.nuevoEstadoOrden, 'ENTREGADA')
})

test('un artículo ya totalmente surtido no se vuelve a escribir', () => {
  const plan = planSurtido([
    { id: 'a', productoId: 'p1', cantidadSolicitada: 10, cantidadSurtida: 10, stockActual: 5 },
    { id: 'b', productoId: 'p2', cantidadSolicitada: 4, cantidadSurtida: 0, stockActual: 4 },
  ])
  assert.equal(plan.items[0].hayQueEscribir, false)
  assert.equal(plan.items[0].cantidadASurtir, 0)
  assert.equal(plan.items[1].hayQueEscribir, true)
  assert.equal(plan.nuevoEstadoOrden, 'ENTREGADA')
})

test('sin stock de ningún artículo lanza y no marca nada como surtido', () => {
  assert.throws(
    () =>
      planSurtido([
        { id: 'a', productoId: 'p1', cantidadSolicitada: 10, cantidadSurtida: 0, stockActual: 0 },
        { id: 'b', productoId: 'p2', cantidadSolicitada: 4, cantidadSurtida: 0, stockActual: null },
      ]),
    /No hay stock de NINGÚN artículo/,
  )
})

test('sin artículos lanza el error de requisición vacía', () => {
  assert.throws(() => planSurtido([]), /no tiene artículos/)
})

test('esErrorFuncionInexistente detecta PGRST202 y el mensaje de PostgREST', () => {
  assert.equal(esErrorFuncionInexistente({ code: 'PGRST202', message: 'x' }), true)
  assert.equal(
    esErrorFuncionInexistente({
      message: "Could not find the function public.surtir_orden(p_orden_id) in the schema cache",
    }),
    true,
  )
  assert.equal(esErrorFuncionInexistente({ code: 'P0001', message: 'No hay stock de NINGÚN artículo.' }), false)
  assert.equal(esErrorFuncionInexistente(null), false)
})

test('mensajeErrorSurtir nunca muestra el #441 tal cual: lo traduce y conserva el digest', () => {
  const error = new Error(
    'Minified React error #441; visit https://react.dev/errors/441 for the full message',
  ) as Error & { digest?: string }
  error.digest = '123456789'
  const { mensaje, digest } = mensajeErrorSurtir(error)
  assert.equal(digest, '123456789')
  assert.ok(!mensaje.includes('#441'))
  assert.ok(!mensaje.includes('Minified React'))
  assert.ok(mensaje.includes('123456789'))
  assert.ok(mensaje.includes('No se pudo surtir'))
})

test('mensajeErrorSurtir pasa el mensaje real cuando sí llega', () => {
  const { mensaje } = mensajeErrorSurtir(
    new Error('No hay stock de NINGÚN artículo. No se puede surtir la requisición.'),
  )
  assert.equal(mensaje, 'No hay stock de NINGÚN artículo. No se puede surtir la requisición.')
})

test('mensajeErrorSurtir tiene mensaje por defecto si no hay nada útil', () => {
  assert.equal(mensajeErrorSurtir(undefined).mensaje, 'No se pudo surtir la requisición. Inténtalo de nuevo.')
  assert.equal(mensajeErrorSurtir(null).mensaje, 'No se pudo surtir la requisición. Inténtalo de nuevo.')
})

// --- Segunda vuelta, digest 2179146847: el surtido DEVUELVE el
// error real, no lo lanza (un throw se redacta como #441). ---

// Estado confirmado por Alex en Supabase para REQ-0003 (01:01 MST):
// PENDIENTE, 10 de 13 artículos ya SURTIMIENTO_COMPLETO con
// cantidad_surtida = solicitada y stock 0; los 3 restantes
// SIN_STOCK con cantidad_surtida 0 y stock 0.
const itemsReq0003Confirmado = [
  { id: 'a1', producto_id: 'p1', cantidad_solicitada: 20, cantidad_surtida: 20, productos: { nombre: 'Arañas', stock_actual: 0 } },
  { id: 'a2', producto_id: 'p2', cantidad_solicitada: 20, cantidad_surtida: 20, productos: { nombre: 'Bulto bolsas', stock_actual: 0 } },
  { id: 'a3', producto_id: 'p3', cantidad_solicitada: 5, cantidad_surtida: 5, productos: { nombre: 'Cepillo', stock_actual: 0 } },
  { id: 'a4', producto_id: 'p4', cantidad_solicitada: 1, cantidad_surtida: 1, productos: { nombre: 'Cubeta', stock_actual: 0 } },
  { id: 'a5', producto_id: 'p5', cantidad_solicitada: 150, cantidad_surtida: 150, productos: { nombre: 'Escoba espiga', stock_actual: 0 } },
  { id: 'a6', producto_id: 'p6', cantidad_solicitada: 10, cantidad_surtida: 10, productos: { nombre: 'Escoba plástico', stock_actual: 1 } },
  { id: 'a7', producto_id: 'p7', cantidad_solicitada: 3, cantidad_surtida: 3, productos: { nombre: 'Franela', stock_actual: 3 } },
  { id: 'a8', producto_id: 'p8', cantidad_solicitada: 1, cantidad_surtida: 1, productos: { nombre: 'Porrón cloro', stock_actual: 1 } },
  { id: 'a9', producto_id: 'p9', cantidad_solicitada: 100, cantidad_surtida: 100, productos: { nombre: 'Recogedor', stock_actual: 0 } },
  { id: 'a10', producto_id: 'p10', cantidad_solicitada: 5, cantidad_surtida: 5, productos: { nombre: 'Trapeador', stock_actual: 0 } },
  { id: 'a11', producto_id: 'p11', cantidad_solicitada: 1, cantidad_surtida: 0, productos: { nombre: 'Fabuloso 20L', stock_actual: 0 } },
  { id: 'a12', producto_id: 'p12', cantidad_solicitada: 10, cantidad_surtida: 0, productos: { nombre: 'Jabón C/3 Kgs', stock_actual: 0 } },
  { id: 'a13', producto_id: 'p13', cantidad_solicitada: 1, cantidad_surtida: 0, productos: { nombre: 'Papel P/WC jumbo 400', stock_actual: 0 } },
]

test('planSurtido con el estado confirmado de REQ-0003 dice qué está ya surtido y qué no tiene stock', () => {
  assert.throws(
    () =>
      planSurtido(
        itemsReq0003Confirmado.map((i) => ({
          id: i.id,
          productoId: i.producto_id,
          nombre: i.productos.nombre,
          cantidadSolicitada: i.cantidad_solicitada,
          cantidadSurtida: i.cantidad_surtida,
          stockActual: i.productos.stock_actual,
        })),
      ),
    (error: unknown) => {
      const mensaje = (error as Error).message
      return (
        /No hay stock de NINGÚN artículo pendiente/.test(mensaje) &&
        mensaje.includes('Ya surtidos: 10 de 13') &&
        mensaje.includes('Fabuloso 20L (pendiente 1)') &&
        mensaje.includes('Jabón C/3 Kgs (pendiente 10)') &&
        mensaje.includes('Papel P/WC jumbo 400 (pendiente 1)')
      )
    },
  )
})

test('planSurtido con todo ya surtido lo dice claro: nada pendiente, estado inconsistente', () => {
  assert.throws(
    () =>
      planSurtido([
        { id: 'a', productoId: 'p1', cantidadSolicitada: 10, cantidadSurtida: 10, stockActual: 0 },
        { id: 'b', productoId: 'p2', cantidadSolicitada: 4, cantidadSurtida: 4, stockActual: 2 },
      ]),
    /Todos los artículos de esta requisición ya aparecen como surtidos/,
  )
})

// Mock fiel de PostgREST: los builders resuelven { data, error },
// no lanzan; `.eq()` es thenable (lista) y `.single()` devuelve
// una fila. Registra cada write para comprobar que un fallo no
// escribe nada.
function clienteMock(opciones: {
  rpcError?: { message: string; code?: string; details?: string | null } | null
  rpcData?: unknown
  estadoOrden?: string
  items?: unknown[]
  errorInsertMovimiento?: { message: string } | null
}) {
  const escrituras: string[] = []
  const filtro = <T,>(valor: T) => {
    const promesa = Promise.resolve({ data: valor, error: null })
    return Object.assign(promesa, {
      single: async () => ({ data: valor, error: null }),
    })
  }
  return {
    escrituras,
    rpc: async () => ({ data: opciones.rpcData ?? null, error: opciones.rpcError ?? null }),
    from: (tabla: string) => ({
      select: () => ({
        eq: () =>
          filtro(
            tabla === 'ordenes'
              ? { estado: opciones.estadoOrden ?? 'PENDIENTE' }
              : (opciones.items ?? []),
          ),
      }),
      update: (valores: Record<string, unknown>) => ({
        eq: async () => {
          escrituras.push(`update ${tabla} ${JSON.stringify(valores)}`)
          return { data: null, error: null }
        },
      }),
      insert: async (valores: Record<string, unknown>) => {
        escrituras.push(`insert ${tabla} ${JSON.stringify(valores)}`)
        return { data: null, error: opciones.errorInsertMovimiento ?? null }
      },
    }),
  }
}

// Error EXACTO que devuelve @supabase/postgrest-js 2.118.0 cuando la
// RPC no existe (verificado con la librería real y un fetch simulado
// en /tmp/repro_rpc.mjs): resuelve { data: null, error: {...} }.
const errorRpcInexistente = {
  code: 'PGRST202',
  message: 'Could not find the function public.surtir_orden(p_orden_id) in the schema cache',
  details:
    'Searched for the function public.surtir_orden with parameters p_orden_id or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
  hint: null,
}

test('surtirConCliente con RPC inexistente (PGRST202 exacto) cae al respaldo y DEVUELVE el error real de REQ-0003 sin lanzar ni escribir', async () => {
  const cliente = clienteMock({ rpcError: errorRpcInexistente, items: itemsReq0003Confirmado })
  const resultado = await surtirConCliente(cliente, 'orden-req-0003', 'usuario-1')
  assert.equal(resultado.success, false)
  if (!resultado.success) {
    assert.match(resultado.error, /No hay stock de NINGÚN artículo pendiente/)
    assert.ok(resultado.error.includes('Ya surtidos: 10 de 13'))
    assert.ok(resultado.error.includes('Fabuloso 20L'))
  }
  assert.deepEqual(cliente.escrituras, [])
})

test('surtirConCliente con RPC inexistente y stock disponible surte por el respaldo y devuelve PARCIAL', async () => {
  const cliente = clienteMock({
    rpcError: errorRpcInexistente,
    items: [
      { id: 'a', producto_id: 'p1', cantidad_solicitada: 10, cantidad_surtida: 0, productos: { nombre: 'Papel', stock_actual: 6 } },
      { id: 'b', producto_id: 'p2', cantidad_solicitada: 4, cantidad_surtida: 0, productos: { nombre: 'Jabón', stock_actual: 4 } },
    ],
  })
  const resultado = await surtirConCliente(cliente, 'orden-1', 'usuario-1')
  assert.deepEqual(resultado, { success: true, estado: 'PARCIAL' })
  assert.ok(cliente.escrituras.some((w) => w.startsWith('update productos')))
  assert.ok(cliente.escrituras.some((w) => w.startsWith('insert movimientos_inventario')))
  assert.ok(cliente.escrituras.some((w) => w.includes('"estado":"PARCIAL"')))
})

test('el movimiento de surtido se registra con tipo_movimiento SALIDA, no SALIDA_ORDEN', async () => {
  // Tercera vuelta del #441 (nov 2026): la base real rechazaba
  // 'SALIDA_ORDEN' con el CHECK
  // movimientos_inventario_tipo_movimiento_check; en la base solo
  // existe 'ENTRADA' (recibir), así que el surtido usa 'SALIDA'.
  assert.equal(TIPO_MOVIMIENTO_SALIDA, 'SALIDA')
  assert.equal(TIPO_MOVIMIENTO_ENTRADA, 'ENTRADA')
  const cliente = clienteMock({
    rpcError: errorRpcInexistente,
    items: [
      { id: 'a', producto_id: 'p1', cantidad_solicitada: 10, cantidad_surtida: 0, productos: { nombre: 'Papel', stock_actual: 10 } },
    ],
  })
  const resultado = await surtirConCliente(cliente, 'orden-1', 'usuario-1')
  assert.deepEqual(resultado, { success: true, estado: 'ENTREGADA' })
  const insertsMovimiento = cliente.escrituras.filter((w) =>
    w.startsWith('insert movimientos_inventario'),
  )
  assert.equal(insertsMovimiento.length, 1)
  const valores = JSON.parse(
    insertsMovimiento[0].slice('insert movimientos_inventario '.length),
  ) as { tipo_movimiento?: string }
  assert.equal(valores.tipo_movimiento, 'SALIDA')
  assert.notEqual(valores.tipo_movimiento, 'SALIDA_ORDEN')
})

test('surtirConCliente con la RPC existente no usa el respaldo', async () => {
  const cliente = clienteMock({ rpcError: null, rpcData: 'ENTREGADA', items: itemsReq0003Confirmado })
  const resultado = await surtirConCliente(cliente, 'orden-1', 'usuario-1')
  assert.deepEqual(resultado, { success: true, estado: 'ENTREGADA' })
  assert.deepEqual(cliente.escrituras, [])
})

test('surtirConCliente con un error REAL de la RPC lo devuelve tal cual y no reintenta por el respaldo', async () => {
  const cliente = clienteMock({
    rpcError: { code: 'P0001', message: 'No hay stock de NINGÚN artículo. No se puede surtir la requisición.' },
    items: itemsReq0003Confirmado,
  })
  const resultado = await surtirConCliente(cliente, 'orden-1', 'usuario-1')
  assert.equal(resultado.success, false)
  if (!resultado.success) {
    assert.equal(resultado.error, 'No hay stock de NINGÚN artículo. No se puede surtir la requisición.')
  }
  assert.deepEqual(cliente.escrituras, [])
})

test('surtirConCliente con todo ya surtido devuelve el diagnóstico, no lanza', async () => {
  const cliente = clienteMock({
    rpcError: errorRpcInexistente,
    items: [
      { id: 'a', producto_id: 'p1', cantidad_solicitada: 10, cantidad_surtida: 10, productos: { nombre: 'Papel', stock_actual: 0 } },
    ],
  })
  const resultado = await surtirConCliente(cliente, 'orden-1', 'usuario-1')
  assert.equal(resultado.success, false)
  if (!resultado.success) {
    assert.match(resultado.error, /Todos los artículos de esta requisición ya aparecen como surtidos/)
  }
  assert.deepEqual(cliente.escrituras, [])
})

test('esErrorFuncionInexistente también detecta las variantes sin código PGRST202', () => {
  assert.equal(
    esErrorFuncionInexistente({ message: 'function public.surtir_orden(uuid) does not exist' }),
    true,
  )
  assert.equal(
    esErrorFuncionInexistente({ message: 'Could not find the function public.surtir_orden in the schema cache' }),
    true,
  )
  assert.equal(esErrorFuncionInexistente({ code: 'P0001', message: 'No hay stock' }), false)
})
