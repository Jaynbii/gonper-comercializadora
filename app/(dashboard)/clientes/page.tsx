import { createClient } from '@/utils/supabase/server'
import ClientesClient from './ClientesClient'
import TransicionPagina from '@/components/ui/TransicionPagina'

export default async function ClientesPage() {
  const supabase = await createClient()
  
  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) {
    return <div className="p-8 text-red-500">Error al cargar clientes</div>
  }

  return (
    <TransicionPagina>
      <ClientesClient clientesIniciales={clientes || []} />
    </TransicionPagina>
  )
}