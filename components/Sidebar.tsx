'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  Factory,
  FileText,
  LayoutDashboard,
  Package,
  ShoppingCart,
} from 'lucide-react'

const MENU = [
  { name: 'Inicio', path: '/', icon: LayoutDashboard },
  { name: 'Inventario', path: '/inventario', icon: Package },
  { name: 'Órdenes', path: '/ordenes', icon: FileText },
  { name: 'Compras', path: '/compras', icon: ShoppingCart },
  { name: 'Proveedores', path: '/proveedores', icon: Factory },
  { name: 'Clientes', path: '/clientes', icon: Building2 },
]

function ScythMark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-scyth-acid text-scyth-graphite"
    >
      <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none">
        <path
          d="M7 23.5 17.5 7h7L14 25h-7Z"
          fill="currentColor"
        />
        <path
          d="M17.5 7 25 7 20.8 13.7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
        />
      </svg>
    </span>
  )
}

export default function Sidebar() {
  const pathname = usePathname()

  const esActivo = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path)

  return (
    <>
      <aside className="hidden w-59 shrink-0 flex-col border-r border-[#303a33] bg-[#171d19] text-white md:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#303a33] px-5">
          <ScythMark />
          <div className="min-w-0">
            <span className="block text-[17px] font-bold leading-none tracking-[0.13em]">
              SCYTH
            </span>
            <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.16em] text-[#aab5aa]">
              Operations platform
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {MENU.map((item) => {
            const activo = esActivo(item.path)
            const Icono = item.icon

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={activo ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors duration-120 ${
                  activo
                    ? 'bg-scyth-acid text-scyth-graphite'
                    : 'text-[#c1cbc1] hover:bg-[#26312a] hover:text-white'
                }`}
              >
                <Icono
                  className="h-4.25 w-4.25"
                  strokeWidth={activo ? 2 : 1.75}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-[#303a33] px-5 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#aab5aa]">
            Work smarter.
            <br />
            Move faster.
          </p>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gonper-border bg-gonper-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid h-16.5 grid-cols-6">
          {MENU.map((item) => {
            const activo = esActivo(item.path)
            const Icono = item.icon

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={activo ? 'page' : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 transition-colors duration-120 ${
                  activo ? 'text-gonper-primary' : 'text-gonper-muted'
                }`}
              >
                <span
                  className={`grid h-6 w-9 place-items-center rounded-full transition-colors duration-120 ${
                    activo ? 'bg-scyth-acid text-scyth-graphite' : ''
                  }`}
                >
                  <Icono
                    className="h-4.25 w-4.25"
                    strokeWidth={activo ? 2.1 : 1.75}
                  />
                </span>
                <span
                  className={`whitespace-nowrap text-[9.5px] leading-none tracking-[-0.01em] ${
                    activo ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {item.name}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
