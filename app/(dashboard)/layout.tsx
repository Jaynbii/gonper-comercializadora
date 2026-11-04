import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-dvh bg-gonper-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header userEmail={user.email || 'Usuario'} />
        <main className="flex-1 overflow-y-auto px-5 pb-28 pt-6 md:px-8 md:pb-10 md:pt-8">
          {children}
        </main>
      </div>
    </div>
  )
}
