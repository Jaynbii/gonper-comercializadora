import test from 'node:test'
import assert from 'node:assert/strict'

import { siguienteSku } from './sku.ts'

test('siguienteSku: sin códigos existentes empieza en ART0001', () => {
  assert.equal(siguienteSku([]), 'ART0001')
  assert.equal(siguienteSku([null, undefined, '']), 'ART0001')
})

test('siguienteSku: sigue la secuencia con ceros', () => {
  assert.equal(siguienteSku(['ART0001']), 'ART0002')
  assert.equal(siguienteSku(['ART0009', 'ART0015', 'ART0002']), 'ART0016')
})

test('siguienteSku: el máximo es numérico, no alfabético', () => {
  // En texto "ART9" > "ART0010", pero numéricamente 10 > 9: el
  // siguiente es ART0011, no ART0010 (que ya existe).
  assert.equal(siguienteSku(['ART9', 'ART0010']), 'ART0011')
  assert.equal(siguienteSku(['ART9999']), 'ART10000')
})

test('siguienteSku: ignora códigos raros y los que no son ART', () => {
  assert.equal(
    siguienteSku(['ART-ABC', 'art0001', '37312', 'ART0003']),
    'ART0004',
  )
})
