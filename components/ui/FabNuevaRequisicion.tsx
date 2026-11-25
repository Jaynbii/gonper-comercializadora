// Botón flotante global para subir una requisición (Alex,
// 2026-11-25): vive en el layout del dashboard, así aparece en todas
// las pantallas, no solo en Requisiciones.
// - Se esconde en /ordenes/nueva, que es a donde lleva.
// - Se esconde en /clientes y /proveedores (Alex, 2026-11-25): esas
//   pantallas ya tienen su propio botón flotante ("Nuevo cliente" /
//   "Nuevo proveedor") y el de requisiciones ahí solo estorbaba.
'use client'

import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import Fab from './Fab'

const OCULTAS = ['/ordenes/nueva', '/clientes', '/proveedores']

export default function FabNuevaRequisicion() {
  const pathname = usePathname()
  if (OCULTAS.some((r) => pathname === r || pathname.startsWith(r + '/')))
    return null
  return (
    <Fab
      href="/ordenes/nueva"
      transitionTypes={['nav-zoom']}
      label="Subir requisición"
      icon={<Plus className="h-6 w-6" strokeWidth={2} />}
      visibleEnEscritorio
    />
  )
}
