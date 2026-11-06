// Folio de requisición (Gonper, Fase 1b).
//
// Código puro, sin Supabase ni Next.js, para poder probarlo con
// `node --test` sin base de datos.
//
// Reglas de negocio (no cambiar sin acordarlo con Alex):
// - Las requisiciones llevan folio REQ-0001, REQ-0002, REQ-0003...
//   en orden de creación, con CONSECUTIVO GLOBAL (no por día):
//   un número nunca se repite. El formato anterior con fecha
//   (REQ-YYMMDD-001) se descartó porque el 001 se repetía cada día.
// - El folio viejo ORD-<6 dígitos> (últimos dígitos del timestamp)
//   era confuso y no era consecutivo; las requisiciones viejas
//   conservan su folio hasta que se corra la migración
//   supabase/migrations/20261106000000_renombrar_folios_requisiciones_viejas.sql,
//   que las renombra en orden de created_at: ORD-786179 -> REQ-0001,
//   ORD-699996 -> REQ-0002.

export function generarFolioRequisicion(consecutivo: number): string {
  return `REQ-${String(consecutivo).padStart(4, '0')}`
}

// Dado los folios REQ-... ya existentes, devuelve el siguiente
// consecutivo global (el máximo sufijo numérico + 1, o 1 si no hay
// ninguno). Los folios viejos ORD-... y las órdenes COM-... se ignoran.
export function siguienteConsecutivo(folios: string[]): number {
  let max = 0
  for (const folio of folios) {
    const match = /^REQ-(\d+)$/.exec(folio.trim())
    if (!match) continue
    max = Math.max(max, Number(match[1]))
  }
  return max + 1
}
