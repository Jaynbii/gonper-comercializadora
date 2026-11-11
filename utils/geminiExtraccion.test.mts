import test from 'node:test'
import assert from 'node:assert/strict'

import {
  construirCuerpoGemini,
  parsearRespuestaGemini,
  PROMPT_EXTRACCION_REQUISICION,
} from './geminiExtraccion.ts'

test('lee el JSON limpio del modelo', () => {
  const items = parsearRespuestaGemini(
    '{"items":[{"codigo_pdf":"13747","cantidad":3,"unidad":"CAJA","descripcion_pdf":"PAPEL PARA MANOS EN ROLLO"}]}',
  )

  assert.deepEqual(items, [
    {
      codigo_pdf: '13747',
      cantidad: 3,
      unidad: 'CAJA',
      descripcion_pdf: 'PAPEL PARA MANOS EN ROLLO',
    },
  ])
})

test('tolera cercas de código y texto alrededor del JSON', () => {
  const items = parsearRespuestaGemini(
    'Aquí están los artículos:\n```json\n{"items":[{"codigo_pdf":"","cantidad":"2","unidad":"pieza","descripcion_pdf":"  escobas   de espiga "}]}\n```',
  )

  assert.deepEqual(items, [
    {
      codigo_pdf: '',
      cantidad: 2,
      unidad: 'PIEZA',
      descripcion_pdf: 'ESCOBAS DE ESPIGA',
    },
  ])
})

test('descarta filas inválidas sin inventar artículos', () => {
  const items = parsearRespuestaGemini(
    JSON.stringify({
      items: [
        { codigo_pdf: '1', cantidad: 0, unidad: 'CAJA', descripcion_pdf: 'CERO' },
        { codigo_pdf: '2', cantidad: -5, unidad: 'CAJA', descripcion_pdf: 'NEGATIVA' },
        { codigo_pdf: '3', cantidad: 'abc', unidad: 'CAJA', descripcion_pdf: 'NO NUMERICA' },
        { codigo_pdf: '4', cantidad: 1, unidad: 'CAJA', descripcion_pdf: '   ' },
        null,
        'basura',
        { codigo_pdf: '5', cantidad: 1.5, unidad: '', descripcion_pdf: 'BUENA' },
      ],
    }),
  )

  assert.deepEqual(items, [
    { codigo_pdf: '5', cantidad: 1.5, unidad: '', descripcion_pdf: 'BUENA' },
  ])
})

test('respuesta basura o sin items devuelve lista vacía', () => {
  assert.deepEqual(parsearRespuestaGemini('no hay nada que leer'), [])
  assert.deepEqual(parsearRespuestaGemini('{"items":[]}'), [])
  assert.deepEqual(parsearRespuestaGemini('{"otra":"cosa"}'), [])
  assert.deepEqual(parsearRespuestaGemini(''), [])
})

test('el cuerpo de la petición lleva el prompt y la imagen en línea', () => {
  const cuerpo = construirCuerpoGemini('image/jpeg', 'QUJD')

  assert.equal(cuerpo.contents.length, 1)
  assert.deepEqual(cuerpo.contents[0].parts[0], {
    text: PROMPT_EXTRACCION_REQUISICION,
  })
  assert.deepEqual(cuerpo.contents[0].parts[1], {
    inline_data: { mime_type: 'image/jpeg', data: 'QUJD' },
  })
  assert.equal(cuerpo.generationConfig.responseMimeType, 'application/json')
})

test('la unidad se normaliza a singular aunque el modelo la devuelva en plural', () => {
  const items = parsearRespuestaGemini(
    '{"items":[{"codigo_pdf":"","cantidad":2,"unidad":"porrones","descripcion_pdf":"porrones de cloro"}]}',
  )

  assert.equal(items[0]?.unidad, 'PORRON')
})

test('el prompt limita la unidad a la lista permitida', () => {
  assert.ok(PROMPT_EXTRACCION_REQUISICION.includes('PORRON'))
  assert.ok(PROMPT_EXTRACCION_REQUISICION.includes('BULTO'))
  assert.ok(PROMPT_EXTRACCION_REQUISICION.includes('nunca inventes otra unidad'))
})
