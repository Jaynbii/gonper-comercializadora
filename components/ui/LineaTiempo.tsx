// Línea de tiempo vertical (reel @ale.uiux "Progress steps UI",
// patrón 02): la vida de una requisición — Creada, Artículos
// capturados, Surtida, Factura firmada. Los pasos se calculan con
// lineaTiempoOrden() (utils/progresoRequisicion.ts); este componente
// solo los dibuja, con la fecha en el mismo formato largo del
// encabezado del detalle.
import { Check, X } from 'lucide-react'
import type { PasoLinea } from '@/utils/progresoRequisicion'

const fechaLinea = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
})

export default function LineaTiempo({ pasos }: { pasos: PasoLinea[] }) {
  return (
    <ol aria-label="Progreso de la requisición">
      {pasos.map((paso, i) => {
        const ultimo = i === pasos.length - 1
        const completado = paso.estado === 'completado'
        const actual = paso.estado === 'actual'
        const cancelado = paso.estado === 'cancelado'
        return (
          <li
            key={paso.etiqueta}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {!ultimo && (
              <span
                aria-hidden
                className="absolute bottom-0 left-[9px] top-5 w-0.5 bg-gonper-border"
              />
            )}
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                completado
                  ? 'bg-gonper-primary text-gonper-on-primary'
                  : actual
                    ? 'border-2 border-gonper-primary bg-gonper-surface'
                    : cancelado
                      ? 'bg-gonper-danger text-white'
                      : 'border border-gonper-border bg-gonper-surface'
              }`}
            >
              {completado ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : actual ? (
                <span className="h-2 w-2 rounded-full bg-gonper-primary" />
              ) : cancelado ? (
                <X className="h-3 w-3" strokeWidth={3} />
              ) : null}
            </span>
            <div className="min-w-0 pt-px">
              <p
                className={`text-[13.5px] leading-snug ${
                  actual
                    ? 'font-semibold text-gonper-text'
                    : 'font-medium text-gonper-text'
                }`}
              >
                {paso.etiqueta}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-gonper-muted">
                {paso.fechaIso
                  ? fechaLinea.format(new Date(paso.fechaIso))
                  : actual
                    ? 'Pendiente'
                    : cancelado
                      ? 'La requisición no sigue avanzando'
                      : ''}
              </p>
              {paso.detalle && paso.detalle.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {paso.detalle.map((linea) => (
                    <li
                      key={linea}
                      className="text-[12px] leading-snug text-gonper-muted"
                    >
                      {linea}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
