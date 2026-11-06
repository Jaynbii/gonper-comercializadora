import test from 'node:test'
import assert from 'node:assert/strict'

import {
  planSurtido,
  esErrorFuncionInexistente,
  mensajeErrorSurtir,
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
