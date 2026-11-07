import test from 'node:test'
import assert from 'node:assert/strict'

import {
  vincularItems,
  buscarProductoSimilarPorNombre,
  nombresSimilares,
  type ProductoCatalogo,
} from './vincularProductos.ts'

// Factura A570: dos artículos distintos que comparten el mismo código SAT.
const ITEM_JUMBO = {
  codigo_pdf: '14111704',
  cantidad: 1,
  unidad: 'CAJA',
  descripcion_pdf: 'PAPEL P/WC JUMBO JUNIOR',
}
const ITEM_MANOS = {
  codigo_pdf: '14111704',
  cantidad: 1,
  unidad: 'CAJA',
  descripcion_pdf: 'PAPEL PARA MANOS EN ROLLO',
}

const JUMBO: ProductoCatalogo = {
  id: 'prod-jumbo',
  sku: 'ART0001',
  nombre: 'Papel P/wc Jumbo Junior',
  unidad_medida: 'CAJA',
  codigo_sat: '14111704',
}
const MANOS: ProductoCatalogo = {
  id: 'prod-manos',
  sku: 'ART0002',
  nombre: 'Papel para Manos en Rollo',
  unidad_medida: 'CAJA',
  codigo_sat: '14111705',
}

test('A570: dos artículos con el mismo código SAT no se confunden', () => {
  const vinculados = vincularItems([ITEM_JUMBO, ITEM_MANOS], [JUMBO])

  // El primero sí es el producto del catálogo.
  assert.equal(vinculados[0].id_bd, 'prod-jumbo')
  assert.equal(vinculados[0].existe_en_bd, true)
  assert.equal(vinculados[0].descripcion_pdf, 'Papel P/wc Jumbo Junior')

  // El segundo NO se vincula al mismo producto ni pierde su descripción.
  assert.equal(vinculados[1].id_bd, null)
  assert.equal(vinculados[1].existe_en_bd, false)
  assert.equal(vinculados[1].descripcion_pdf, 'Papel Para Manos En Rollo')
  assert.equal(vinculados[1].producto_nombre, 'Papel Para Manos En Rollo')
})

test('A570: si el segundo producto sí está en el catálogo, se vincula por nombre', () => {
  const vinculados = vincularItems([ITEM_JUMBO, ITEM_MANOS], [JUMBO, MANOS])

  assert.equal(vinculados[0].id_bd, 'prod-jumbo')
  assert.equal(vinculados[1].id_bd, 'prod-manos')
  assert.equal(vinculados[1].existe_en_bd, true)
  assert.equal(vinculados[1].descripcion_pdf, 'Papel para Manos en Rollo')
  // El código del documento NO se corrige aquí: 14111704 sí coincidió
  // con un producto (JUMBO), así que es el código correcto del documento
  // aunque el producto vinculado tenga otro codigo_sat.
  assert.equal(vinculados[1].codigo_pdf, '14111704')
})

// Foto 20759, re-test de Alex (2026-11-07): el OCR leyó 35580 en vez de
// 35980, pero el artículo se vinculó por nombre al producto correcto.
test('corrige un dígito mal leído cuando el artículo se vincula por nombre y el código no coincidió con nada', () => {
  const vinculados = vincularItems(
    [{ codigo_pdf: '35580', cantidad: 1, unidad: 'CAJA', descripcion_pdf: 'PAPEL HIGIENICO JUMBO 12/200 MTS' }],
    [
      {
        id: 'prod-higienico',
        sku: 'ART0010',
        nombre: 'Papel Higienico Jumbo 12/200 Mts',
        unidad_medida: 'CAJA',
        codigo_sat: '35980',
      },
    ],
  )

  assert.equal(vinculados[0].id_bd, 'prod-higienico')
  assert.equal(vinculados[0].existe_en_bd, true)
  assert.equal(vinculados[0].codigo_pdf, '35980')
})

test('no corrige el código si difiere en más de un dígito', () => {
  const vinculados = vincularItems(
    [{ codigo_pdf: '99999999', cantidad: 5, unidad: 'PIEZA', descripcion_pdf: 'ESCOBA DE PLASTICO ABANICO' }],
    [
      {
        id: 'prod-escoba',
        sku: 'ART0004',
        nombre: 'Escoba de plástico abanico',
        unidad_medida: 'PIEZA',
        codigo_sat: '47131600',
      },
    ],
  )

  assert.equal(vinculados[0].id_bd, 'prod-escoba')
  assert.equal(vinculados[0].codigo_pdf, '99999999')
})

test('coincidencia por código con nombre que concuerda sigue auto-vinculando', () => {
  const vinculados = vincularItems(
    [{ codigo_pdf: '47131807', cantidad: 1, unidad: 'BIDON', descripcion_pdf: 'PORRON DE CLORO 20 LTS' }],
    [
      {
        id: 'prod-cloro',
        sku: 'ART0003',
        nombre: 'Porrón de cloro 20L',
        unidad_medida: 'BIDON',
        codigo_sat: '47131807',
      },
    ],
  )

  assert.equal(vinculados[0].id_bd, 'prod-cloro')
  assert.equal(vinculados[0].existe_en_bd, true)
  assert.equal(vinculados[0].descripcion_pdf, 'Porrón de cloro 20L')
})

test('sin coincidencia por código, la búsqueda difusa por nombre sigue funcionando', () => {
  const vinculados = vincularItems(
    [{ codigo_pdf: '99999999', cantidad: 5, unidad: 'PIEZA', descripcion_pdf: 'ESCOBA DE PLASTICO ABANICO' }],
    [
      {
        id: 'prod-escoba',
        sku: 'ART0004',
        nombre: 'Escoba de plástico abanico',
        unidad_medida: 'PIEZA',
        codigo_sat: '47131600',
      },
    ],
  )

  assert.equal(vinculados[0].id_bd, 'prod-escoba')
  assert.equal(vinculados[0].existe_en_bd, true)
})

test('artículo sin coincidencia conserva su descripción del PDF', () => {
  const vinculados = vincularItems(
    [{ codigo_pdf: '12345678', cantidad: 2, unidad: 'PIEZA', descripcion_pdf: 'TRAPEADOR DE HILAZA NUEVO' }],
    [JUMBO],
  )

  assert.equal(vinculados[0].id_bd, null)
  assert.equal(vinculados[0].existe_en_bd, false)
  assert.equal(vinculados[0].descripcion_pdf, 'Trapeador De Hilaza Nuevo')
})

test('registro: mismo código SAT + nombre similar es duplicado', () => {
  const duplicado = buscarProductoSimilarPorNombre('Papel P/wc Jumbo Junior', [JUMBO])
  assert.equal(duplicado?.id, 'prod-jumbo')

  // Variación de escritura/OCR del mismo producto también bloquea.
  const duplicadoOcr = buscarProductoSimilarPorNombre('PAPEL P WC JUMBO JUNIOR', [JUMBO])
  assert.equal(duplicadoOcr?.id, 'prod-jumbo')
})

test('registro: mismo código SAT + nombre claramente distinto se puede registrar', () => {
  const duplicado = buscarProductoSimilarPorNombre('Papel para Manos en Rollo', [JUMBO])
  assert.equal(duplicado, null)
})

test('nombresSimilares distingue el mismo producto de uno distinto', () => {
  assert.equal(nombresSimilares('Papel P/wc Jumbo Junior', 'PAPEL P/WC JUMBO JUNIOR'), true)
  assert.equal(nombresSimilares('Porrón de cloro 20L', 'Porron de cloro 20 lts'), true)
  assert.equal(nombresSimilares('Papel para Manos en Rollo', 'Papel P/wc Jumbo Junior'), false)
  assert.equal(nombresSimilares('Fabuloso De 20 Litros', 'Jabón C/3 Kgs'), false)
})
