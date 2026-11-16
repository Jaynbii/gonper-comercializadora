// Progreso de una requisición: stepper de captura y línea de tiempo
// de su vida (reel @ale.uiux "Progress steps UI", patrones 01 y 02).
// Funciones puras (sin BD ni React) para probarlas sin montar
// componentes: la vista solo dibuja lo que estas devuelven.

export type EstadoPaso = 'completado' | 'actual' | 'pendiente'

export type PasoStepper = {
  etiqueta: string
  estado: EstadoPaso
  cargando: boolean
}

const ETIQUETAS_CAPTURA = ['Subir', 'Leer', 'Revisar', 'Guardar'] as const

// Stepper de captura: 4 pasos fijos. pasoActual es 1..4 (fuera de
// rango se ajusta); cargando marca el paso actual con spinner
// (subiendo, leyendo o guardando).
export function pasosCaptura(
  pasoActual: number,
  cargando = false,
): PasoStepper[] {
  const actual = Math.min(
    Math.max(Math.trunc(pasoActual) || 1, 1),
    ETIQUETAS_CAPTURA.length,
  )
  return ETIQUETAS_CAPTURA.map((etiqueta, i) => {
    const n = i + 1
    return {
      etiqueta,
      estado:
        n < actual ? 'completado' : n === actual ? 'actual' : 'pendiente',
      cargando: cargando && n === actual,
    }
  })
}

export type EstadoLinea = EstadoPaso | 'cancelado'

export type PasoLinea = {
  etiqueta: string
  fechaIso: string | null
  estado: EstadoLinea
}

export type DatosLineaTiempo = {
  estado: string
  creadoEn: string | null
  capturadoEn: string | null
  surtidoEn: string | null
  firmadaEn: string | null
}

// Línea de tiempo de la requisición: Creada → Artículos capturados
// → Surtida → Factura firmada. El paso actual es el primer
// incompleto; los demás quedan pendientes. Una requisición
// cancelada corta la línea: se muestran solo los pasos que sí
// ocurrieron y un paso final "Cancelada".
export function lineaTiempoOrden(datos: DatosLineaTiempo): PasoLinea[] {
  const { estado, creadoEn, capturadoEn, surtidoEn, firmadaEn } = datos
  const cancelada = estado === 'CANCELADA'
  const surtida = estado === 'ENTREGADA' || estado === 'PARCIAL'
  const crudos: { etiqueta: string; fechaIso: string | null; hecho: boolean }[] =
    [
      { etiqueta: 'Creada', fechaIso: creadoEn, hecho: creadoEn !== null },
      {
        etiqueta: 'Artículos capturados',
        fechaIso: capturadoEn,
        hecho: capturadoEn !== null,
      },
      {
        etiqueta:
          estado === 'PARCIAL' ? 'Surtida parcialmente' : 'Surtida',
        fechaIso: surtidoEn,
        hecho: surtida,
      },
      {
        etiqueta: 'Factura firmada',
        fechaIso: firmadaEn,
        hecho: firmadaEn !== null,
      },
    ]
  const lista = cancelada ? crudos.filter((p) => p.hecho) : crudos
  let actualAsignado = false
  const pasos: PasoLinea[] = lista.map((p) => {
    if (p.hecho) {
      return {
        etiqueta: p.etiqueta,
        fechaIso: p.fechaIso,
        estado: 'completado' as const,
      }
    }
    if (!actualAsignado) {
      actualAsignado = true
      return {
        etiqueta: p.etiqueta,
        fechaIso: p.fechaIso,
        estado: 'actual' as const,
      }
    }
    return {
      etiqueta: p.etiqueta,
      fechaIso: p.fechaIso,
      estado: 'pendiente' as const,
    }
  })
  if (cancelada) {
    pasos.push({
      etiqueta: 'Cancelada',
      fechaIso: null,
      estado: 'cancelado',
    })
  }
  return pasos
}
