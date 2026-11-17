'use client'

import { useState, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * Sello de "SURTIDA" para la tabla de cotejo (Alex, 2026-11-17).
 *
 * Cuando la requisición está entregada Y firmada, la tabla se ve
 * sellada: marca de agua SURTIDA en diagonal y contenido difuminado,
 * para que a simple vista no parezca pendiente. Con un tap en la
 * tabla o en el botón "Ver detalle" se quita el sello y se ve qué
 * se entregó; otro tap (o "Ocultar detalle") lo vuelve a poner.
 * El sello es solo visual: no esconde los datos de verdad y no
 * cambia nada del candado de borrado.
 */
export default function CotejoSurtido({
  surtida,
  children,
}: {
  surtida: boolean
  children: ReactNode
}) {
  const [revelado, setRevelado] = useState(false)

  // Sin sello: la tabla se ve igual que siempre.
  if (!surtida) return <>{children}</>

  const alternar = () => setRevelado((v) => !v)

  return (
    <div className="relative cursor-pointer" onClick={alternar}>
      <div
        className={
          revelado
            ? ''
            : 'pointer-events-none select-none blur-[2px] opacity-60 transition-all duration-200'
        }
      >
        {children}
      </div>

      {!revelado && (
        <>
          {/* Marca de agua: la palabra se repite en diagonal a lo
              largo de la tabla. Solo decorativa (aria-hidden). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-evenly overflow-hidden"
          >
            {['SURTIDA', 'SURTIDA', 'SURTIDA'].map((texto, i) => (
              <span
                key={i}
                className="rotate-[-18deg] whitespace-nowrap text-[38px] font-extrabold uppercase tracking-[0.22em] text-gonper-success opacity-[0.16] sm:text-[52px]"
              >
                {texto}
              </span>
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              aria-expanded={false}
              onClick={(e) => {
                e.stopPropagation()
                alternar()
              }}
              className="btn btn-primary"
            >
              <Eye className="h-4 w-4" strokeWidth={1.75} />
              Ver detalle
            </button>
          </div>
        </>
      )}

      {revelado && (
        <div className="flex justify-end border-t border-gonper-border px-4 py-2.5">
          <button
            type="button"
            aria-expanded={true}
            onClick={(e) => {
              e.stopPropagation()
              alternar()
            }}
            className="btn btn-quiet h-9 px-3 text-[12.5px]"
          >
            <EyeOff className="h-4 w-4" strokeWidth={1.75} />
            Ocultar detalle
          </button>
        </div>
      )}
    </div>
  )
}
