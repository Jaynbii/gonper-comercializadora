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
