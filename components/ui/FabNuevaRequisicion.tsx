// Botón flotante global para subir una requisición (Alex,
// 2026-11-25): vive en el layout del dashboard, así aparece en todas
// las pantallas, no solo en Requisiciones.
// - Se esconde en /ordenes/nueva, que es a donde lleva.
// - Sube 72 px en Clientes y Proveedores, que ya tienen su propio
//   botón flotante ("Nuevo cliente" / "Nuevo proveedor"): los dos
//   quedan apilados en vez de taparse.
'use client'

import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import Fab from './Fab'

export default function FabNuevaRequisicion() {
  const pathname = usePathname()
  if (pathname === '/ordenes/nueva') return null
  const desplazamiento =
    pathname === '/clientes' || pathname === '/proveedores' ? 72 : 0
  return (
    <Fab
      href="/ordenes/nueva"
      transitionTypes={['nav-zoom']}
      label="Subir requisición"
      icon={<Plus className="h-6 w-6" strokeWidth={2} />}
      desplazamiento={desplazamiento}
      visibleEnEscritorio
    />
  )
}
