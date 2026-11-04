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

export default function Sidebar() {
  const pathname = usePathname()

  const esActivo = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path)

  return (
    <>
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-gonper-border bg-gonper-surface md:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-gonper-border px-5">
          <span className="font-serif text-[24px] leading-none tracking-[-0.01em]">
            Gonper
          </span>
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
                className={`flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[13px] font-medium transition-colors duration-[120ms] ${
                  activo
                    ? 'bg-gonper-primary text-white'
                    : 'text-gonper-muted hover:bg-gonper-hover hover:text-gonper-text'
                }`}
              >
                <Icono
                  className={`h-[17px] w-[17px] ${
                    activo ? 'text-white' : 'text-gonper-muted'
                  }`}
                  strokeWidth={activo ? 2 : 1.75}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-gonper-border px-5 py-4">
          <p className="text-[11px] leading-relaxed text-gonper-muted">
            Comercializadora
            <br />
            Sistema interno
          </p>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gonper-border bg-gonper-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid h-[66px] grid-cols-6">
          {MENU.map((item) => {
            const activo = esActivo(item.path)
            const Icono = item.icon

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={activo ? 'page' : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 transition-colors duration-[120ms] ${
                  activo ? 'text-gonper-primary' : 'text-gonper-muted'
                }`}
              >
                <span
                  className={`grid h-6 w-9 place-items-center rounded-full transition-colors duration-[120ms] ${
                    activo ? 'bg-gonper-primary text-white' : ''
                  }`}
                >
                  <Icono
                    className="h-[17px] w-[17px]"
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
