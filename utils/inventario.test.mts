import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clasificarStock,
  filtrarInventario,
  type ProductoInventario,
} from './inventario.ts'

const productos: ProductoInventario[] = [
  { nombre: 'Escoba de espiga', sku: 'ART0001', categoria_id: 'cat-limpieza', stock_actual: 150, stock_minimo: 10 },
  { nombre: 'Fabuloso 20L', sku: 'ART0002', categoria_id: 'cat-limpieza', stock_actual: 0, stock_minimo: 1 },
  { nombre: 'Jabón C/3 Kgs', sku: 'ART0003', categoria_id: 'cat-limpieza', stock_actual: 5, stock_minimo: 10 },
  { nombre: 'Papel P/WC jumbo', sku: 'ART0004', categoria_id: 'cat-papel', stock_actual: 10, stock_minimo: 10 },
  { nombre: 'Cloro 20L', sku: 'ART0005', categoria_id: null, stock_actual: 20, stock_minimo: 5 },
]

test('clasificarStock: misma lógica que estadoStock()', () => {
  assert.equal(clasificarStock(0, 10), 'sin')
  assert.equal(clasificarStock(-1, 10), 'sin')
  assert.equal(clasificarStock(5, 10), 'bajo')
  // En el mínimo ya es bajo, como la etiqueta "Bajo mínimo".
  assert.equal(clasificarStock(10, 10), 'bajo')
  assert.equal(clasificarStock(11, 10), 'disponible')
  assert.equal(clasificarStock(20, 5), 'disponible')
})

test('filtro por stock: sin stock', () => {
  const r = filtrarInventario(productos, { filtroStock: 'sin' })
  assert.deepEqual(r.map((p) => p.sku), ['ART0002'])
})

test('filtro por stock: bajo stock (incluye el que está justo en el mínimo)', () => {
  const r = filtrarInventario(productos, { filtroStock: 'bajo' })
  assert.deepEqual(r.map((p) => p.sku), ['ART0003', 'ART0004'])
})

test('filtro por stock: disponible', () => {
  const r = filtrarInventario(productos, { filtroStock: 'disponible' })
  assert.deepEqual(r.map((p) => p.sku), ['ART0001', 'ART0005'])
})

test('filtro por categoría', () => {
  assert.deepEqual(
    filtrarInventario(productos, { categoriaId: 'cat-papel' }).map((p) => p.sku),
    ['ART0004'],
  )
  // "Todas" no filtra por categoría.
  assert.equal(filtrarInventario(productos, { categoriaId: 'todas' }).length, 5)
  // Un producto sin categoría solo aparece en "Todas".
  assert.deepEqual(
    filtrarInventario(productos, { categoriaId: 'cat-limpieza' }).map((p) => p.sku),
    ['ART0001', 'ART0002', 'ART0003'],
  )
})

test('filtros se combinan con la búsqueda por nombre/SKU', () => {
  const r = filtrarInventario(productos, {
    termino: 'escoba',
    filtroStock: 'disponible',
  })
  assert.deepEqual(r.map((p) => p.sku), ['ART0001'])

  // Misma búsqueda, pero sin stock: no hay escobas sin stock.
  assert.deepEqual(
    filtrarInventario(productos, { termino: 'escoba', filtroStock: 'sin' }),
    [],
  )

  // Búsqueda sin acentos encuentra "Jabón".
  assert.deepEqual(
    filtrarInventario(productos, { termino: 'jabon' }).map((p) => p.sku),
    ['ART0003'],
  )
})

test('sin filtros devuelve todo', () => {
  assert.equal(filtrarInventario(productos, {}).length, 5)
})
