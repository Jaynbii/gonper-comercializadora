import test from 'node:test'
import assert from 'node:assert/strict'

import { crearLimiteUso } from './limiteUso.ts'

test('crearLimiteUso: permite hasta el maximo por ventana y luego bloquea', () => {
  const limite = crearLimiteUso(3, 60_000)
  assert.equal(limite.permitir('u1', 0), true)
  assert.equal(limite.permitir('u1', 1_000), true)
  assert.equal(limite.permitir('u1', 2_000), true)
  assert.equal(limite.permitir('u1', 3_000), false)
})

test('crearLimiteUso: claves distintas no comparten cupo', () => {
  const limite = crearLimiteUso(1, 60_000)
  assert.equal(limite.permitir('a', 0), true)
  assert.equal(limite.permitir('b', 0), true)
  assert.equal(limite.permitir('a', 1), false)
})

test('crearLimiteUso: la ventana se libera al pasar el tiempo', () => {
  const limite = crearLimiteUso(1, 60_000)
  assert.equal(limite.permitir('a', 0), true)
  assert.equal(limite.permitir('a', 59_999), false)
  assert.equal(limite.permitir('a', 60_001), true)
})
