// Filtros de Inventario (Gonper).
//
// Código puro, sin Supabase ni Next.js, para poder probarlo con
// `node --test` sin base de datos.
//
// El precio NO se filtra aquí: en Inventario el precio se quitó
// (decisión de Alex, nov 2026) porque el precio lo manda el
// proveedor y en Inventario solo se duplicaba. El precio vive en
// Proveedores (producto_proveedores) y en Compras.

export type FiltroStock = 'todos' | 'bajo' | 'sin' | 'disponible'

export type ProductoInventario = {
  nombre: string
  sku: string
  categoria_id: string | null
  stock_actual: number | string
  stock_minimo: number | string
}

const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * Clasificación de stock, MISMA lógica que `estadoStock()` en
 * InventoryClient.tsx (la que pinta la etiqueta Agotado /
 * Bajo mínimo / Disponible):
 * - Sin stock: stock_actual <= 0.
 * - Bajo stock: 0 < stock_actual <= stock_minimo (el stock en el
 *   mínimo ya es bajo, como muestra la etiqueta).
 * - Disponible: stock_actual > stock_minimo.
 */
export function clasificarStock(
  stockActual: number,
  stockMinimo: number,
): 'sin' | 'bajo' | 'disponible' {
  if (stockActual <= 0) return 'sin'
  if (stockActual <= stockMinimo) return 'bajo'
  return 'disponible'
}

export function filtrarInventario<T extends ProductoInventario>(
  productos: T[],
  filtros: {
    termino?: string
    categoriaId?: string | null
    filtroStock?: FiltroStock
  },
): T[] {
  const termino = normalizar((filtros.termino ?? '').trim())
  const categoriaId = filtros.categoriaId ?? 'todas'
  const filtroStock = filtros.filtroStock ?? 'todos'

  return productos.filter((producto) => {
    if (
      termino &&
      !normalizar(producto.nombre).includes(termino) &&
      !normalizar(producto.sku).includes(termino)
    ) {
      return false
    }

    if (categoriaId !== 'todas' && producto.categoria_id !== categoriaId) {
      return false
    }

    if (filtroStock !== 'todos') {
      const actual = Number(producto.stock_actual) || 0
      const minimo = Number(producto.stock_minimo) || 0
      if (clasificarStock(actual, minimo) !== filtroStock) return false
    }

    return true
  })
}
