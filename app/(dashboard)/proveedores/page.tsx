import { createClient } from '@/utils/supabase/server'
import ProveedoresClient from './ProveedoresClient'

type Relacion<T> = T | T[] | null

type ProductoBase = { id: string; nombre: string; sku: string }

type RelacionCruda = {
  id: string
  precio_unitario: number | string
  productos: Relacion<ProductoBase>
}

type ProveedorCrudo = {
  id: string
  nombre: string
  telefono: string | null
  correo: string | null
  producto_proveedores: RelacionCruda[] | null
}

export default async function ProveedoresPage() {
  const supabase = await createClient()
  
  const { data: proveedores, error } = await supabase
    .from('proveedores')
    .select(`
      id, nombre, telefono, correo,
      producto_proveedores (
        id, precio_unitario,
        productos (id, nombre, sku)
      )
    `)
    .order('nombre', { ascending: true })

  const { data: catalogoProductos, error: errorProductos } = await supabase
    .from('productos')
    .select('id, nombre, sku')
    .order('nombre', { ascending: true })

  if (error || errorProductos) {
    return (
      <div className="mx-auto max-w-[1180px] pb-6">
        <div className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-4 py-3 text-[13px] text-gonper-danger">
          <p className="font-semibold">No se pudo cargar el directorio.</p>
          <p className="mt-1 text-[12.5px]">
            {error?.message || errorProductos?.message}
          </p>
        </div>
      </div>
    )
  }

  return <ProveedoresClient proveedoresIniciales={normalizarProveedores(proveedores)} catalogoProductos={catalogoProductos || []} />
}

// Supabase devuelve la relación uno-a-uno como arreglo cuando no hay tipos
// generados. El cliente espera un solo producto por relación.
function normalizarProveedores(proveedores: ProveedorCrudo[] | null) {
  return (proveedores || []).map((proveedor) => ({
    ...proveedor,
    producto_proveedores: (proveedor.producto_proveedores || []).map(
      (relacion) => ({
        ...relacion,
        productos: Array.isArray(relacion.productos)
          ? relacion.productos[0] ?? null
          : relacion.productos,
      }),
    ),
  }))
}