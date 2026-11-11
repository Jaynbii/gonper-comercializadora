// Huecos de proveedor y precio por producto (Gonper).
//
// Es código puro, sin Supabase ni Next.js, para poder probarlo con
// `node --test` sin base de datos.
//
// Regla (la misma que usa Compras para el costo estimado): un
// producto "tiene precio" solo si existe un vínculo en
// producto_proveedores con precio_unitario > 0 (ver
// proveedorSugerido en faltantesPorOrden.ts). Un producto sin
// ningún vínculo con precio queda "sin precio" y el costo
// estimado del faltante sale parcial.

export type ProductoCatalogo = { id: string; nombre: string; sku: string }

export type VinculoCrudo = {
  productoId: string
  proveedorId: string
  proveedorNombre: string
  relacionId: string
  precio: number | string | null
}

export type VinculoHueco = {
  proveedorId: string
  proveedorNombre: string
  relacionId: string
  precio: number
}

export type HuecoProveedor = {
  productoId: string
  nombre: string
  sku: string
  /** Sin ningún vínculo, o con vínculos pero ninguno con precio > 0. */
  tipo: 'sin-proveedor' | 'sin-precio'
  vinculos: VinculoHueco[]
}

export function detectarHuecos(
  productos: ProductoCatalogo[],
  vinculos: VinculoCrudo[],
): HuecoProveedor[] {
  const porProducto = new Map<string, VinculoHueco[]>()
  for (const vinculo of vinculos) {
    if (!vinculo.productoId) continue
    const precio = Number(vinculo.precio)
    const lista = porProducto.get(vinculo.productoId) ?? []
    lista.push({
      proveedorId: vinculo.proveedorId,
      proveedorNombre: vinculo.proveedorNombre,
      relacionId: vinculo.relacionId,
      precio: Number.isFinite(precio) ? precio : 0,
    })
    porProducto.set(vinculo.productoId, lista)
  }

  return productos
    .map((producto) => {
      const lista = porProducto.get(producto.id) ?? []
      if (lista.some((v) => v.precio > 0)) return null
      return {
        productoId: producto.id,
        nombre: producto.nombre,
        sku: producto.sku,
        tipo:
          lista.length > 0
            ? ('sin-precio' as const)
            : ('sin-proveedor' as const),
        vinculos: lista,
      }
    })
    .filter((hueco): hueco is HuecoProveedor => hueco !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
