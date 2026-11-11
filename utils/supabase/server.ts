import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SupabaseClient } from '@supabase/supabase-js'

// Cliente de Supabase para Server Components y acciones de servidor; lee y escribe la sesión en las cookies de la petición.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // El método `setAll` se llamó desde un Server Component.
            // Se puede ignorar si tienes un middleware refrescando las sesiones.
          }
        },
      },
    }
  )
}

/**
 * ¿El usuario actual es admin?
 *
 * Vía principal: la función Postgres `public.is_admin()` (SECURITY
 * DEFINER, lee `perfiles.rol = 'admin'` con el auth.uid() de la
 * sesión). Respaldo: leer el propio perfil en `perfiles` (la RLS
 * "Usuarios ven su propio perfil" lo permite). Si no se puede
 * comprobar de ninguna forma, se devuelve false: nunca se concede
 * admin por defecto. La RLS de la tabla afectada es la que manda al
 * final (p. ej. "Admin modifica ordenes_compra" FOR ALL).
 */
export async function esUsuarioAdmin(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (!error && typeof data === 'boolean') return data

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()
    return (perfil as { rol?: string } | null)?.rol === 'admin'
  } catch {
    return false
  }
}

/**
 * Genera el siguiente SKU secuencial para un producto nuevo.
 * Ejemplo: Si el último es ART0015, devolverá ART0016.
 */
export async function generarNuevoSku(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('productos')
    .select('sku')
    .like('sku', 'ART%')
    .order('sku', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    return 'ART0001' // Si el inventario está vacío o no hay códigos ART, empezamos en 1
  }

  const ultimoSku = data[0].sku
  const numero = parseInt(ultimoSku.replace('ART', ''), 10)
  
  // Validación por si alguien metió un SKU raro como "ART-ABC"
  if (isNaN(numero)) return 'ART0001'

  const siguienteNumero = numero + 1
  return `ART${siguienteNumero.toString().padStart(4, '0')}`
}