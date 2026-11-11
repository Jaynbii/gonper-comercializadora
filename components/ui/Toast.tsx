'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

// Aviso breve (toast) para confirmar acciones que antes quedaban en
// silencio tras recargar la pagina (surtir, editar o eliminar una
// requisicion). mostrarToast() se llama desde el cliente tras una
// accion exitosa; ToastHost (montado en el layout del panel) pinta
// los avisos con entrada sobria y los quita solos a los 4.5 s.
// El contenedor usa aria-live para que el lector anuncie el aviso.

export type ToastTipo = 'exito' | 'error'

type ToastItem = {
  id: number
  mensaje: string
  tipo: ToastTipo
}

const DURACION_MS = 4500
const MAX_VISIBLES = 3

let siguienteId = 1
const oyentes = new Set<(toast: ToastItem) => void>()

// Muestra un aviso breve en pantalla. Solo se llama desde el cliente
// (manejadores de eventos); el host lo pinta y lo retira a los 4.5 s.
export function mostrarToast(mensaje: string, tipo: ToastTipo = 'exito') {
  const toast: ToastItem = { id: siguienteId++, mensaje, tipo }
  for (const oyente of oyentes) oyente(toast)
}

// Contenedor fijo que pinta los avisos. Se monta una sola vez en el
// layout del panel; al desmontarse deja de escuchar nuevos avisos.
export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const agregar = (toast: ToastItem) => {
      setToasts((actuales) => [...actuales.slice(-(MAX_VISIBLES - 1)), toast])
      window.setTimeout(() => {
        setToasts((actuales) => actuales.filter((t) => t.id !== toast.id))
      }, DURACION_MS)
    }
    oyentes.add(agregar)
    return () => {
      oyentes.delete(agregar)
    }
  }, [])

  const quitar = (id: number) => {
    setToasts((actuales) => actuales.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`toast-in flex w-full max-w-md items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-medium shadow-raise ${
            toast.tipo === 'exito'
              ? 'border-gonper-success-border bg-gonper-success-bg text-gonper-success'
              : 'border-gonper-danger-border bg-gonper-danger-bg text-gonper-danger'
          }`}
        >
          {toast.tipo === 'exito' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          ) : (
            <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={2} />
          )}
          <span className="flex-1">{toast.mensaje}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => quitar(toast.id)}
            className="pointer-events-auto grid h-7 w-7 shrink-0 place-items-center rounded-md transition-transform duration-150 ease-out hover:bg-black/5 active:scale-90"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>
      ))}
    </div>
  )
}
