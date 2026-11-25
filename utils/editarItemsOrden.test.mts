import test from 'node:test'
import assert from 'node:assert/strict'

import {
  validarEdicionItems,
  type ItemEditado,
  type ItemExistenteEdicion,
} from './editarItemsOrden.ts'

const existentes: ItemExistenteEdicion[] = [
  {
    itemId: 'a1',
    productoId: 'p1',
    nombre: 'Papel P/WC jumbo 400',
    solicitado: 10,
    surtido: 0,
    bloqueadoPorCompra: false,
  },
  {
    itemId: 'a2',
    productoId: 'p2',
    nombre: 'Porron de aromatizante fabuloso 20 litros',
    solicitado: 6,
    surtido: 6,
    bloqueadoPorCompra: false,
  },
  {
    itemId: 'a3',
    productoId: 'p3',
    nombre: 'Jabon C/9 KG',
    solicitado: 2,
    surtido: 0,
    bloqueadoPorCompra: true,
  },
]

const editado = (
  parcial: Partial<ItemEditado> & { itemId: string | null },
): ItemEditado => ({
  productoId: 'px',
  nombre: 'Producto',
  cantidad: 1,
  unidad: 'PIEZA',
  ...parcial,
})

test('validarEdicionItems: edición libre de un artículo sin surtido ni compra', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel P/WC jumbo 400', cantidad: 12, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Porron de aromatizante fabuloso 20 litros', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon C/9 KG', cantidad: 2, unidad: 'BOLSA' }),
  ])
  assert.deepEqual(r, { ok: true })
})

test('validarEdicionItems: quitar el único artículo no deja la requisición vacía', () => {
  const r = validarEdicionItems(existentes, [])
  assert.equal(r.ok, false)
})

test('validarEdicionItems: cantidad 0 o negativa es inválida', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel', cantidad: 0, unidad: 'CAJA' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /Cantidad inválida/)
})

test('validarEdicionItems: el mismo producto dos veces es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel', cantidad: 5, unidad: 'CAJA' }),
    editado({ itemId: null, productoId: 'p1', nombre: 'Papel', cantidad: 5, unidad: 'CAJA' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /dos veces/)
})

test('validarEdicionItems: bajar de lo surtido es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Aromatizante', cantidad: 5, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon', cantidad: 2, unidad: 'BOLSA' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /menor que lo surtido \(6\)/)
})

test('validarEdicionItems: cambiar el producto de un artículo surtido es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p9', nombre: 'Otro', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon', cantidad: 2, unidad: 'BOLSA' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /No se puede cambiar el producto/)
})

test('validarEdicionItems: quitar un artículo surtido es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon', cantidad: 2, unidad: 'BOLSA' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /ya se surtieron 6/)
})

test('validarEdicionItems: modificar un artículo con orden de compra es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Aromatizante', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon', cantidad: 3, unidad: 'BOLSA' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /ya tiene orden de compra/)
})

test('validarEdicionItems: quitar un artículo con orden de compra es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Aromatizante', cantidad: 6, unidad: 'PORRON' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /ya tiene orden de compra/)
})

test('validarEdicionItems: quitar un artículo libre y agregar uno nuevo es válido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Aromatizante', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon', cantidad: 2, unidad: 'BOLSA' }),
    editado({ itemId: null, productoId: 'p4', nombre: 'Escoba de espigas', cantidad: 4, unidad: 'PIEZA' }),
  ])
  assert.deepEqual(r, { ok: true })
})

test('validarEdicionItems: marcar Sin surtir un artículo libre es válido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel P/WC jumbo 400', cantidad: 10, unidad: 'CAJA', sinSurtir: true }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Porron de aromatizante fabuloso 20 litros', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon C/9 KG', cantidad: 2, unidad: 'BOLSA' }),
  ])
  assert.deepEqual(r, { ok: true })
})

test('validarEdicionItems: agregar un artículo nuevo ya marcado Sin surtir es válido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel P/WC jumbo 400', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Porron de aromatizante fabuloso 20 litros', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon C/9 KG', cantidad: 2, unidad: 'BOLSA' }),
    editado({ itemId: null, productoId: 'p4', nombre: 'Escoba de espigas', cantidad: 4, unidad: 'PIEZA', sinSurtir: true }),
  ])
  assert.deepEqual(r, { ok: true })
})

test('validarEdicionItems: desmarcar Sin surtir un artículo libre marcado es válido', () => {
  const marcados: ItemExistenteEdicion[] = existentes.map((e) =>
    e.itemId === 'a1' ? { ...e, sinSurtir: true } : e,
  )
  const r = validarEdicionItems(marcados, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel P/WC jumbo 400', cantidad: 10, unidad: 'CAJA', sinSurtir: false }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Porron de aromatizante fabuloso 20 litros', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon C/9 KG', cantidad: 2, unidad: 'BOLSA' }),
  ])
  assert.deepEqual(r, { ok: true })
})

test('validarEdicionItems: marcar Sin surtir un artículo ya surtido es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel P/WC jumbo 400', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Porron de aromatizante fabuloso 20 litros', cantidad: 6, unidad: 'PORRON', sinSurtir: true }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon C/9 KG', cantidad: 2, unidad: 'BOLSA' }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /Sin surtir/)
})

test('validarEdicionItems: cambiar la marca Sin surtir de un artículo con orden de compra es inválido', () => {
  const r = validarEdicionItems(existentes, [
    editado({ itemId: 'a1', productoId: 'p1', nombre: 'Papel P/WC jumbo 400', cantidad: 10, unidad: 'CAJA' }),
    editado({ itemId: 'a2', productoId: 'p2', nombre: 'Porron de aromatizante fabuloso 20 litros', cantidad: 6, unidad: 'PORRON' }),
    editado({ itemId: 'a3', productoId: 'p3', nombre: 'Jabon C/9 KG', cantidad: 2, unidad: 'BOLSA', sinSurtir: true }),
  ])
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /orden de compra/)
})
