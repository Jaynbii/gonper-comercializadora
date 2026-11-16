// Stepper horizontal (reel @ale.uiux "Progress steps UI", patrón 01):
// muestra en qué paso va la captura de una requisición: Subir,
// Leer, Revisar, Guardar. Los pasos se calculan con pasosCaptura()
// (utils/progresoRequisicion.ts); este componente solo los dibuja.
// Sobrio: círculos de 28 px, línea fina, sin animación.
import { Check, Loader2 } from 'lucide-react'
import type { PasoStepper } from '@/utils/progresoRequisicion'

export default function Stepper({ pasos }: { pasos: PasoStepper[] }) {
  return (
    <ol aria-label="Progreso de la requisición" className="flex w-full">
      {pasos.map((paso, i) => {
        const ultimo = i === pasos.length - 1
        const completado = paso.estado === 'completado'
        const actual = paso.estado === 'actual'
        return (
          <li
            key={paso.etiqueta}
            aria-current={actual ? 'step' : undefined}
            className={ultimo ? 'flex-none' : 'flex-1'}
          >
            <div className="flex items-center">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${
                  completado || actual
                    ? 'bg-gonper-primary text-gonper-on-primary'
                    : 'border border-gonper-border bg-gonper-surface text-gonper-muted'
                } ${actual ? 'ring-2 ring-gonper-primary/40 ring-offset-2 ring-offset-gonper-surface' : ''}`}
              >
                {paso.cargando ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={2}
                    aria-label="Cargando"
                  />
                ) : completado ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  i + 1
                )}
              </span>
              {!ultimo && (
                <span
                  aria-hidden
                  className={`h-0.5 flex-1 ${
                    completado ? 'bg-gonper-primary' : 'bg-gonper-border'
                  }`}
                />
              )}
            </div>
            <span
              className={`mt-1.5 block text-center text-[11.5px] leading-tight ${
                actual
                  ? 'font-semibold text-gonper-text'
                  : 'text-gonper-muted'
              }`}
            >
              {paso.etiqueta}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
