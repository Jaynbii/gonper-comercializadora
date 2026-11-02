import { createClient } from '@/utils/supabase/server'
import ProveedoresClient from './ProveedoresClient'

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

  // 👇 ESTO ES LO NUEVO: Mostrar el error exacto en pantalla
  if (error || errorProductos) {
    return (
      <div className="p-8 text-red-600 bg-red-50 rounded-lg border border-red-200 m-8">
        <h2 className="font-bold text-lg mb-2">Error de Base de Datos</h2>
        <p>{error?.message || errorProductos?.message}</p>
        <p className="text-sm mt-4">Revisa que hayas ejecutado el SQL de la tabla 'producto_proveedores'</p>
      </div>
    )
  }

  return <ProveedoresClient proveedoresIniciales={proveedores || []} catalogoProductos={catalogoProductos || []} />
}