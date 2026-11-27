import test from 'node:test'
import assert from 'node:assert/strict'

import { fijarAnchoBoton } from './botonCarga.ts'

test('fijarAnchoBoton: fija el ancho medido como estilo en línea', () => {
  const boton = { offsetWidth: 180, style: {} as Record<string, string> }
  fijarAnchoBoton({
    currentTarget: boton,
  } as unknown as React.MouseEvent<HTMLButtonElement>)
  assert.equal(boton.style.width, '180px')
})
