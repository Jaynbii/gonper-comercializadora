import test from 'node:test'
import assert from 'node:assert/strict'

import { pasosCaptura, lineaTiempoOrden } from './progresoRequisicion.ts'

test('pasosCaptura: paso 1 sin cargar, el resto pendiente', () => {
  const pasos = pasosCaptura(1)
  assert.deepEqual(
    pasos.map((p) => p.estado),
    ['actual', 'pendiente', 'pendiente', 'pendiente'],
  )
  assert.deepEqual(
    pasos.map((p) => p.etiqueta),
    ['Subir', 'Leer', 'Revisar', 'Guardar'],
  )
  assert.equal(pasos.some((p) => p.cargando), false)
})

test('pasosCaptura: paso 2 cargando marca Leer con spinner', () => {
  const pasos = pasosCaptura(2, true)
  assert.deepEqual(
    pasos.map((p) => p.estado),
    ['completado', 'actual', 'pendiente', 'pendiente'],
  )
  assert.deepEqual(
    pasos.map((p) => p.cargando),
    [false, true, false, false],
  )
})

test('pasosCaptura: paso 4, los tres primeros completados', () => {
  const pasos = pasosCaptura(4)
  assert.deepEqual(
    pasos.map((p) => p.estado),
    ['completado', 'completado', 'completado', 'actual'],
  )
})

test('pasosCaptura: paso fuera de rango se ajusta a 1..4', () => {
  assert.equal(pasosCaptura(0)[0].estado, 'actual')
  assert.equal(pasosCaptura(9)[3].estado, 'actual')
})

test('lineaTiempoOrden: BORRADOR sin artículos, la captura es el paso actual', () => {
  const pasos = lineaTiempoOrden({
    estado: 'BORRADOR',
    creadoEn: '2026-11-14T10:00:00Z',
    capturadoEn: null,
    surtidoEn: null,
    firmadaEn: null,
  })
  assert.deepEqual(
    pasos.map((p) => [p.etiqueta, p.estado]),
    [
      ['Creada', 'completado'],
      ['Artículos capturados', 'actual'],
      ['Surtida', 'pendiente'],
      ['Factura firmada', 'pendiente'],
    ],
  )
  assert.equal(pasos[0].fechaIso, '2026-11-14T10:00:00Z')
})

test('lineaTiempoOrden: PENDIENTE, la surtida es el paso actual', () => {
  const pasos = lineaTiempoOrden({
    estado: 'PENDIENTE',
    creadoEn: '2026-11-14T10:00:00Z',
    capturadoEn: '2026-11-14T10:30:00Z',
    surtidoEn: null,
    firmadaEn: null,
  })
  assert.deepEqual(
    pasos.map((p) => p.estado),
    ['completado', 'completado', 'actual', 'pendiente'],
  )
})

test('lineaTiempoOrden: PARCIAL dice "Surtida parcialmente" y la firma es el paso actual', () => {
  const pasos = lineaTiempoOrden({
    estado: 'PARCIAL',
    creadoEn: '2026-11-14T10:00:00Z',
    capturadoEn: '2026-11-14T10:30:00Z',
    surtidoEn: '2026-11-14T12:00:00Z',
    firmadaEn: null,
  })
  assert.equal(pasos[2].etiqueta, 'Surtida parcialmente')
  assert.equal(pasos[2].estado, 'completado')
  assert.equal(pasos[3].estado, 'actual')
})

test('lineaTiempoOrden: ENTREGADA con firma, todo completado', () => {
  const pasos = lineaTiempoOrden({
    estado: 'ENTREGADA',
    creadoEn: '2026-11-14T10:00:00Z',
    capturadoEn: '2026-11-14T10:30:00Z',
    surtidoEn: '2026-11-14T12:00:00Z',
    firmadaEn: '2026-11-14T13:00:00Z',
  })
  assert.deepEqual(
    pasos.map((p) => p.estado),
    ['completado', 'completado', 'completado', 'completado'],
  )
})

test('lineaTiempoOrden: ENTREGADA sin firma, la firma es el paso actual', () => {
  const pasos = lineaTiempoOrden({
    estado: 'ENTREGADA',
    creadoEn: '2026-11-14T10:00:00Z',
    capturadoEn: '2026-11-14T10:30:00Z',
    surtidoEn: '2026-11-14T12:00:00Z',
    firmadaEn: null,
  })
  assert.equal(pasos[2].etiqueta, 'Surtida')
  assert.equal(pasos[3].estado, 'actual')
})

test('lineaTiempoOrden: CANCELADA corta la línea con el paso Cancelada', () => {
  const pasos = lineaTiempoOrden({
    estado: 'CANCELADA',
    creadoEn: '2026-11-14T10:00:00Z',
    capturadoEn: '2026-11-14T10:30:00Z',
    surtidoEn: null,
    firmadaEn: null,
  })
  assert.deepEqual(
    pasos.map((p) => [p.etiqueta, p.estado]),
    [
      ['Creada', 'completado'],
      ['Artículos capturados', 'completado'],
      ['Cancelada', 'cancelado'],
    ],
  )
})

test('lineaTiempoOrden: PARCIAL con detalle muestra qué se surtió en el paso', () => {
  const pasos = lineaTiempoOrden({
    estado: 'PARCIAL',
    creadoEn: '2026-11-19T16:44:00Z',
    capturadoEn: '2026-11-19T16:46:00Z',
    surtidoEn: '2026-11-21T00:32:00Z',
    firmadaEn: null,
    surtidoDetalle: [
      {
        nombre: 'Porron de aromatizante fabuloso 20 litros',
        cantidad: 6,
        unidad: 'PORRON',
      },
    ],
  })
  const surtida = pasos.find((p) => p.etiqueta === 'Surtida parcialmente')
  assert.equal(surtida?.estado, 'completado')
  assert.deepEqual(surtida?.detalle, [
    'Porron de aromatizante fabuloso 20 litros — 6 PORRON',
  ])
})

test('lineaTiempoOrden: ENTREGADA con varios artículos lista lo entregado', () => {
  const pasos = lineaTiempoOrden({
    estado: 'ENTREGADA',
    creadoEn: '2026-11-17T10:00:00Z',
    capturadoEn: '2026-11-17T10:05:00Z',
    surtidoEn: '2026-11-17T21:58:00Z',
    firmadaEn: null,
    surtidoDetalle: [
      { nombre: 'Papel Para Manos En Rollo', cantidad: 3, unidad: 'CAJA' },
      { nombre: 'Jabón Liquido Para Manos', cantidad: 1, unidad: 'GALON' },
    ],
  })
  const surtida = pasos.find((p) => p.etiqueta === 'Surtida')
  assert.equal(surtida?.estado, 'completado')
  assert.deepEqual(surtida?.detalle, [
    'Papel Para Manos En Rollo — 3 CAJA',
    'Jabón Liquido Para Manos — 1 GALON',
  ])
})

test('lineaTiempoOrden: sin artículos surtidos el paso no lleva detalle', () => {
  const pasos = lineaTiempoOrden({
    estado: 'PARCIAL',
    creadoEn: '2026-11-19T16:44:00Z',
    capturadoEn: '2026-11-19T16:46:00Z',
    surtidoEn: '2026-11-21T00:32:00Z',
    firmadaEn: null,
  })
  const surtida = pasos.find((p) => p.etiqueta === 'Surtida parcialmente')
  assert.equal(surtida?.detalle, undefined)
  const otros = pasos.filter((p) => p.etiqueta !== 'Surtida parcialmente')
  assert.equal(
    otros.some((p) => p.detalle !== undefined),
    false,
  )
})

test('lineaTiempoOrden: el detalle ignora cantidades en cero y sin unidad', () => {
  const pasos = lineaTiempoOrden({
    estado: 'PARCIAL',
    creadoEn: '2026-11-19T16:44:00Z',
    capturadoEn: '2026-11-19T16:46:00Z',
    surtidoEn: '2026-11-21T00:32:00Z',
    firmadaEn: null,
    surtidoDetalle: [
      { nombre: 'Aromatizante', cantidad: 6, unidad: 'PORRON' },
      { nombre: 'Jabón', cantidad: 0, unidad: 'BOLSA' },
      { nombre: 'Trapeador', cantidad: 2, unidad: '' },
    ],
  })
  const surtida = pasos.find((p) => p.etiqueta === 'Surtida parcialmente')
  assert.deepEqual(surtida?.detalle, [
    'Aromatizante — 6 PORRON',
    'Trapeador — 2',
  ])
})
