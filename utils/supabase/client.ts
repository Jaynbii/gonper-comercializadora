import { createBrowserClient } from '@supabase/ssr'

// Cliente de Supabase para el navegador (componentes cliente), con la URL pública y la anon key del proyecto.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}