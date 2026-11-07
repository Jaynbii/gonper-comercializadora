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

test('lee la foto de ingresos cuando el OCR conserva las columnas', () => {
  const { items } = parseRequisicion(
    [
      'MUNICIPIO DE MAZATLAN ORDEN DE COMPRA: 15280',
      'Autorizacion: 50378',
      'CODIGO CANTIDAD UNIDAD DESCRIPCION DEL ARTICULO O SERVICIO PRECIO IMPORTE',
      '13747   3.00 CAJAS PAPEL PARA MANOS EN ROLLO                  E 736.60 2,209.80',
      '35980    1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS                   -    1 749.36 749.36',
      '7385     1.00 GALON JABON LIQUIDO PARA MANOS                          ane16 - a7e.16',
    ].join('\n'),
  )

  assert.deepEqual(
    items.map((item) => `${item.codigo_pdf}|${item.cantidad}|${item.unidad}|${item.descripcion_pdf}`),
    [
      '13747|3|CAJA|PAPEL PARA MANOS EN ROLLO',
      '35980|1|CAJA|PAPEL HIGIENICO JUMBO 12/200 MTS',
      '7385|1|GALON|JABON LIQUIDO PARA MANOS',
    ],
  )
})

// Texto real de Tesseract (spa, preserve_interword_spaces) sobre la foto
// de la requisición 20759 (Dirección de Ingresos, 30/10/2026), con el
// preprocesado de la app (escala a 2200 px + contraste). Antes de este
// fix, el parser inventaba dos filas y ensuciaba las descripciones.
test('lee la foto real de ingresos 20759 sin inventar filas ni ensuciar descripciones', () => {
  const { items } = parseRequisicion(
    [
  'MUNICIPIO     MAZATLAN                              ORDEN DE COMPRA: 15280',
  '                                    Autorizacion: 50378',
  'Requisición: 20759',
  'Póliza:0-0                                             Fecha: 30/10/ 2026 _ a',
  'Nas remo O ias aa Ac            ennansrncncnnao   nin Ueenane PENETRA .',
  'Depto: DIRECCIÓN DE INGRESOS                                DAN AR',
  'PROVEEDOR: 004606 - PEREA CAMBEROS ALAN                     CTA: 2112/2/000912/004606/000000/00',
  'Dirección: SANTA ROSA                                          E.         -',
  'Ciudad: MAZATLAN                                REC: PECABS0101H6A —',
  'Teléfono:                                                           AT        - u     N',
  'Observaciones: SOLICITUD DE MATERIAL DE LIMPIEZA PARA LA DIRECCION DE INGRESOS,  o',
  'CORRESPONDIENTE AL MES DE OCTUBRE DE 2026       a        MRE E',
  'CODIGO CANTIDAD UNIDAD DESCRIPCIÓN DEL ARTÍCULO O SERVICIO      o PRECIO IMPORTE',
  '13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO ”            736.60 2,209.80',
  '35980    1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS                    749.36     di',
  '7385     1.00 GALON JABON LIQUIDO PARA MANOS                        o 378.16 378.16',
  '2026-9-0912-152-3-3-5-216001-5121221600100000900091200 ARTICULOS DE ASEO Y LIMPIA - FONDOS FEDERALES - FORTAMUN - DIRECCIÓ',
  '0429                                       DE INGRESOS                               .',
  'Proyecto: + 429  FORTAMUN - DIRECCION DE INGRESOS                         y      «4',
  'COG: — 216001 ARTICULOS DE ASEO Y LIMPIA                          A',
  '— SUB-TOTAL    -',
  'E h        1',
  'j        TOT:         3,33',
  'L)',
  '| ".  .',
  '1 e',
  'MEE LI',
  '" E |',
  'l',
  'Ml',
  'N  LJ',
  'PU',
  'JE Y',
  '!',
  '|',
  'di',
  '!',
  '!',
  '-    peenoos peneana            J   |   =  NI | Y',
  '“NOTA: ENTREGAR FA           e     N PLAZO NO MAYOR A DÍA:',
  ':         |',
      // Líneas reconstruidas de la corrida real en la app: el OCR juntó
      // el encabezado y el pie en líneas que parecían filas y el parser
      // inventó dos artículos ("2026 | E In | 1 | CAJA" y
      // "004 | Omo | 46080 | CAJA"). Ya no deben aparecer.
      '2026 1 CAJA E In',
      '004 46080 CAJA Omo',
    ].join('\n'),
  )

  assert.deepEqual(
    items.map((item) => `${item.codigo_pdf}|${item.cantidad}|${item.unidad}|${item.descripcion_pdf}`),
    [
      '13747|3|CAJA|PAPEL PARA MANOS EN ROLLO',
      '35980|1|CAJA|PAPEL HIGIENICO JUMBO 12/200 MTS',
      '7385|1|GALON|JABON LIQUIDO PARA MANOS',
    ],
  )
})

test('no inventa artículos con las líneas del encabezado o del pie de la foto', () => {
  const { items } = parseRequisicion(
    [
      '2026 1 CAJA E In',
      '004 46080 CAJA Omo',
      '2026 9 0912 152 3 3 5 216001 5121221600100000900091200 ARTICULOS DE ASEO Y LIMPIA',
      'PROVEEDOR: 004606 - PEREA CAMBEROS ALAN',
      'CORRESPONDIENTE AL MES DE OCTUBRE DE 2026',
    ].join('\n'),
  )

  assert.deepEqual(items, [])
})

// Re-test de Alex (2026-11-07) con la misma foto 20759: ya no se
// inventaban filas, pero la descripción 1 seguía con "Des Lo" pegado
// (en la primera corrida "Des Lo I"): restos de palabras de las
// columnas vecinas que el OCR cuela al final de la fila.
test('limpia los fragmentos cortos que el OCR pega al final de la descripción', () => {
  const { items } = parseRequisicion(
    [
      '13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO DES LO 736.60 2,209.80',
      '13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO DES LO I 736.60 2,209.80',
    ].join('\n'),
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
  assert.equal(items[1].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
})

test('no quita medidas ni palabras cortas reales al final de la descripción', () => {
  const { items } = parseRequisicion(
    [
      '35980 1.00 CAJA PAPEL HIGIENICO JUMBO 12/200 MTS 749.36 749.36',
      '1234 1 PIEZA TANQUE DE GAS',
    ].join('\n'),
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].descripcion_pdf, 'PAPEL HIGIENICO JUMBO 12/200 MTS')
  assert.equal(items[1].descripcion_pdf, 'TANQUE DE GAS')
})

test('no corta la descripción cuando el hueco no lleva precios', () => {
  const { items } = parseRequisicion('13747  3.00  CAJAS  PAPEL PARA MANOS   EN ROLLO')

  assert.equal(items.length, 1)
  assert.equal(items[0].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
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

test('recupera la unidad cuando el OCR la duplica al inicio de la descripción', () => {
  const { items } = parseRequisicion(
    '36192 1.00 CAJA FPORRON FABULOSO DE 20 LITROS',
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].unidad, 'PORRON')
  assert.equal(items[0].descripcion_pdf, 'FABULOSO DE 20 LITROS')
})

test('no confunde una palabra de la descripción con la unidad', () => {
  const { items } = parseRequisicion('1234 1 PIEZA CAJA DE HERRAMIENTAS')

  assert.equal(items.length, 1)
  assert.equal(items[0].unidad, 'PIEZA')
  assert.equal(items[0].descripcion_pdf, 'CAJA DE HERRAMIENTAS')
})

test('normaliza plurales y abreviaturas de unidades', () => {
  assert.equal(normalizarUnidad('CAJAS'), 'CAJA')
  assert.equal(normalizarUnidad('galones'), 'GALON')
  assert.equal(normalizarUnidad('KGS.'), 'KILO')
  assert.equal(normalizarUnidad('LTS'), 'LITRO')
  assert.equal(normalizarUnidad('PZAS'), 'PIEZA')
  assert.equal(normalizarUnidad('PORRÓN'), 'PORRON')
  assert.equal(normalizarUnidad(''), '')
})
