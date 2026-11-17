// Código interno Gonper (ARTXXXX) para productos nuevos.
// Función pura: dado el listado de SKUs ART que ya existen, devuelve
// el siguiente. El máximo se calcula NUMÉRICO (no por orden
// alfabético): en texto "ART9" > "ART0010", así que ordenar los SKU
// como texto en la base de datos devuelve el "último" equivocado
// cuando hay códigos con distinto relleno de ceros, y el siguiente
// generado puede chocar con uno que ya existe.

const PREFIJO = 'ART'

export function siguienteSku(skus: (string | null | undefined)[]): string {
  let maximo = 0
  for (const sku of skus) {
    if (typeof sku !== 'string') continue
    // Solo ART + dígitos: "ART-ABC" o "art0001" no cuentan.
    const coincidencia = /^ART(\d+)$/.exec(sku.trim())
    if (!coincidencia) continue
    const numero = parseInt(coincidencia[1], 10)
    if (!isNaN(numero) && numero > maximo) maximo = numero
  }
  return `${PREFIJO}${(maximo + 1).toString().padStart(4, '0')}`
}
