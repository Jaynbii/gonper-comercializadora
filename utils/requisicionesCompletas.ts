// Reglas de "requisición completa" y de protección contra borrado.
//
// Una requisición está COMPLETA cuando está entregada Y tiene la foto
// firmada y sellada (definición de Alex, 2026-11-17: solo así cuenta
// como completa en el dashboard).
//
// La PROTECCIÓN es más amplia a propósito: basta con que tenga la foto
// firmada para no poder borrarse, aunque alguien cambie su estado
// después desde "Gestionar". La firma es la evidencia de entrega y el
// candado no se debe poder abrir cambiando el estado.

export function esRequisicionCompleta(orden: {
  estado: string
  facturaFirmadaPath: string | null
}): boolean {
  return orden.estado === 'ENTREGADA' && orden.facturaFirmadaPath !== null
}

export function esRequisicionProtegida(orden: {
  facturaFirmadaPath: string | null
}): boolean {
  return orden.facturaFirmadaPath !== null
}
