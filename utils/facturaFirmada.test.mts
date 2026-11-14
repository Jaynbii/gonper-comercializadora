import test from 'node:test'
import assert from 'node:assert/strict'

import {
  construirRutaFacturaFirmada,
  tieneFacturaFirmada,
  validarFotoFirmada,
} from './facturaFirmada.ts'

test('validarFotoFirmada: sin foto pide tomarla', () => {
  assert.equal(
    validarFotoFirmada(null),
    'Toma o elige la foto de la factura firmada y sellada.',
  )
})

test('validarFotoFirmada: un PDF no es foto válida', () => {
  assert.equal(
    validarFotoFirmada({ type: 'application/pdf', size: 1_000 }),
    'La foto debe ser JPG, PNG o WebP.',
  )
})

test('validarFotoFirmada: foto vacía no pasa', () => {
  assert.equal(
    validarFotoFirmada({ type: 'image/jpeg', size: 0 }),
    'La foto está vacía. Toma otra.',
  )
})

test('validarFotoFirmada: foto de más de 10 MB no pasa', () => {
  assert.equal(
    validarFotoFirmada({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }),
    'La foto pesa más de 10 MB. Toma otra con menos peso.',
  )
})

test('validarFotoFirmada: JPG, PNG y WebP de buen tamaño pasan', () => {
  assert.equal(validarFotoFirmada({ type: 'image/jpeg', size: 1_000_000 }), null)
  assert.equal(validarFotoFirmada({ type: 'image/png', size: 1_000_000 }), null)
  assert.equal(validarFotoFirmada({ type: 'image/webp', size: 1_000_000 }), null)
})

test('construirRutaFacturaFirmada: prefijo firmadas con orden y tiempo', () => {
  assert.equal(
    construirRutaFacturaFirmada('orden-1', 'foto.jpg', 1_700_000_000_000),
    'firmadas/orden-1_1700000000000_foto.jpg',
  )
})

test('construirRutaFacturaFirmada: limpia espacios y caracteres raros del nombre', () => {
  assert.equal(
    construirRutaFacturaFirmada('orden-1', 'mi foto (2).jpg', 1_700_000_000_000),
    'firmadas/orden-1_1700000000000_mi_foto_2.jpg',
  )
})

test('construirRutaFacturaFirmada: sin nombre usable usa foto.jpg', () => {
  assert.equal(
    construirRutaFacturaFirmada('orden-1', '   ', 1_700_000_000_000),
    'firmadas/orden-1_1700000000000_foto.jpg',
  )
})

test('tieneFacturaFirmada: sin orden o sin ruta es falso', () => {
  assert.equal(tieneFacturaFirmada(null), false)
  assert.equal(tieneFacturaFirmada({}), false)
  assert.equal(tieneFacturaFirmada({ factura_firmada_path: null }), false)
})

test('tieneFacturaFirmada: con ruta es verdadero', () => {
  assert.equal(
    tieneFacturaFirmada({ factura_firmada_path: 'firmadas/orden-1_1_foto.jpg' }),
    true,
  )
})
