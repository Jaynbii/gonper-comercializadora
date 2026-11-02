import { createClient } from '@/utils/supabase/server'
import InventoryClient from './InventoryClient'

export default async function InventarioPage() {
  const supabase = await createClient()

  // 1. Traemos los productos con su categoría
  const { data: productos, error } = await supabase
    .from('productos')
    .select(`*, categorias (nombre)`)
    .order('nombre', { ascending: true })

  // 2. Traemos todas las categorías para el select
  const { data: categorias } = await supabase
    .from('categorias')
    .select('id, nombre')
    .order('nombre', { ascending: true })

  if (error) {
    return <div className="p-8 text-red-500">Error al cargar el inventario</div>
  }

  return (
    <InventoryClient 
      productosIniciales={productos || []} 
      categorias={categorias || []} 
    />
  )
}