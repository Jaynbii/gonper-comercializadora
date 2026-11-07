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
  // "E LI" es un resto de GALON mal leído, no parte del nombre: la cola
  // de la descripción lo limpia (igual que "E CA" en la 20345).
  assert.equal(items[2].descripcion_pdf, 'JABON LIQUIDO PARA MANOS')
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

// Re-test 2 de Alex (2026-11-07 00:20): el código ya se corregía a
// 35980 (el pulido estaba vivo en el preview) pero "Des Lo" SEGUÍA en
// el modal. Causa: la regla comparaba normalizarUnidad(token) === token
// y normalizarUnidad devuelve MAYÚSCULAS, así que con la cola en Title
// Case ("Des Lo") o minúsculas — que es como la devuelve el OCR del
// teléfono — la regla no se disparaba. Los tests solo alimentaban
// MAYÚSCULAS y pasaban. La cola debe limpiarse en cualquier caja.
test('limpia los fragmentos cortos aunque el OCR los devuelva en Title Case o minúsculas', () => {
  const { items } = parseRequisicion(
    [
      '13747 3.00 CAJA Papel Para Manos En Rollo Des Lo 736.60 2,209.80',
      '13747 3.00 CAJA papel para manos en rollo des lo 736.60 2,209.80',
      '13747 3.00 CAJA Papel Para Manos En Rollo Des Lo I 736.60 2,209.80',
    ].join('\n'),
  )

  assert.equal(items.length, 3)
  assert.equal(items[0].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
  assert.equal(items[1].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
  assert.equal(items[2].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
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

// Requisición 20345 (Aseo Urbano, 14/10/2026): PDF escaneado sin capa de
// texto, leído con Tesseract 'spa' sobre el render a escala 2.0 (la misma
// que usa la app para los PDFs escaneados). En la corrida del teléfono de
// Alex, dos filas salieron con basura al final de la descripción:
// "Recogedor De Lamina Reforzada 1840 Y Teno" y "Papel P/wc Jumbo 400
// ... Ta". Es el precio/importe colado en la línea: en esta reproducción
// las mismas filas salen como "— ¡18:43 AT" y "a e :". La regla de la
// cola ahora quita esos restos sin tocar los números reales del nombre
// ("400", "12/200", "25 KGS"). También cubre que el OCR confunda el
// punto decimal con dos puntos ("5:00" por "5.00" en el trapeador).
test('lee el PDF escaneado real de la requisición 20345 sin ensuciar descripciones', () => {
  const { items } = parseRequisicion(
    [
  "y                                                                     na",
  "MUNICIPIO DE MAZATLAN                        ¡bad Ep",
  "Requisicion: 20345",
  "Póliza:0-0                                    Fecha: 14/10/2026     7",
  "TED E EEE ENE SEED NO TE",
  "Depto: DEPARTAMENTO DE:ASEO URBANO                                =D    7",
  "PROVEEDOR: 004606 - PEREA CAMBEROS ALAN                     CTA: pg",
  "Dirección: SANTA ROSA                            E ve   _",
  "Ciudad: MAZATLAN                                      REC: PECABIOIOISA",
  "Observaciones: SE SOLICITA EL SIGUIENTE MATERIAL DE LIMPIEZA PARA EL DEPARTAMENTO DE ASEO",
  "URBANO                                                                  a          :",
  "dedo tinta mambo tna ta ise num aerroropeya e",
  "CODIGO CANTIDAD UNIDAD DESCRIPCION DEL ARTICULO O SERVICIO                     PRECIO IMPORTE",
  "lb da tii",
  "17414 150.00 PIEZA ESCOBA DE ESPIGA                              -         pra Leo",
  "37072 100.00 PIEZA RECOGEDOR DE LAMINA REFORZADA                    — ¡18:43 AT",
  "37312 20.00 BULTO BOLSA NEGRA JUMBO DE 25 KGS.                      2,132.08 42,64",
  "37530 20.00 PIEZA ARAÑAS METALICAS REFORZADAS                              200.47 EAU",
  "38795 5.00 PIEZA CEPILLO IXTLE                                         Bs     E",
  "8074    10.00 PIEZA ESCOBAS DE PLASTICO                                   08.16     381,60",
  "8972    5:00 PIEZA TRAPEADOR                                            —_91.64    458.2",
  "9773   1,00 PIEZA CLORO DE 20 LITROS                            e   Ca",
  "36192   1,00 PORRON FABULOSO DE 20 LITROS                       486.04",
  "3984    3.00 METRO FRANELA                                              a",
  "2562     1.00   PIEZA CUBETA PARA LAVAR LOS BAÑOS                            '     3",
  "20593    10.00 BOLSA JABON C/9 KGS.                                          38",
  "3952     1.00   CAJA   PAPEL P/WC JUMBO 400                                 a   e    :",
  "2026-9-0912-211-6-4-7-216001-5121221600100000900091200 ARTICULOS DE ASEO Y LIMPIA - FONDOS FEDERALES - FORTAMUN",
  "=                                            DEPARTAMENTO DE ASEO URBANO",
  "Proyecto:    438   FORTAMUN - DEPARTAMENTO DE ASEO URBANO",
  "cos:   216001 ARTICULOS DE ASEO Y LIMPIA                                    2.\"",
  "SUB-TOTAL",
  "— TOTAL",
  "il",
  "Li l",
  "Fr",
  "i                          Ne",
  "Á          -",
  "EN",
  "\"Ne",
  "'",
  "U                      U",
  "E       _           JESUS ALBERTO TIRADO BONILLA —",
  "DEPARTAMENTO DE PROVEEDURIA                             \"",
  "eo       ¡ota A A EA                 Est",
  "LOTA: ENTREGAR FACTURAS DENTRO DE UN PLAZO NO MAYOR A2 DÍAS              “e",
  "1",
    ].join('\n'),
  )

  assert.deepEqual(
    items.map((item) => `${item.codigo_pdf}|${item.cantidad}|${item.unidad}|${item.descripcion_pdf}`),
    [
      '17414|150|PIEZA|ESCOBA DE ESPIGA',
      '37072|100|PIEZA|RECOGEDOR DE LAMINA REFORZADA',
      '37312|20|BULTO|BOLSA NEGRA JUMBO DE 25 KGS',
      '37530|20|PIEZA|ARAÑAS METALICAS REFORZADAS',
      '38795|5|PIEZA|CEPILLO IXTLE',
      '8074|10|PIEZA|ESCOBAS DE PLASTICO',
      '8972|5|PIEZA|TRAPEADOR',
      '9773|1|PIEZA|CLORO DE 20 LITROS',
      '36192|1|PORRON|FABULOSO DE 20 LITROS',
      '3984|3|METRO|FRANELA',
      '2562|1|PIEZA|CUBETA PARA LAVAR LOS BAÑOS',
      '20593|10|BOLSA|JABON C/9 KGS',
      '3952|1|CAJA|PAPEL P/WC JUMBO 400',
    ],
  )
})

// Re-test de Alex (2026-11-07) con la misma requisición 20345: las líneas
// exactas que el OCR de su teléfono produjo para las dos filas malas
// (en Title Case, como las mostró el modal). "1840 Y Teno" es el importe
// colado en la línea; "... Ta" es el precio leído como puntos y letras.
test('limpia las colas exactas que el OCR del teléfono produjo en la 20345', () => {
  const { items } = parseRequisicion(
    [
      '17414 150.00 PIEZA Escoba De Espiga 127.60 19,140.00',
      '37072 100.00 PIEZA Recogedor De Lamina Reforzada 1840 Y Teno 75.40 7,540.00',
      '37312 20.00 BULTO Bolsa Negra Jumbo De 25 KGS. 2,132.08 42,641.60',
      '37530 20.00 PIEZA Arañas Metalicas Reforzadas 220.40 4,408.00',
      '38795 5.00 PIEZA Cepillo Ixtle 150.80 754.00',
      '8074 10.00 PIEZA Escobas De Plastico 88.16 881.60',
      '8972 5.00 PIEZA Trapeador 91.64 458.20',
      '9773 1.00 PIEZA Cloro De 20 Litros 371.20 371.20',
      '36192 1.00 PORRON Fabuloso De 20 Litros 486.04 486.04',
      '3984 3.00 METRO Franela 30.16 90.48',
      '2562 1.00 PIEZA Cubeta Para Lavar Los Baños 365.40 365.40',
      '20593 10.00 BOLSA Jabon C/9 KGS. 388.60 3,886.00',
      '3952 1.00 CAJA Papel P/wc Jumbo 400 ... Ta 749.36 749.36',
    ].join('\n'),
  )

  assert.equal(items.length, 13)
  assert.equal(items[1].descripcion_pdf, 'RECOGEDOR DE LAMINA REFORZADA')
  assert.equal(items[12].descripcion_pdf, 'PAPEL P/WC JUMBO 400')
})

// El OCR confunde el punto decimal con dos puntos en la cantidad.
test('acepta dos puntos como separador decimal en la cantidad', () => {
  const { items } = parseRequisicion('8972 5:00 PIEZA TRAPEADOR 91.64 458.20')

  assert.equal(items.length, 1)
  assert.equal(items[0].cantidad, 5)
  assert.equal(items[0].descripcion_pdf, 'TRAPEADOR')
})

// Un número suelto al final no es basura por sí solo: "400" es parte del
// nombre, pero "38" después de una unidad es resto del precio 388.60.
test('conserva el número del nombre y quita el número resto del precio', () => {
  const { items } = parseRequisicion(
    [
      '3952 1.00 CAJA PAPEL P/WC JUMBO 400 749.36 749.36',
      '20593 10.00 BOLSA JABON C/9 KGS. 38',
    ].join('\n'),
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].descripcion_pdf, 'PAPEL P/WC JUMBO 400')
  assert.equal(items[1].descripcion_pdf, 'JABON C/9 KGS')
})

// Carta de entrega (Mercado Municipal "José María Pino Suárez",
// 19/10/2026): otra forma en que les piden material. No es una tabla —
// es una lista de viñetas "cantidad unidad descripción", sin códigos
// ni precios. El cliente se elige al subir el archivo, como siempre;
// aquí solo se leen los artículos.
const CARTA_PINO_SUAREZ = [
  'Mazatlán, Sinaloa a 19 de octubre del 2026',
  'C. BRIANDA DANIELA ÁVILA TIRADO',
  'ADMINISTRADORA',
  'MERCADO MUNICIPAL "JOSÉ MARÍA PINO SUÁREZ"',
  'PRESENTE.',
  'Se hace entrega del siguiente material (mes de octubre):',
  '• 2 porron de cloro',
  '• ½ bulto de bolsas negras medianas',
  '• ½ bulto de bolsas negras jumbo',
  '• 5 escobas de espiga reforzadas',
  '• 5 cepillos de mango largo',
  'FIRMA DE RECIBIDO',
].join('\n')

test('lee la carta de entrega del Mercado Pino Suárez como requisición', () => {
  const { items } = parseRequisicion(CARTA_PINO_SUAREZ)

  assert.deepEqual(
    items.map((item) => `${item.codigo_pdf}|${item.cantidad}|${item.unidad}|${item.descripcion_pdf}`),
    [
      '|2|PORRON|CLORO',
      '|0.5|BULTO|BOLSAS NEGRAS MEDIANAS',
      '|0.5|BULTO|BOLSAS NEGRAS JUMBO',
      '|5|PIEZA|ESCOBAS DE ESPIGA REFORZADAS',
      '|5|PIEZA|CEPILLOS DE MANGO LARGO',
    ],
  )
})

// Fracciones: ½, ¼, ¾ como carácter único y "1/2" como el OCR a veces
// lo lee. Sin unidad, la pieza es el valor por defecto.
test('acepta fracciones en la carta de entrega (¼, ¾ y 1/2)', () => {
  const { items } = parseRequisicion(
    [
      'Se hace entrega del siguiente material:',
      '• ¼ bulto de bolsas negras medianas',
      '• ¾ caja de guantes',
      '• 1/2 galon de cloro',
    ].join('\n'),
  )

  assert.deepEqual(
    items.map((item) => `${item.cantidad}|${item.unidad}|${item.descripcion_pdf}`),
    [
      '0.25|BULTO|BOLSAS NEGRAS MEDIANAS',
      '0.75|CAJA|GUANTES',
      '0.5|GALON|CLORO',
    ],
  )
})

// El OCR del teléfono a veces pierde la viñeta: con la frase de
// entrega, las líneas "cantidad + resto" también se leen.
test('lee la carta aunque el OCR pierda las viñetas', () => {
  const { items } = parseRequisicion(
    [
      'Se hace entrega del siguiente material:',
      '2 porron de cloro',
      '5 escobas de espiga reforzadas',
    ].join('\n'),
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].cantidad, 2)
  assert.equal(items[0].unidad, 'PORRON')
  assert.equal(items[0].descripcion_pdf, 'CLORO')
  assert.equal(items[1].unidad, 'PIEZA')
  assert.equal(items[1].descripcion_pdf, 'ESCOBAS DE ESPIGA REFORZADAS')
})

// Y aunque pierda la frase: 2+ líneas con viñeta y cantidad, sin
// encabezado de tabla, también son una carta.
test('lee la lista de viñetas aunque el OCR pierda la frase de entrega', () => {
  const { items } = parseRequisicion(
    [
      '• 2 porron de cloro',
      '• ½ bulto de bolsas negras medianas',
    ].join('\n'),
  )

  assert.equal(items.length, 2)
  assert.equal(items[1].cantidad, 0.5)
  assert.equal(items[1].unidad, 'BULTO')
})

// Las requisiciones en tabla dicen "SE SOLICITA EL SIGUIENTE
// MATERIAL" en Observaciones: eso no es una carta y no debe robar
// filas de la tabla.
test('no confunde una requisición en tabla con una carta aunque diga "siguiente material"', () => {
  const { items } = parseRequisicion(
    [
      'Observaciones: SE SOLICITA EL SIGUIENTE MATERIAL DE LIMPIEZA PARA EL DEPARTAMENTO DE ASEO',
      'CODIGO CANTIDAD UNIDAD DESCRIPCION DEL ARTICULO O SERVICIO PRECIO IMPORTE',
      '13747 3.00 CAJAS PAPEL PARA MANOS EN ROLLO 736.60 2,209.80',
    ].join('\n'),
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].codigo_pdf, '13747')
  assert.equal(items[0].descripcion_pdf, 'PAPEL PARA MANOS EN ROLLO')
})

// El OCR real del teléfono (Tesseract + el preprocesado de la app)
// deforma las viñetas de la carta: la • sale como "e" o "+", la
// cantidad va pegada a la palabra ("2porrones", "5escobas") y el ½
// desaparece o sale como "Ya"/"Ys" pegado a la unidad ("Yabulto").
// Con ese texto la carta debe leer los mismos 5 artículos que con el
// texto transcrito limpio.
const CARTA_PINO_SUAREZ_OCR_PROCESADO = [
  'Se hace entrega del siguiente material (mes de octubre):',
  'e 2porrones de cloro',
  'e bulto de bolsas negras medianas',
  'e bulto de bolsas negras jumbo',
  'e 5escobas de espiga reforzadas',
  'e 5cepillos de mango largo',
].join('\n')

const CARTA_PINO_SUAREZ_OCR_CRUDO = [
  'Se hace entrega del siguiente material (mes de octubre):',
  '+ 2 porrones de cloro',
  '+ Yabulto de bolsas negras medianas',
  '+ Ysbulto de bolsas negras jumbo',
  '* 5escobas de espiga reforzadas',
  '+ 5cepillos de mango largo',
].join('\n')

test('lee la carta con el texto real del OCR (viñetas como "e"/"+", cantidad pegada, ½ perdido)', () => {
  for (const texto of [CARTA_PINO_SUAREZ_OCR_PROCESADO, CARTA_PINO_SUAREZ_OCR_CRUDO]) {
    const { items } = parseRequisicion(texto)

    assert.deepEqual(
      items.map((item) => `${item.codigo_pdf}|${item.cantidad}|${item.unidad}|${item.descripcion_pdf}`),
      [
        '|2|PORRON|CLORO',
        '|0.5|BULTO|BOLSAS NEGRAS MEDIANAS',
        '|0.5|BULTO|BOLSAS NEGRAS JUMBO',
        '|5|PIEZA|ESCOBAS DE ESPIGA REFORZADAS',
        '|5|PIEZA|CEPILLOS DE MANGO LARGO',
      ],
    )
  }
})

// "%bulto": otra lectura típica del ½ pegado a la unidad.
test('recupera el ½ cuando el OCR lo lee como "%" pegado a la unidad', () => {
  const { items } = parseRequisicion(
    [
      'Se hace entrega del siguiente material:',
      '• %bulto de bolsas negras jumbo',
      '• 2 porron de cloro',
    ].join('\n'),
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].cantidad, 0.5)
  assert.equal(items[0].unidad, 'BULTO')
  assert.equal(items[0].descripcion_pdf, 'BOLSAS NEGRAS JUMBO')
})
