import { createClient } from '@/utils/supabase/server'
import UploadClient from './UploadClient'

export default async function NuevaOrdenPage() {
  const supabase = await createClient()

  // Traemos los clientes para el selector
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .order('nombre')

  return <UploadClient clientes={clientes || []} />
}