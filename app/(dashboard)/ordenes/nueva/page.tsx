import { createClient } from '@/utils/supabase/server'
import UploadClient from './UploadClient'
import TransicionPagina from '@/components/ui/TransicionPagina'

export default async function NuevaOrdenPage() {
  const supabase = await createClient()

  // Traemos los clientes para el selector
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .order('nombre')

  return (
    <TransicionPagina>
      <UploadClient clientes={clientes || []} />
    </TransicionPagina>
  )
}