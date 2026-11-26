import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filtrarPorEstado,
  filtrarRequisiciones,
  type RequisicionBuscable,
} from './filtroRequisiciones.ts'

const lista: RequisicionBuscable[] = [
  { id: '1', folio: 'REQ-0012', cliente: 'Departamento de Mantenimiento', estado: 'PARCIAL' },
  { id: '2', folio: 'REQ-0011', cliente: 'Departamento de Mantenimiento', estado: 'PENDIENTE' },
  { id: '3', folio: 'REQ-0001', cliente: 'Ingresos', estado: 'ENTREGADA' },
]

test('filtrarRequisiciones: sin búsqueda devuelve toda la lista', () => {
  assert.deepEqual(filtrarRequisiciones(lista, ''), lista)
  assert.deepEqual(filtrarRequisiciones(lista, '   '), lista)
})

test('filtrarRequisiciones: busca por folio', () => {
  const r = filtrarRequisiciones(lista, 'req-0012')
  assert.deepEqual(r.map((x) => x.id), ['1'])
})

test('filtrarRequisiciones: busca por cliente sin importar mayúsculas ni acentos', () => {
  const r = filtrarRequisiciones(lista, 'mantenimiento')
  assert.deepEqual(r.map((x) => x.id), ['1', '2'])
  const r2 = filtrarRequisiciones(lista, 'INGRESOS')
  assert.deepEqual(r2.map((x) => x.id), ['3'])
})

test('filtrarRequisiciones: busca por estado', () => {
  const r = filtrarRequisiciones(lista, 'pendiente')
  assert.deepEqual(r.map((x) => x.id), ['2'])
})

test('filtrarRequisiciones: sin coincidencias devuelve lista vacía', () => {
  assert.deepEqual(filtrarRequisiciones(lista, 'zzz'), [])
})

test('filtrarPorEstado: TODAS devuelve toda la lista', () => {
  assert.deepEqual(filtrarPorEstado(lista, 'TODAS'), lista)
})

test('filtrarPorEstado: cada pestaña devuelve solo su estado', () => {
  assert.deepEqual(
    filtrarPorEstado(lista, 'PENDIENTE').map((x) => x.id),
    ['2'],
  )
  assert.deepEqual(
    filtrarPorEstado(lista, 'PARCIAL').map((x) => x.id),
    ['1'],
  )
  assert.deepEqual(
    filtrarPorEstado(lista, 'ENTREGADA').map((x) => x.id),
    ['3'],
  )
})

test('filtrarPorEstado + filtrarRequisiciones: la búsqueda se compone con la pestaña', () => {
  const parciales = filtrarPorEstado(lista, 'PARCIAL')
  assert.deepEqual(
    filtrarRequisiciones(parciales, 'mantenimiento').map((x) => x.id),
    ['1'],
  )
  assert.deepEqual(filtrarRequisiciones(parciales, 'ingresos'), [])
})
