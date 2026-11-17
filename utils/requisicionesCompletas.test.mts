import test from 'node:test'
import assert from 'node:assert/strict'
import {
  esRequisicionCompleta,
  esRequisicionProtegida,
} from './requisicionesCompletas.ts'

test('esRequisicionCompleta: entregada y firmada es completa y protegida', () => {
  const orden = { estado: 'ENTREGADA', facturaFirmadaPath: 'firmadas/req-1.jpg' }
  assert.equal(esRequisicionCompleta(orden), true)
  assert.equal(esRequisicionProtegida(orden), true)
})

test('esRequisicionCompleta: entregada sin firma no es completa ni protegida', () => {
  const orden = { estado: 'ENTREGADA', facturaFirmadaPath: null }
  assert.equal(esRequisicionCompleta(orden), false)
  assert.equal(esRequisicionProtegida(orden), false)
})

test('esRequisicionProtegida: firmada aunque cambien su estado sigue protegida', () => {
  // El candado no se abre cambiando el estado desde "Gestionar".
  const orden = { estado: 'PENDIENTE', facturaFirmadaPath: 'firmadas/req-1.jpg' }
  assert.equal(esRequisicionCompleta(orden), false)
  assert.equal(esRequisicionProtegida(orden), true)
})

test('esRequisicionCompleta: parcial sin firma no es completa', () => {
  const orden = { estado: 'PARCIAL', facturaFirmadaPath: null }
  assert.equal(esRequisicionCompleta(orden), false)
  assert.equal(esRequisicionProtegida(orden), false)
})

test('esRequisicionProtegida: cancelada con firma sigue protegida', () => {
  const orden = { estado: 'CANCELADA', facturaFirmadaPath: 'firmadas/req-1.jpg' }
  assert.equal(esRequisicionCompleta(orden), false)
  assert.equal(esRequisicionProtegida(orden), true)
})
