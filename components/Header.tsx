'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

const SECCIONES: Record<string, string> = {
  '': 'Inicio',
  inventario: 'Inventario',
  ordenes: 'Requisiciones',
  compras: 'Compras',
  proveedores: 'Proveedores',
  clientes: 'Clientes',
}

export default function Header({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const [abierto, setAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const seccion = SECCIONES[pathname.split('/')[1] ?? ''] ?? 'Gonper'
  const inicial = userEmail.charAt(0).toUpperCase()

  useEffect(() => {
    if (!abierto) return

    const alSeñalar = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setAbierto(false)
      }
    }

    const alTeclear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('pointerdown', alSeñalar)
    document.addEventListener('keydown', alTeclear)

    return () => {
      document.removeEventListener('pointerdown', alSeñalar)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  const cerrarSesion = async () => {
    setAbierto(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gonper-border bg-gonper-surface px-5 md:px-8">
      <p className="text-[12.5px] font-medium text-gonper-muted">{seccion}</p>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setAbierto((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={abierto}
          className="flex h-10 items-center gap-2.5 rounded-[6px] pl-1 pr-2 transition-colors duration-[120ms] hover:bg-gonper-surface-muted"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gonper-surface-muted text-[11px] font-semibold text-gonper-text">
            {inicial}
          </span>
          <span className="hidden max-w-[190px] truncate text-[12.5px] text-gonper-muted sm:block">
            {userEmail}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-gonper-muted transition-transform duration-200 ${
              abierto ? 'rotate-180' : ''
            }`}
            strokeWidth={1.75}
          />
        </button>

        {abierto && (
          <div
            role="menu"
            className="animate-menu absolute right-0 top-full z-50 mt-2 w-60 rounded-[8px] border border-gonper-border bg-gonper-surface p-1 shadow-[0_18px_44px_-14px_rgba(27,26,24,0.24)]"
          >
            <div className="px-2.5 py-2">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-gonper-muted">
                Sesión
              </p>
              <p className="mt-1 truncate text-[12.5px] text-gonper-text">
                {userEmail}
              </p>
            </div>

            <div className="my-1 h-px bg-gonper-border" />

            <button
              type="button"
              role="menuitem"
              onClick={cerrarSesion}
              className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-gonper-text transition-colors duration-[120ms] hover:bg-gonper-surface-muted"
            >
              <LogOut
                className="h-4 w-4 text-gonper-muted"
                strokeWidth={1.75}
              />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
