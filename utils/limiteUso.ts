// Limite de uso por ventana para acciones costosas del servidor
// (p. ej. la lectura de fotos con Gemini): ventana deslizante simple
// por clave (usuario). En serverless el estado vive en memoria por
// instancia, asi que es un freno suave contra bucles y doble envio,
// no un control global exacto; la cuota diaria de la API sigue
// puesta por el proveedor.

// Crea un limitador: permite hasta maxPorVentana llamadas por clave
// dentro de ventanaMs milisegundos; al excederlo devuelve false
// hasta que las llamadas viejas salgan de la ventana.
export type LimiteUso = {
  permitir: (clave: string, ahoraMs: number) => boolean
}

export function crearLimiteUso(
  maxPorVentana: number,
  ventanaMs: number,
): LimiteUso {
  const registro = new Map<string, number[]>()
  return {
    permitir(clave, ahoraMs) {
      const desde = ahoraMs - ventanaMs
      const vigentes = (registro.get(clave) ?? []).filter((t) => t > desde)
      if (vigentes.length >= maxPorVentana) {
        registro.set(clave, vigentes)
        return false
      }
      vigentes.push(ahoraMs)
      registro.set(clave, vigentes)
      return true
    },
  }
}
