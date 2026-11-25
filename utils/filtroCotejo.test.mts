import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filtrarCotejo,
  normalizarTexto,
  type FilaCotejo,
} from './filtroCotejo.ts'

const filas: FilaCotejo[] = [
  {
    id: '1',
    nombre: 'Papel P/WC jumbo 400',
    sku: 'ART0012',
    unidad: 'CAJA',
    solicitado: 10,
    stock: 25,
    surtido: 0,
    aSurtir: 10,
    faltante: 0,
    estado: 'completo',
  },
  {
    id: '2',
    nombre: 'Jabon C/9 KG',
    sku: 'ART0023',
    unidad: 'BOLSA',
    solicitado: 2,
    stock: 0,
    surtido: 0,
    aSurtir: 0,
    faltante: 2,
    estado: 'sin-stock',
  },
  {
    id: '3',
    nombre: 'Porron de aromatizante fabuloso 20 litros',
    sku: 'ART0022',
    unidad: 'PORRON',
    solicitado: 6,
    stock: 0,
    surtido: 6,
    aSurtir: 0,
    faltante: 0,
    estado: 'completo',
  },
  {
    id: '4',
    nombre: 'Escoba de espigas reforzadas',
    sku: 'ART0002',
    unidad: 'PIEZA',
    solicitado: 10,
    stock: 2,
    surtido: 6,
    aSurtir: 2,
    faltante: 2,
    estado: 'parcial',
  },
  {
    id: '5',
    nombre: 'Bolsa Camiseta Grande 25 Kg',
    sku: 'ART0031',
    unidad: 'PIEZA',
    solicitado: 4,
    stock: 10,
    surtido: 0,
    aSurtir: 0,
    faltante: 0,
    estado: 'sin-surtir',
  },
]

test('normalizarTexto: ignora mayúsculas y acentos', () => {
  assert.equal(normalizarTexto('Jabón C/9 KG'), 'jabon c/9 kg')
  assert.equal(normalizarTexto('  ART0022 '), 'art0022')
})

test('filtrarCotejo: sin búsqueda ni filtro devuelve todo', () => {
  assert.equal(filtrarCotejo(filas, '', 'todos').length, 5)
})

test('filtrarCotejo: busca por nombre sin importar acentos', () => {
  const r = filtrarCotejo(filas, 'jabon', 'todos')
  assert.deepEqual(
    r.map((f) => f.id),
    ['2'],
  )
})

test('filtrarCotejo: busca por SKU', () => {
  const r = filtrarCotejo(filas, 'art0022', 'todos')
  assert.deepEqual(
    r.map((f) => f.id),
    ['3'],
  )
})

test('filtrarCotejo: filtro Sin stock', () => {
  assert.deepEqual(
    filtrarCotejo(filas, '', 'sin-stock').map((f) => f.id),
    ['2'],
  )
})

test('filtrarCotejo: filtro Parcial', () => {
  assert.deepEqual(
    filtrarCotejo(filas, '', 'parcial').map((f) => f.id),
    ['4'],
  )
})

test('filtrarCotejo: filtro Completo', () => {
  assert.deepEqual(
    filtrarCotejo(filas, '', 'completo').map((f) => f.id),
    ['1', '3'],
  )
})

test('filtrarCotejo: filtro Surtidos muestra solo lo entregado', () => {
  assert.deepEqual(
    filtrarCotejo(filas, '', 'surtidos').map((f) => f.id),
    ['3', '4'],
  )
})

test('filtrarCotejo: búsqueda y filtro se combinan', () => {
  const r = filtrarCotejo(filas, 'porron', 'completo')
  assert.deepEqual(
    r.map((f) => f.id),
    ['3'],
  )
  assert.deepEqual(filtrarCotejo(filas, 'porron', 'sin-stock'), [])
})

test('filtrarCotejo: filtro Sin surtir muestra solo lo marcado', () => {
  assert.deepEqual(
    filtrarCotejo(filas, '', 'sin-surtir').map((f) => f.id),
    ['5'],
  )
  // Un artículo Sin surtir no es Sin stock ni Completo aunque tenga stock.
  assert.deepEqual(filtrarCotejo(filas, '', 'sin-stock').map((f) => f.id), ['2'])
  assert.deepEqual(filtrarCotejo(filas, '', 'completo').map((f) => f.id), ['1', '3'])
})
