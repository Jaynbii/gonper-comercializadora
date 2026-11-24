import test from 'node:test'
import assert from 'node:assert/strict'

import { estadoCotejoItem } from './cotejoRequisicion.ts'

test('cotejo: artículo ya entregado completo no tiene faltante (caso aromatizante REQ-0012)', () => {
  const r = estadoCotejoItem({ solicitado: 6, surtido: 6, stock: 0 })
  assert.equal(r.pendiente, 0)
  assert.equal(r.aSurtir, 0)
  assert.equal(r.faltante, 0)
  assert.equal(r.estado, 'completo')
})

test('cotejo: artículo a medias muestra solo lo que queda por surtir', () => {
  const r = estadoCotejoItem({ solicitado: 10, surtido: 6, stock: 2 })
  assert.equal(r.pendiente, 4)
  assert.equal(r.aSurtir, 2)
  assert.equal(r.faltante, 2)
  assert.equal(r.estado, 'parcial')
  // Los números cuadran: surtido + a surtir + faltante = solicitado.
  assert.equal(6 + r.aSurtir + r.faltante, 10)
})

test('cotejo: artículo a medias sin stock, el faltante es lo pendiente', () => {
  const r = estadoCotejoItem({ solicitado: 10, surtido: 6, stock: 0 })
  assert.equal(r.pendiente, 4)
  assert.equal(r.aSurtir, 0)
  assert.equal(r.faltante, 4)
  assert.equal(r.estado, 'sin-stock')
})

test('cotejo: artículo sin surtir y sin stock, el faltante es todo lo solicitado', () => {
  const r = estadoCotejoItem({ solicitado: 10, surtido: 0, stock: 0 })
  assert.equal(r.pendiente, 10)
  assert.equal(r.faltante, 10)
  assert.equal(r.estado, 'sin-stock')
})

test('cotejo: artículo sin surtir con stock suficiente, completo', () => {
  const r = estadoCotejoItem({ solicitado: 10, surtido: 0, stock: 15 })
  assert.equal(r.pendiente, 10)
  assert.equal(r.aSurtir, 10)
  assert.equal(r.faltante, 0)
  assert.equal(r.estado, 'completo')
})

test('cotejo: artículo entregado completo aunque haya stock, completo', () => {
  const r = estadoCotejoItem({ solicitado: 10, surtido: 10, stock: 5 })
  assert.equal(r.pendiente, 0)
  assert.equal(r.faltante, 0)
  assert.equal(r.estado, 'completo')
})
