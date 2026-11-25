// Estado de un artículo en el cotejo del detalle de la requisición.
//
// Es código puro, sin Supabase ni Next.js, para poder probarlo con
// `node --test` sin base de datos.
//
// Regla (Alex, 2026-11-24): lo que se muestra se calcula sobre lo que
// QUEDA por surtir — lo solicitado menos lo ya entregado — no sobre
// lo solicitado total. Antes el cotejo comparaba el stock contra lo
// solicitado total y un artículo ya entregado seguía apareciendo con
// faltante y en rojo (REQ-0012, aromatizante 6/6: Faltante 6,
// «Sin stock», aunque la columna Surtido decía 6). Con esta regla
// los números cuadran: surtido + a surtir + faltante = solicitado.

export type EstadoCotejo = 'completo' | 'parcial' | 'sin-stock' | 'sin-surtir'

// Calcula lo que queda por surtir de un artículo, cuánto se puede
// surtir con el stock actual y su estado para la insignia del cotejo.
// Un artículo marcado "Sin surtir" (Alex, 2026-11-25) es solo
// registro: no se surte ni se compra, así que no tiene pendiente,
// ni a surtir, ni faltante.
export function estadoCotejoItem(args: {
  solicitado: number
  surtido?: number | null
  stock?: number | null
  sinSurtir?: boolean
}): {
  pendiente: number
  aSurtir: number
  faltante: number
  estado: EstadoCotejo
} {
  const solicitado = Math.max(0, Number(args.solicitado) || 0)
  const surtido = Math.max(0, Number(args.surtido) || 0)
  const stock = Math.max(0, Number(args.stock) || 0)
  if (args.sinSurtir) {
    return { pendiente: 0, aSurtir: 0, faltante: 0, estado: 'sin-surtir' }
  }
  const pendiente = Math.max(0, solicitado - surtido)
  const aSurtir = Math.min(stock, pendiente)
  const faltante = pendiente - aSurtir
  const estado: EstadoCotejo =
    faltante === 0 ? 'completo' : aSurtir > 0 ? 'parcial' : 'sin-stock'
  return { pendiente, aSurtir, faltante, estado }
}
