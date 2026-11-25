// Buscador de la lista de requisiciones (Alex, 2026-11-25): filtra
// por folio, cliente o estado, sin acentos y sin importar mayúsculas.
// Puro (sin Supabase ni React) para probarlo con `node --test`.

import { normalizarTexto } from './filtroCotejo.ts'

export type RequisicionBuscable = {
  id: string
  folio: string
  cliente: string
  estado: string
}

export function filtrarRequisiciones(
  requisiciones: RequisicionBuscable[],
  busqueda: string,
): RequisicionBuscable[] {
  const texto = normalizarTexto(busqueda)
  if (!texto) return requisiciones
  return requisiciones.filter((r) =>
    [r.folio, r.cliente, r.estado].some((campo) =>
      normalizarTexto(campo).includes(texto),
    ),
  )
}
