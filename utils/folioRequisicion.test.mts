import test from 'node:test'
import assert from 'node:assert/strict'

import { generarFolioRequisicion, siguienteConsecutivo } from './folioRequisicion.ts'

test('el folio nuevo es REQ- + consecutivo global de 4 dígitos', () => {
  assert.equal(generarFolioRequisicion(1), 'REQ-0001')
  assert.equal(generarFolioRequisicion(2), 'REQ-0002')
  assert.equal(generarFolioRequisicion(12), 'REQ-0012')
  assert.equal(generarFolioRequisicion(123), 'REQ-0123')
  // Más de 9999 no se trunca, solo crece.
  assert.equal(generarFolioRequisicion(10000), 'REQ-10000')
})

test('siguienteConsecutivo es el máximo REQ existente + 1, global', () => {
  assert.equal(siguienteConsecutivo([]), 1)
  assert.equal(siguienteConsecutivo(['REQ-0001', 'REQ-0002']), 3)
  assert.equal(siguienteConsecutivo(['REQ-0001', 'REQ-0009']), 10)
  // Ignora folios viejos ORD-... y órdenes de compra COM-....
  assert.equal(
    siguienteConsecutivo(['ORD-786179', 'ORD-699996', 'COM-123456', 'REQ-0001']),
    2,
  )
  // Ignora folios con otro formato aunque empiecen por REQ.
  assert.equal(siguienteConsecutivo(['REQ-261105-001', 'REQ-0003']), 4)
})
