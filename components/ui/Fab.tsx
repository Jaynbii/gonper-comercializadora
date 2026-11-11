'use client'

import Link from 'next/link'
import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const CLASES =
  'animate-fab fixed right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-gonper-primary text-gonper-on-primary shadow-[0_12px_28px_-8px_rgba(123,182,1,0.5)] transition-[background-color,transform] duration-[140ms] ease-out hover:bg-gonper-primary-hover active:scale-95 md:hidden'

const ESTILO = {
  bottom: 'calc(66px + env(safe-area-inset-bottom) + 1rem)',
}

export default function Fab({
  label,
  onClick,
  href,
  icon,
}: {
  label: string
  onClick?: () => void
  href?: string
  icon?: ReactNode
}) {
  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  if (!montado) return null

  return createPortal(
    href ? (
      <Link
        href={href}
        aria-label={label}
        title={label}
        style={ESTILO}
        className={CLASES}
      >
        {icon}
      </Link>
    ) : (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        style={ESTILO}
        className={CLASES}
      >
        {icon}
      </button>
    ),
    document.body,
  )
}
