import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calcularFaltantePorOrden,
  consolidarFaltantesSeleccionados,
  proveedorSugerido,
  agruparCompraPorProveedor,
  esMismaCompra,
  agruparComprasPorRequisicion,
  construirItemsRecepcion,
} from './faltantesPorOrden.ts'

const productos = new Map([
  [
    'prod-papel',
    {
      id: 'prod-papel',
      nombre: 'Papel para manos',
      sku: 'ART0001',
      unidadMedida: 'CAJA',
      stockActual: 6,
    },
  ],
  [
    'prod-jabon',
    {
      id: 'prod-jabon',
      nombre: 'Jabón líquido',
      sku: 'ART0002',
      unidadMedida: 'GALON',
      stockActual: 0,
    },
  ],
])

const precios = new Map([
  [
    'prod-papel',
    [
      { proveedorId: 'prov-a', proveedorNombre: 'Papel Oro', precioUnitario: 100 },
      { proveedorId: 'prov-b', proveedorNombre: 'MazLimpio', precioUnitario: 80 },
    ],
  ],
])

test('preserva el surtido parcial: piden 10, hay 6, faltan 4', () => {
  const orden = calcularFaltantePorOrden({
    ordenId: 'ord-1',
    folio: 'ORD-1',
    clienteNombre: 'Ingresos',
    estado: 'PENDIENTE',
    createdAt: '2026-11-05',
    items: [{ productoId: 'prod-papel', cantidadSolicitada: 10, cantidadSurtida: 0 }],
    productos,
    preciosPorProducto: precios,
  })

  assert.equal(orden.porcentajeSurtible, 60)
  assert.equal(orden.faltantes.length, 1)
  assert.equal(orden.faltantes[0].faltante, 4)
  assert.equal(orden.faltantes[0].pendiente, 10)
  // Proveedor sugerido: el más barato con precio registrado.
  assert.equal(orden.faltantes[0].proveedorSugerido?.proveedorNombre, 'MazLimpio')
  assert.equal(orden.costoEstimadoTotal, 320)
  assert.equal(orden.tieneSinPrecio, false)
})

test('sin precio registrado no inventa proveedor ni costo', () => {
  const orden = calcularFaltantePorOrden({
    ordenId: 'ord-1',
    folio: 'ORD-1',
    clienteNombre: 'Ingresos',
    estado: 'PENDIENTE',
    createdAt: '2026-11-05',
    items: [{ productoId: 'prod-jabon', cantidadSolicitada: 5, cantidadSurtida: 0 }],
    productos,
    preciosPorProducto: precios,
  })

  assert.equal(orden.faltantes[0].proveedorSugerido, null)
  assert.equal(orden.faltantes[0].costoEstimado, null)
  assert.equal(orden.costoEstimadoTotal, 0)
  assert.equal(orden.tieneSinPrecio, true)
  assert.equal(orden.porcentajeSurtible, 0)
})

test('una orden ya cubierta no tiene faltantes y queda al 100%', () => {
  const orden = calcularFaltantePorOrden({
    ordenId: 'ord-1',
    folio: 'ORD-1',
    clienteNombre: 'Ingresos',
    estado: 'PENDIENTE',
    createdAt: '2026-11-05',
    items: [{ productoId: 'prod-papel', cantidadSolicitada: 6, cantidadSurtida: 0 }],
    productos,
    preciosPorProducto: precios,
  })

  assert.deepEqual(orden.faltantes, [])
  assert.equal(orden.porcentajeSurtible, 100)
})

test('al consolidar dos órdenes el stock se descuenta una sola vez', () => {
  const consolidado = consolidarFaltantesSeleccionados({
    ordenes: [
      { items: [{ productoId: 'prod-papel', cantidadSolicitada: 10, cantidadSurtida: 0 }] },
      { items: [{ productoId: 'prod-papel', cantidadSolicitada: 10, cantidadSurtida: 0 }] },
    ],
    productos,
  })

  // Demanda 20 - stock 6 = 14, no 4 + 4 = 8.
  assert.deepEqual(consolidado, [{ productoId: 'prod-papel', faltante: 14 }])
})

test('agruparCompraPorProveedor junta por proveedor y aparta los sin precio', () => {
  const orden = calcularFaltantePorOrden({
    ordenId: 'ord-1',
    folio: 'REQ-0001',
    clienteNombre: 'Ingresos',
    estado: 'PENDIENTE',
    createdAt: '2026-11-05',
    items: [
      { productoId: 'prod-papel', cantidadSolicitada: 10, cantidadSurtida: 0 },
      { productoId: 'prod-jabon', cantidadSolicitada: 5, cantidadSurtida: 0 },
    ],
    productos,
    preciosPorProducto: precios,
  })

  const { grupos, sinPrecio } = agruparCompraPorProveedor(orden.faltantes)

  // Papel: faltan 4 a $80 de MazLimpio. Jabón: sin precio.
  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].proveedorNombre, 'MazLimpio')
  assert.equal(grupos[0].subtotal, 320)
  assert.deepEqual(grupos[0].items, [
    {
      productoId: 'prod-papel',
      nombre: 'Papel para manos',
      cantidad: 4,
      precioUnitario: 80,
      subtotal: 320,
    },
  ])
  assert.deepEqual(sinPrecio, [
    { productoId: 'prod-jabon', nombre: 'Jabón líquido', cantidad: 5 },
  ])
})

test('agruparCompraPorProveedor con todo sin precio no genera grupos', () => {
  const { grupos, sinPrecio } = agruparCompraPorProveedor([
    {
      productoId: 'prod-jabon',
      nombre: 'Jabón líquido',
      sku: 'ART0002',
      unidadMedida: 'GALON',
      cantidadSolicitada: 5,
      cantidadSurtida: 0,
      pendiente: 5,
      enStock: 0,
      faltante: 5,
      proveedorSugerido: null,
      costoEstimado: null,
    },
  ])
  assert.deepEqual(grupos, [])
  assert.equal(sinPrecio.length, 1)
})

test('proveedorSugerido ignora precios en cero y elige el más barato', () => {
  assert.equal(
    proveedorSugerido([
      { proveedorId: 'a', proveedorNombre: 'A', precioUnitario: 0 },
      { proveedorId: 'b', proveedorNombre: 'B', precioUnitario: 50 },
      { proveedorId: 'c', proveedorNombre: 'C', precioUnitario: 40 },
    ])?.proveedorNombre,
    'C',
  )
  assert.equal(proveedorSugerido([]), null)
})

test('esMismaCompra: mismos artículos en distinto orden es duplicado', () => {
  assert.equal(
    esMismaCompra(
      [
        { productoId: 'a', cantidad: 10 },
        { productoId: 'b', cantidad: 5 },
      ],
      [
        { productoId: 'b', cantidad: 5 },
        { productoId: 'a', cantidad: 10 },
      ],
    ),
    true,
  )
  // Distinta cantidad: no es la misma compra.
  assert.equal(
    esMismaCompra(
      [{ productoId: 'a', cantidad: 10 }],
      [{ productoId: 'a', cantidad: 9 }],
    ),
    false,
  )
  // Distinto producto: no es la misma compra.
  assert.equal(
    esMismaCompra(
      [{ productoId: 'a', cantidad: 10 }],
      [{ productoId: 'c', cantidad: 10 }],
    ),
    false,
  )
  // Sin artículos no se considera duplicado.
  assert.equal(esMismaCompra([], []), false)
})

test('agruparComprasPorRequisicion: un grupo por requisición y "Sin requisición" al final', () => {
  const req3 = { id: 'r3', folio: 'REQ-0003', clienteNombre: 'Aseo Urbano' }
  const req2 = { id: 'r2', folio: 'REQ-0002', clienteNombre: 'Capta' }
  const grupos = agruparComprasPorRequisicion([
    { id: 'c1', requisicion: req3 },
    { id: 'c2', requisicion: null },
    { id: 'c3', requisicion: req3 },
    { id: 'c4', requisicion: req2 },
    { id: 'c5' },
  ])
  assert.deepEqual(
    grupos.map((g) => g.requisicion?.folio ?? null),
    ['REQ-0003', 'REQ-0002', null],
  )
  assert.deepEqual(
    grupos.map((g) => g.ordenes.map((o) => o.id)),
    [['c1', 'c3'], ['c4'], ['c2', 'c5']],
  )
})

test('construirItemsRecepcion: recibe por lo solicitado, solo artículos de la orden generada', () => {
  const generados = [
    { id: 'item-1', producto_id: 'a', cantidad_solicitada: 10 },
    { id: 'item-2', producto_id: 'b', cantidad_solicitada: 5 },
  ]
  assert.deepEqual(
    construirItemsRecepcion(generados, [
      { productoId: 'a', cantidad: 10 },
      { productoId: 'b', cantidad: 5 },
    ]),
    [
      { id: 'item-1', producto_id: 'a', cantidad_recibida: 10 },
      { id: 'item-2', producto_id: 'b', cantidad_recibida: 5 },
    ],
  )
  // Sin el ítem generado no se recibe nada (no se inventa un id).
  assert.deepEqual(
    construirItemsRecepcion(generados, [{ productoId: 'z', cantidad: 3 }]),
    [],
  )
  // Cantidad 0 o negativa no se recibe.
  assert.deepEqual(
    construirItemsRecepcion(generados, [
      { productoId: 'a', cantidad: 0 },
      { productoId: 'b', cantidad: -2 },
    ]),
    [],
  )
  // Sin ítems generados no hay nada que recibir.
  assert.deepEqual(
    construirItemsRecepcion([], [{ productoId: 'a', cantidad: 10 }]),
    [],
  )
})
