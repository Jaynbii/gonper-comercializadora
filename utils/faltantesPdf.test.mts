import test from 'node:test'
import assert from 'node:assert/strict'

import { armarFilasFaltantesPdf } from './faltantesPdf.ts'

const proveedores = [
  {
    id: 'prov-a',
    nombre: 'Limpieza SA',
    producto_proveedores: [
      { producto_id: 'p1', precio_unitario: 12.5 },
      { producto_id: 'p2', precio_unitario: 0 },
    ],
  },
  {
    id: 'prov-b',
    nombre: 'Mayoreo MX',
    producto_proveedores: [{ producto_id: 'p1', precio_unitario: 10 }],
  },
]

const faltantes = [
  { id: 'p1', nombre: 'Papel jumbo', sku: 'ART0001', unidad_medida: 'PZA', faltante: 4 },
  { id: 'p2', nombre: 'Cloro 20 L', sku: 'ART0002', unidad_medida: 'PORRON', faltante: 2 },
  { id: 'p3', nombre: 'Escoba', sku: 'ART0003', unidad_medida: null, faltante: 1 },
]

test('armarFilasFaltantesPdf: sin selección usa el proveedor más barato con precio', () => {
  const { filas, totalEstimado, sinPrecio } = armarFilasFaltantesPdf({
    faltantes,
    seleccionados: {},
    proveedores,
  })
  assert.equal(filas[0].proveedorNombre, 'Mayoreo MX')
  assert.equal(filas[0].precioUnitario, 10)
  assert.equal(filas[0].cantidadAPedir, 4)
  assert.equal(filas[0].subtotal, 40)
  // p2 solo tiene precio 0 y p3 no tiene proveedor: sin precio, no suman.
  assert.equal(filas[1].proveedorNombre, null)
  assert.equal(filas[1].subtotal, null)
  assert.equal(filas[2].proveedorNombre, null)
  assert.equal(totalEstimado, 40)
  assert.equal(sinPrecio, 2)
})

test('armarFilasFaltantesPdf: la selección del usuario manda sobre la sugerencia', () => {
  const { filas, totalEstimado } = armarFilasFaltantesPdf({
    faltantes,
    seleccionados: {
      p1: { proveedorId: 'prov-a', cantidad: 6, precio: 12.5 },
    },
    proveedores,
  })
  assert.equal(filas[0].proveedorNombre, 'Limpieza SA')
  assert.equal(filas[0].precioUnitario, 12.5)
  assert.equal(filas[0].cantidadAPedir, 6)
  assert.equal(filas[0].subtotal, 75)
  assert.equal(totalEstimado, 75)
})

test('armarFilasFaltantesPdf: cantidad inválida en la selección usa el faltante', () => {
  const { filas } = armarFilasFaltantesPdf({
    faltantes,
    seleccionados: {
      p1: { proveedorId: 'prov-b', cantidad: 0, precio: 10 },
    },
    proveedores,
  })
  assert.equal(filas[0].cantidadAPedir, 4)
  assert.equal(filas[0].subtotal, 40)
})

test('armarFilasFaltantesPdf: precio 0 en la selección es sin precio', () => {
  const { filas, totalEstimado, sinPrecio } = armarFilasFaltantesPdf({
    faltantes,
    seleccionados: {
      p1: { proveedorId: 'prov-a', cantidad: 4, precio: 0 },
    },
    proveedores,
  })
  assert.equal(filas[0].precioUnitario, null)
  assert.equal(filas[0].subtotal, null)
  assert.equal(totalEstimado, 0)
  assert.equal(sinPrecio, 3)
})
