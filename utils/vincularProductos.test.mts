import test from 'node:test'
import assert from 'node:assert/strict'

import {
  vincularItems,
  buscarCandidatos,
  buscarProductoSimilarPorNombre,
  nombresSimilares,
  variantesToken,
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

// Alex (2026-11-07): escribió "Jabón en polvo c/9kgs" en el modal y no
// sugirió nada, aunque el catálogo tiene "Jabón c/9 kgs". Fuse puntúa
// ese par 0.624 (límite 0.40) por las palabras de más ("en polvo") y el
// peso pegado ("9kgs" contra "9 kgs").
const JABON_9: ProductoCatalogo = {
  id: 'prod-jabon-9',
  sku: 'ART0020',
  nombre: 'Jabón c/9 kgs',
  unidad_medida: 'BULTO',
  codigo_sat: '12345678',
}
const JABON_3: ProductoCatalogo = {
  id: 'prod-jabon-3',
  sku: 'ART0021',
  nombre: 'Jabón c/3 kgs',
  unidad_medida: 'BULTO',
  codigo_sat: '12345679',
}
const JABON_POLVO: ProductoCatalogo = {
  id: 'prod-jabon-polvo',
  sku: 'ART0022',
  nombre: 'Jabón en polvo',
  unidad_medida: 'BULTO',
  codigo_sat: '12345680',
}
const ITEM_JABON_9KGS = {
  codigo_pdf: '99999999',
  cantidad: 1,
  unidad: 'BULTO',
  descripcion_pdf: 'Jabón en polvo c/9kgs',
}

test('palabras de más y peso pegado no impiden vincular: "Jabón en polvo c/9kgs" vincula a "Jabón c/9 kgs"', () => {
  const vinculados = vincularItems([ITEM_JABON_9KGS], [JABON_9, JABON_3, JABON_POLVO])

  // Gana el de 9 kilos (4 tokens coincidentes) sobre el genérico
  // "Jabón en polvo" (2) y el de 3 kilos (que solo sugiere).
  assert.equal(vinculados[0].id_bd, 'prod-jabon-9')
  assert.equal(vinculados[0].existe_en_bd, true)
  assert.equal(vinculados[0].sugerencia, null)
})

test('con solo "Jabón en polvo" en el catálogo, lo escrito con el peso se vincula a él', () => {
  const vinculados = vincularItems([ITEM_JABON_9KGS], [JABON_POLVO])

  assert.equal(vinculados[0].id_bd, 'prod-jabon-polvo')
  assert.equal(vinculados[0].existe_en_bd, true)
})

test('con solo el de 3 kilos, no auto-vincula el peso equivocado: solo sugiere', () => {
  const vinculados = vincularItems([ITEM_JABON_9KGS], [JABON_3])

  assert.equal(vinculados[0].id_bd, null)
  assert.equal(vinculados[0].existe_en_bd, false)
  assert.equal(vinculados[0].sugerencia?.id, 'prod-jabon-3')
})

test('la regla de tokens no vincula un producto claramente distinto', () => {
  const vinculados = vincularItems(
    [{ codigo_pdf: '99999999', cantidad: 1, unidad: 'PIEZA', descripcion_pdf: 'Cloro de 20 litros' }],
    [JABON_9],
  )

  assert.equal(vinculados[0].id_bd, null)
  assert.equal(vinculados[0].existe_en_bd, false)
  assert.equal(vinculados[0].sugerencia, null)
})

// Combobox del modal de revisión: al corregir letra por letra se ven
// los productos del inventario que van coincidiendo, ordenados del más
// parecido al menos, para elegir uno con un toque.
test('buscarCandidatos: con el nombre a medias ("jabon en pol") ya aparecen los jabones', () => {
  const candidatos = buscarCandidatos('jabon en pol', [JABON_9, JABON_3, JABON_POLVO, JUMBO])

  assert.ok(candidatos.length >= 2)
  assert.ok(candidatos.every((c) => c.nombre.toLowerCase().includes('jab')))
  assert.ok(candidatos[0].similitud >= candidatos[candidatos.length - 1].similitud)
})

test('buscarCandidatos: "papel jumbo" pone primero el Jumbo Junior y no el de manos', () => {
  const candidatos = buscarCandidatos('papel jumbo', [JUMBO, MANOS])

  assert.equal(candidatos[0].id, 'prod-jumbo')
})

test('buscarCandidatos: con 1 letra o vacío no hay nada que comparar', () => {
  assert.deepEqual(buscarCandidatos('', [JABON_9]), [])
  assert.deepEqual(buscarCandidatos('j', [JABON_9]), [])
})

test('buscarCandidatos: un texto sin relación con el catálogo no devuelve nada', () => {
  assert.deepEqual(buscarCandidatos('cloro de 20 litros', [JABON_9, JUMBO]), [])
})

test('buscarCandidatos: respeta el límite y trae sku y unidad para mostrar', () => {
  const candidatos = buscarCandidatos('jabon', [JABON_9, JABON_3, JABON_POLVO], 2)

  assert.equal(candidatos.length, 2)
  assert.ok(candidatos.every((c) => c.sku.startsWith('ART') && c.unidad_medida))
})

// Plurales en las cartas de entrega ("2 porrones de cloro"): el
// stemming solo ordena mejor las sugerencias del combobox; el
// auto-vínculo sigue con umbrales exactos (regla de Alex: la
// sugerencia propone, el usuario dispone con el toque).
const PORRON: ProductoCatalogo = {
  id: 'prod-porron',
  sku: 'ART0009',
  nombre: 'Porrón de cloro de 20 litros',
  unidad_medida: 'PORRON',
  codigo_sat: null,
}
const BOLSAS_MEDIANAS: ProductoCatalogo = {
  id: 'prod-bolsas-medianas',
  sku: 'ART0013',
  nombre: 'Bolsas negras medianas 70x90',
  unidad_medida: 'BULTO',
  codigo_sat: null,
}
const BOLSAS_JUMBO: ProductoCatalogo = {
  id: 'prod-bolsas-jumbo',
  sku: 'ART0004',
  nombre: 'Bolsas negras jumbo de 25 KGS',
  unidad_medida: 'BULTO',
  codigo_sat: null,
}
const BOLSA_CAMISETA: ProductoCatalogo = {
  id: 'prod-bolsa-camiseta',
  sku: 'ART0027',
  nombre: 'Bolsa Camiseta Jumbo 25 Kg',
  unidad_medida: 'BULTO',
  codigo_sat: null,
}
const ESCOBA_ESPIGA: ProductoCatalogo = {
  id: 'prod-escoba-espiga',
  sku: 'ART0002',
  nombre: 'Escoba de espigas reforzadas',
  unidad_medida: 'PIEZA',
  codigo_sat: null,
}
const ESCOBA_COCO: ProductoCatalogo = {
  id: 'prod-escoba-coco',
  sku: 'ART0039',
  nombre: 'Escoba De Coco',
  unidad_medida: 'PIEZA',
  codigo_sat: null,
}
const CATALOGO_CARTA = [
  PORRON,
  BOLSAS_MEDIANAS,
  BOLSAS_JUMBO,
  BOLSA_CAMISETA,
  ESCOBA_ESPIGA,
  ESCOBA_COCO,
]

test('variantesToken: quita el plural sin tocar singulares ni palabras cortas', () => {
  assert.ok(variantesToken('porrones').includes('porron'))
  assert.ok(variantesToken('escobas').includes('escoba'))
  assert.deepEqual(variantesToken('mes'), ['mes'])
  assert.deepEqual(variantesToken('cloro'), ['cloro'])
})

test('buscarCandidatos: el plural "porrones" encuentra el porrón del catálogo', () => {
  const candidatos = buscarCandidatos('porrones de cloro', CATALOGO_CARTA, 5)

  assert.equal(candidatos[0]?.id, 'prod-porron')
  assert.ok((candidatos[0]?.similitud ?? 0) >= 50)
})

test('buscarCandidatos: con plurales, "bolsas negras medianas" sigue poniendo primero las medianas', () => {
  const candidatos = buscarCandidatos('bolsas negras medianas', CATALOGO_CARTA, 5)

  assert.equal(candidatos[0]?.id, 'prod-bolsas-medianas')
})

test('buscarCandidatos: "escobas de coco" pone primero la de coco y no la de espiga', () => {
  const candidatos = buscarCandidatos('escobas de coco', CATALOGO_CARTA, 5)

  assert.equal(candidatos[0]?.id, 'prod-escoba-coco')
})

test('vincularItems: un plural por sí solo NO auto-vincula (la sugerencia propone, el usuario dispone)', () => {
  const [fila] = vincularItems(
    [
      {
        codigo_pdf: '',
        cantidad: 2,
        unidad: 'porrones',
        descripcion_pdf: 'PORRONES DE CLORO',
      },
    ],
    CATALOGO_CARTA,
  )

  assert.equal(fila?.existe_en_bd, false)
  assert.equal(fila?.id_bd, null)
  // Y la unidad del documento sí se normaliza a singular.
  assert.equal(fila?.unidad, 'PORRON')
})

