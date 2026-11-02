'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function Header({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="h-16 bg-gonper-surface border-b border-gonper-border flex items-center justify-between px-8">
      <div className="text-sm text-gonper-muted">
        Sistema de Gestión de Inventario
      </div>
      
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gonper-text">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
        >
          Cerrar Sesión
        </button>
      </div>
    </header>
  )
}