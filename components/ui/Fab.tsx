'use client'

import Link from 'next/link'
import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const CLASES_BASE =
  'animate-fab fixed right-5 z-50 grid h-14 w-14 place-items-center rounded-full border-2 border-gonper-success bg-gonper-primary text-gonper-on-primary shadow-[0_12px_28px_-8px_rgba(123,182,1,0.5)] transition-[background-color,transform] duration-[140ms] ease-out hover:bg-gonper-primary-hover active:scale-95'

export default function Fab({
  label,
  onClick,
  href,
  icon,
  transitionTypes,
  desplazamiento = 0,
  visibleEnEscritorio = false,
}: {
  label: string
  onClick?: () => void
  href?: string
  icon?: ReactNode
  // Tipo de transición de página al navegar con href (ver
  // TransicionPagina). Sin él, el Link navega con el fundido
  // por defecto. Los Fab con onClick (abren un modal) no navegan.
  transitionTypes?: string[]
  // Píxeles extra sobre la posición base: para apilar un segundo
  // botón flotante encima del de la página (ej. el global de
  // requisiciones sobre el de "Nuevo cliente").
  desplazamiento?: number
  // Por defecto el botón solo existe en móvil (md:hidden); en
  // escritorio cada página tiene su propio botón en el encabezado.
  // El botón global de requisiciones lo pone en true porque vive en
  // todas las pantallas, también en escritorio.
  visibleEnEscritorio?: boolean
}) {
  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  if (!montado) return null

  // La base (66 px + safe-area + 1 rem) libra la barra inferior de
  // navegación en móvil; el desplazamiento apila otro botón encima.
  const estilo = {
    bottom: `calc(66px + env(safe-area-inset-bottom) + 1rem + ${desplazamiento}px)`,
  }
  const clases = `${CLASES_BASE}${visibleEnEscritorio ? '' : ' md:hidden'}`

  return createPortal(
    href ? (
      <Link
        href={href}
        transitionTypes={transitionTypes}
        aria-label={label}
        title={label}
        style={estilo}
        className={clases}
      >
        {icon}
      </Link>
    ) : (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        style={estilo}
        className={clases}
      >
        {icon}
      </button>
    ),
    document.body,
  )
}
