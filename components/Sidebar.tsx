'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const menuItems = [
  { name: 'Inicio', path: '/', icon: '📊' },
  { name: 'Inventario', path: '/inventario', icon: '📦' },
  { name: 'Órdenes', path: '/ordenes', icon: '📄' },
  { name: 'Proveedores', path: '/proveedores', icon: '🏭' },
  { name: 'Clientes', path: '/clientes', icon: '🏢' }, 
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      <aside className="hidden md:flex w-64 bg-gonper-surface border-r border-gonper-border h-screen flex-col">
        <div className="p-6 border-b border-gonper-border">
          <h1 className="text-xl font-bold text-gonper-text">Gonper</h1>
          <p className="text-xs text-gonper-muted mt-1">Comercializadora</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = pathname === item.path
            return (
              <Link key={item.path} href={item.path} className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-gonper-primary/10 text-gonper-primary font-semibold' : 'text-gonper-muted hover:bg-gonper-bg hover:text-gonper-text'}`}>
                <span>{item.icon}</span>{item.name}
              </Link>
            )
          })}
        </nav>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gonper-surface border-t border-gonper-border flex justify-around items-center h-16 z-50 pb-safe">
        {menuItems.map((item) => {
          const isActive = pathname === item.path
          return (
            <Link key={item.path} href={item.path} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-gonper-primary' : 'text-gonper-muted'}`}>
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}