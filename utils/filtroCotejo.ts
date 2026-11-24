// Filtros por artículo del cotejo del detalle de la requisición
// (Alex, 2026-11-24): buscador por nombre o SKU + filtros por estado.
// Es código puro, sin Supabase ni React, para probarlo con
// `node --test` sin montar componentes: la vista solo dibuja lo que
// esto devuelve.

import type { EstadoCotejo } from './cotejoRequisicion.ts'

// Una fila del cotejo, ya con el estado calculado (ver
// `estadoCotejoItem` en cotejoRequisicion.ts). La página del detalle
// la arma en el servidor y se la pasa al componente cliente.
export type FilaCotejo = {
  id: string
  nombre: string
  sku: string
  unidad: string
  solicitado: number
  stock: number
  surtido: number
  aSurtir: number
  faltante: number
  estado: EstadoCotejo
}

export type FiltroCotejo =
  | 'todos'
  | 'sin-stock'
  | 'parcial'
  | 'completo'
  | 'surtidos'

export const FILTROS_COTEJO: { id: FiltroCotejo; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'sin-stock', etiqueta: 'Sin stock' },
  { id: 'parcial', etiqueta: 'Parcial' },
  { id: 'completo', etiqueta: 'Completo' },
  { id: 'surtidos', etiqueta: 'Surtidos' },
]

// Normaliza para buscar sin importar mayúsculas ni acentos: "jabon"
// encuentra "Jabón", "ART0022" encuentra "art0022".
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// Filtra las filas del cotejo por texto (nombre o SKU) y por estado.
// El filtro "Surtidos" muestra solo los artículos con algo entregado.
export function filtrarCotejo(
  filas: FilaCotejo[],
  busqueda: string,
  filtro: FiltroCotejo,
): FilaCotejo[] {
  const texto = normalizarTexto(busqueda)
  return filas.filter((fila) => {
    if (texto !== '') {
      const nombre = normalizarTexto(fila.nombre)
      const sku = normalizarTexto(fila.sku)
      if (!nombre.includes(texto) && !sku.includes(texto)) return false
    }
    switch (filtro) {
      case 'todos':
        return true
      case 'sin-stock':
        return fila.estado === 'sin-stock'
      case 'parcial':
        return fila.estado === 'parcial'
      case 'completo':
        return fila.estado === 'completo'
      case 'surtidos':
        return fila.surtido > 0
    }
  })
}
