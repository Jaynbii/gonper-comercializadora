// Exportar los faltantes a PDF (Compras › Sugerencias).
//
// El contenido es el mismo faltante consolidado que se ve en la vista
// General (respetando la selección de 1-2 requisiciones): producto,
// código, cantidad que falta, proveedor y precio, cantidad a pedir y
// subtotal, con el total estimado al final. La selección que el usuario
// hizo en pantalla (proveedor y cantidad por producto) manda sobre la
// sugerencia; sin selección se usa el proveedor más barato con precio
// registrado; sin precio no se inventa ninguno.
//
// La parte de datos (armarFilasFaltantesPdf) es pura y se prueba con
// `node --test`. El dibujo del PDF usa jsPDF + autotable con
// importación dinámica dentro del clic, para no cargar la librería al
// abrir la página ni romper el render del servidor.

import { proveedorSugerido, type PrecioProveedor } from './faltantesPorOrden.ts'
import type { RowInput } from 'jspdf-autotable'

export type FaltanteParaPdf = {
  id: string
  nombre: string
  sku: string
  unidad_medida: string | null
  faltante: number
}

export type SeleccionParaPdf = {
  proveedorId: string
  cantidad: number
  precio: number
}

export type ProveedorParaPdf = {
  id: string
  nombre: string
  producto_proveedores?: {
    producto_id: string
    precio_unitario: number | string
  }[]
}

export type FilaFaltantePdf = {
  nombre: string
  sku: string
  faltante: number
  unidadMedida: string | null
  proveedorNombre: string | null
  precioUnitario: number | null
  cantidadAPedir: number
  subtotal: number | null
}

const precioValido = (precio: number | string | null | undefined) => {
  const n = Number(precio)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Resuelve cada faltante a una fila del PDF: la selección del usuario
// manda; sin ella, el proveedor más barato con precio; sin precio, la
// fila queda como "sin precio" y no suma al total.
export function armarFilasFaltantesPdf(args: {
  faltantes: FaltanteParaPdf[]
  seleccionados: Record<string, SeleccionParaPdf>
  proveedores: ProveedorParaPdf[]
}): {
  filas: FilaFaltantePdf[]
  totalEstimado: number
  sinPrecio: number
} {
  const { faltantes, seleccionados, proveedores } = args
  const porId = new Map(proveedores.map((p) => [p.id, p]))

  const filas: FilaFaltantePdf[] = faltantes.map((producto) => {
    const seleccion = seleccionados[producto.id]
    const cantidadAPedir =
      seleccion && Number.isFinite(seleccion.cantidad) && seleccion.cantidad > 0
        ? seleccion.cantidad
        : producto.faltante

    let proveedorNombre: string | null = null
    let precioUnitario: number | null = null

    if (seleccion) {
      proveedorNombre = porId.get(seleccion.proveedorId)?.nombre ?? 'Proveedor'
      precioUnitario = precioValido(seleccion.precio)
    } else {
      // Precios registrados para este producto en todos los proveedores.
      const precios: PrecioProveedor[] = []
      for (const proveedor of proveedores) {
        for (const relacion of proveedor.producto_proveedores || []) {
          if (relacion.producto_id !== producto.id) continue
          const precio = precioValido(relacion.precio_unitario)
          if (precio !== null) {
            precios.push({
              proveedorId: proveedor.id,
              proveedorNombre: proveedor.nombre,
              precioUnitario: precio,
            })
          }
        }
      }
      const sugerido = proveedorSugerido(precios)
      proveedorNombre = sugerido?.proveedorNombre ?? null
      precioUnitario = sugerido?.precioUnitario ?? null
    }

    return {
      nombre: producto.nombre,
      sku: producto.sku,
      faltante: producto.faltante,
      unidadMedida: producto.unidad_medida,
      proveedorNombre,
      precioUnitario,
      cantidadAPedir,
      subtotal: precioUnitario !== null ? precioUnitario * cantidadAPedir : null,
    }
  })

  return {
    filas,
    totalEstimado: filas.reduce((acc, f) => acc + (f.subtotal ?? 0), 0),
    sinPrecio: filas.filter((f) => f.subtotal === null).length,
  }
}

const monedaPdf = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})
const numeroPdf = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 2,
})
const fechaLargaPdf = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

// Genera y descarga el PDF. Se importa jsPDF solo aquí (dentro del
// clic) para no cargarlo al abrir Compras.
export async function generarPdfFaltantes(args: {
  filas: FilaFaltantePdf[]
  totalEstimado: number
  sinPrecio: number
  alcance: string
  fecha: Date
}): Promise<void> {
  const { filas, totalEstimado, sinPrecio, alcance, fecha } = args
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const fechaTexto = fechaLargaPdf.format(fecha)

  doc.setFontSize(16)
  doc.text('Faltantes por comprar', 12, 14)
  doc.setFontSize(10)
  doc.setTextColor(102, 102, 102)
  doc.text(`Gonper Comercializadora · ${fechaTexto}`, 12, 21)
  doc.text(alcance, 12, 27)
  doc.setTextColor(31, 31, 31)

  const filaSinPrecio: RowInput[] =
    sinPrecio > 0
      ? [
          [
            {
              content: `${sinPrecio} ${sinPrecio === 1 ? 'artículo sin precio' : 'artículos sin precio'} — pídelos por WhatsApp, no entran en el total`,
              colSpan: 6,
              styles: { fontStyle: 'italic', textColor: [194, 65, 12] },
            },
          ],
        ]
      : []

  const pie: RowInput[] = [
    [
      {
        content: 'Total estimado',
        colSpan: 5,
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      monedaPdf.format(totalEstimado),
    ],
    ...filaSinPrecio,
  ]

  autoTable(doc, {
    startY: 33,
    head: [
      ['Producto', 'Faltante', 'Proveedor', 'Precio', 'Cant. a pedir', 'Subtotal'],
    ],
    body: filas.map((fila) => [
      `${fila.nombre}\n${fila.sku}`,
      `${numeroPdf.format(fila.faltante)}${fila.unidadMedida ? ` ${fila.unidadMedida}` : ''}`,
      fila.proveedorNombre ?? 'Sin precio',
      fila.precioUnitario !== null
        ? monedaPdf.format(fila.precioUnitario)
        : '—',
      numeroPdf.format(fila.cantidadAPedir),
      fila.subtotal !== null ? monedaPdf.format(fila.subtotal) : '—',
    ]),
    foot: pie,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [123, 182, 1],
      textColor: [31, 31, 31],
      fontStyle: 'bold',
    },
    columnStyles: {
      1: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didDrawPage: (datos) => {
      const totalPaginas = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(102, 102, 102)
      doc.text(
        `Gonper Comercializadora · Página ${datos.pageNumber} de ${totalPaginas}`,
        12,
        doc.internal.pageSize.height - 8,
      )
      doc.setTextColor(31, 31, 31)
    },
  })

  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  doc.save(`faltantes-gonper-${y}-${m}-${d}.pdf`)
}
