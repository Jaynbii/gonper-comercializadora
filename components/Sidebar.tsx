'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Building2,
  Factory,
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  ShoppingCart,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'

const MENU = [
  { name: 'Inicio', path: '/', icon: LayoutDashboard },
  { name: 'Inventario', path: '/inventario', icon: Package },
  { name: 'Órdenes', path: '/ordenes', icon: FileText },
  { name: 'Compras', path: '/compras', icon: ShoppingCart },
  { name: 'Proveedores', path: '/proveedores', icon: Factory },
  { name: 'Clientes', path: '/clientes', icon: Building2 },
]

const MOVIL = ['/', '/ordenes', '/inventario', '/compras']
const EN_MAS = ['/proveedores', '/clientes']

export default function Sidebar() {
  const pathname = usePathname()
  const [masAbierto, setMasAbierto] = useState(false)

  const esActivo = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path)

  const secundarios = MENU.filter((item) => EN_MAS.includes(item.path))

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
                className={`relative flex items-center gap-3 rounded-[6px] px-3 py-2 text-[13px] font-medium transition-colors duration-[120ms] ${
                  activo
                    ? 'bg-gonper-surface-muted text-gonper-text'
                    : 'text-gonper-muted hover:bg-gonper-hover hover:text-gonper-text'
                }`}
              >
                {activo && (
                  <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-gonper-primary" />
                )}
                <Icono
                  className={`h-[17px] w-[17px] ${
                    activo ? 'text-gonper-primary' : 'text-gonper-muted'
                  }`}
                  strokeWidth={1.75}
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
        <div className="flex h-16 items-stretch">
          {MENU.filter((item) => MOVIL.includes(item.path)).map((item) => {
            const activo = esActivo(item.path)
            const Icono = item.icon

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={activo ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-[120ms] ${
                  activo ? 'text-gonper-primary' : 'text-gonper-muted'
                }`}
              >
                <Icono className="h-[19px] w-[19px]" strokeWidth={1.75} />
                <span className="text-[10px] font-medium">{item.name}</span>
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setMasAbierto(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-gonper-muted transition-colors duration-[120ms]"
          >
            <MoreHorizontal className="h-[19px] w-[19px]" strokeWidth={1.75} />
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      <Modal
        open={masAbierto}
        onClose={() => setMasAbierto(false)}
        title="Más secciones"
        variant="sheet"
      >
        <div className="p-2 pb-4">
          {secundarios.map((item) => {
            const Icono = item.icon

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMasAbierto(false)}
                className="flex items-center gap-3 rounded-[6px] px-3 py-3 text-[14px] font-medium text-gonper-text transition-colors hover:bg-gonper-surface-muted"
              >
                <Icono
                  className="h-[18px] w-[18px] text-gonper-muted"
                  strokeWidth={1.75}
                />
                {item.name}
              </Link>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
