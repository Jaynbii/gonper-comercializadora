import test from 'node:test'
import assert from 'node:assert/strict'

import {
  detectarHuecos,
  type VinculoCrudo,
} from './huecosProveedor.ts'

const PRODUCTOS = [
  { id: 'p-porron', nombre: 'Porrón de cloro de 20 litros', sku: 'ART0009' },
  { id: 'p-jumbo', nombre: 'Bolsas negras jumbo de 25 KGS', sku: 'ART0004' },
  { id: 'p-escoba', nombre: 'Escoba de espigas reforzadas', sku: 'ART0002' },
]

const vinculo = (over: Partial<VinculoCrudo> = {}): VinculoCrudo => ({
  productoId: 'p-porron',
  proveedorId: 'prov-1',
  proveedorNombre: 'MazLimpio',
  relacionId: 'rel-1',
  precio: 63,
  ...over,
})

test('producto sin ningún vínculo es hueco "sin-proveedor"', () => {
  const huecos = detectarHuecos(PRODUCTOS, [])

  assert.equal(huecos.length, 3)
  assert.ok(huecos.every((h) => h.tipo === 'sin-proveedor'))
  assert.ok(huecos.every((h) => h.vinculos.length === 0))
})

test('producto con vínculo y precio > 0 no es hueco', () => {
  const huecos = detectarHuecos(PRODUCTOS, [vinculo()])

  assert.equal(huecos.length, 2)
  assert.ok(huecos.every((h) => h.productoId !== 'p-porron'))
})

test('precio en cadena ("63.00", como lo devuelve PostgREST) cuenta como precio', () => {
  const huecos = detectarHuecos(PRODUCTOS, [vinculo({ precio: '63.00' })])

  assert.ok(huecos.every((h) => h.productoId !== 'p-porron'))
})

test('vínculo con precio 0 es hueco "sin-precio" y conserva el vínculo', () => {
  const huecos = detectarHuecos(PRODUCTOS, [vinculo({ precio: 0 })])
  const hueco = huecos.find((h) => h.productoId === 'p-porron')

  assert.equal(hueco?.tipo, 'sin-precio')
  assert.equal(hueco?.vinculos.length, 1)
  assert.equal(hueco?.vinculos[0].proveedorNombre, 'MazLimpio')
  assert.equal(hueco?.vinculos[0].relacionId, 'rel-1')
})

test('vínculo con precio null es hueco "sin-precio"', () => {
  const huecos = detectarHuecos(PRODUCTOS, [vinculo({ precio: null })])
  const hueco = huecos.find((h) => h.productoId === 'p-porron')

  assert.equal(hueco?.tipo, 'sin-precio')
})

test('un vínculo con precio entre varios cierra el hueco', () => {
  const huecos = detectarHuecos(PRODUCTOS, [
    vinculo({ precio: 0 }),
    vinculo({ proveedorId: 'prov-2', proveedorNombre: 'Sam\'s', relacionId: 'rel-2', precio: 58 }),
  ])

  assert.ok(huecos.every((h) => h.productoId !== 'p-porron'))
})

test('los huecos salen ordenados por nombre', () => {
  const huecos = detectarHuecos(PRODUCTOS, [])

  assert.deepEqual(
    huecos.map((h) => h.nombre),
    [
      'Bolsas negras jumbo de 25 KGS',
      'Escoba de espigas reforzadas',
      'Porrón de cloro de 20 litros',
    ],
  )
})

test('catálogo vacío no devuelve huecos', () => {
  assert.deepEqual(detectarHuecos([], [vinculo()]), [])
})
