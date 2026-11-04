import test from 'node:test'
import assert from 'node:assert/strict'

import { parseRequisicion } from './requisicion.ts'
import { normalizarUnidad } from './unidades.ts'

const DOCUMENTO = [
  '13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
  '35980 1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
  '7385 1.00 GALON JABON LIQUIDO PARA MANOS 378.16 378.16',
].join('\n')

test('lee el documento completo con código, cantidad, unidad y descripción', () => {
  const { items, lineasNoReconocidas } = parseRequisicion(DOCUMENTO)

  assert.deepEqual(lineasNoReconocidas, [])
  assert.deepEqual(items, [
    {
      codigo_pdf: '13747',
      cantidad: 3,
      unidad: 'CAJA',
      descripcion_pdf: 'PAPEL PARA MANOS EN ROLLO',
    },
    {
      codigo_pdf: '35980',
      cantidad: 1,
      unidad: 'CAJA',
      descripcion_pdf: 'PAPEL HIGIENICO JUMBO 12/200 MTS',
    },
    {
      codigo_pdf: '7385',
      cantidad: 1,
      unidad: 'GALON',
      descripcion_pdf: 'JABON LIQUIDO PARA MANOS',
    },
  ])
})

test('acepta coma decimal en la cantidad', () => {
  const { items } = parseRequisicion(
    [
      '13747 3,00 CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
      '35980 1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
      '7385 1.00 GALON JABON LIQUIDO PARA MANOS 378.16 378.16',
    ].join('\n'),
  )

  assert.equal(items.length, 3)
  assert.equal(items[0].cantidad, 3)
  assert.equal(items[0].codigo_pdf, '13747')
})

test('recompone una fila que el OCR partió en dos líneas', () => {
  const { items, lineasNoReconocidas } = parseRequisicion(
    [
      '13747 3.00',
      'CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
      '35980 1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
      '7385 1.00 GALON JABON LIQUIDO PARA MANOS 378.16 378.16',
    ].join('\n'),
  )

  assert.deepEqual(lineasNoReconocidas, [])
  assert.equal(items.length, 3)
  assert.equal(items[0].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
})

test('recompone código, cantidad y unidad partidos en líneas separadas', () => {
  const { items } = parseRequisicion(
    [
      '13747',
      '3.00',
      'CAJAS',
      'PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
    ].join('\n'),
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].codigo_pdf, '13747')
  assert.equal(items[0].cantidad, 3)
  assert.equal(items[0].unidad, 'CAJA')
  assert.equal(items[0].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
})

test('extrae la fila aunque el OCR la pegue al encabezado', () => {
  const { items, lineasNoReconocidas } = parseRequisicion(
    [
      'CODIGO CANTIDAD UNIDAD DESCRIPCION DEL ARTICULO O SERVICIO PRECIO IMPORTE 13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
      '35980 1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
      '7385 1.00 GALON JABON LIQUIDO PARA MANOS 378.16 378.16',
    ].join('\n'),
  )

  assert.equal(lineasNoReconocidas.length, 0)
  assert.equal(items.length, 3)
  assert.equal(items[0].codigo_pdf, '13747')
})

test('no pierde la fila cuando GALON fue leído como CAJA', () => {
  const { items } = parseRequisicion(
    [
      '13747 3,00 CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
      '35980 1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
      '7385 1.00 CAJA JABON LIQUIDO PARA MANOS E LI 378.16 378.16',
    ].join('\n'),
  )

  assert.equal(items.length, 3)
  assert.equal(items[2].codigo_pdf, '7385')
  assert.equal(items[2].unidad, 'CAJA')
  assert.equal(items[2].descripcion_pdf, 'JABON LIQUIDO PARA MANOS E LI')
})

test('acepta códigos de 3 a 8 dígitos y conserva ceros a la izquierda', () => {
  const { items } = parseRequisicion(
    [
      '012 2.5 PIEZA PRODUCTO CON TRES DIGITOS',
      '00001234 1 CAJA PRODUCTO CON OCHO DIGITOS',
    ].join('\n'),
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].codigo_pdf, '012')
  assert.equal(items[1].codigo_pdf, '00001234')
})

test('la unidad es opcional y nunca se inventa', () => {
  const { items } = parseRequisicion('5555 4 PAPEL BOND CARTA BLANCO')

  assert.equal(items.length, 1)
  assert.equal(items[0].unidad, '')
  assert.equal(items[0].descripcion_pdf, 'PAPEL BOND CARTA BLANCO')
})

test('conserva números internos de la descripción y solo quita precios finales', () => {
  const { items } = parseRequisicion(
    '35980 1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
  )

  assert.equal(items[0].descripcion_pdf, 'PAPEL HIGIENICO JUMBO 12/200 MTS')
})

test('devuelve las líneas que no pudo interpretar para revisión manual', () => {
  const { items, lineasNoReconocidas } = parseRequisicion(
    [
      'CODIGO CANTIDAD UNIDAD DESCRIPCION PRECIO IMPORTE',
      '13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
      'PEDIDO ESPECIAL SIN CODIGO',
      'Pagina 2',
      '1234',
    ].join('\n'),
  )

  assert.equal(items.length, 1)
  assert.deepEqual(lineasNoReconocidas, ['PEDIDO ESPECIAL SIN CODIGO'])
})

test('reconstruye una tabla OCR separada por columnas en un solo bloque', () => {
  const { items, lineasNoReconocidas } = parseRequisicion(
    [
      'CODIGO CANTIDAD UNIDAD DESCRIPCION DEL ARTICULO O SERVICIO PRECIO IMPORTE',
      '13747 35980 7385',
      '3.00 CAJAS 1.00 CAJA 1.00 GALON',
      'PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
      'PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
      'JABON LIQUIDO PARA MANOS 378.16 378.16',
    ].join('\n'),
  )

  assert.deepEqual(lineasNoReconocidas, [])
  assert.deepEqual(items, [
    {
      codigo_pdf: '13747',
      cantidad: 3,
      unidad: 'CAJA',
      descripcion_pdf: 'PAPEL PARA MANOS EN ROLLO',
    },
    {
      codigo_pdf: '35980',
      cantidad: 1,
      unidad: 'CAJA',
      descripcion_pdf: 'PAPEL HIGIENICO JUMBO 12/200 MTS',
    },
    {
      codigo_pdf: '7385',
      cantidad: 1,
      unidad: 'GALON',
      descripcion_pdf: 'JABON LIQUIDO PARA MANOS',
    },
  ])
})

test('reconstruye la tabla cuando cada columna viene en líneas separadas', () => {
  const { items, lineasNoReconocidas } = parseRequisicion(
    [
      'CODIGO CANTIDAD UNIDAD DESCRIPCION DEL ARTICULO O SERVICIO',
      '13747',
      '35980',
      '7385',
      '3.00 CAJAS',
      '1.00 CAJA',
      '1.00 GALON',
      'PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
      'PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
      'JABON LIQUIDO PARA MANOS 378.16 378.16',
    ].join('\n'),
  )

  assert.deepEqual(lineasNoReconocidas, [])
  assert.deepEqual(
    items.map((item) => `${item.codigo_pdf}|${item.cantidad}|${item.unidad}|${item.descripcion_pdf}`),
    [
      '13747|3|CAJA|PAPEL PARA MANOS EN ROLLO',
      '35980|1|CAJA|PAPEL HIGIENICO JUMBO 12/200 MTS',
      '7385|1|GALON|JABON LIQUIDO PARA MANOS',
    ],
  )
})

test('no confunde la fecha del encabezado con el código de la fila', () => {
  const { items } = parseRequisicion(
    'REQUISICION 12345 FECHA 03/11/2026 13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].codigo_pdf, '13747')
  assert.equal(items[0].cantidad, 3)
  assert.equal(items[0].unidad, 'CAJA')
})

test('reconoce la unidad aunque el OCR le agregue un punto', () => {
  const { items } = parseRequisicion('7385 1.00 GALON. JABON LIQUIDO PARA MANOS 378.16 378.16')

  assert.equal(items.length, 1)
  assert.equal(items[0].unidad, 'GALON')
  assert.equal(items[0].descripcion_pdf, 'JABON LIQUIDO PARA MANOS')
})

test('no inventa un artículo cuando la fila solo tiene código, cantidad y unidad', () => {
  const { items, lineasNoReconocidas } = parseRequisicion('13747 3.00 CAJAS')

  assert.equal(items.length, 0)
  assert.deepEqual(lineasNoReconocidas, ['13747 3.00 CAJAS'])
})

test('normaliza plurales y abreviaturas de unidades', () => {
  assert.equal(normalizarUnidad('CAJAS'), 'CAJA')
  assert.equal(normalizarUnidad('galones'), 'GALON')
  assert.equal(normalizarUnidad('KGS.'), 'KILO')
  assert.equal(normalizarUnidad('LTS'), 'LITRO')
  assert.equal(normalizarUnidad('PZAS'), 'PIEZA')
  assert.equal(normalizarUnidad(''), '')
})
