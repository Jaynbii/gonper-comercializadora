import TransicionPagina from '@/components/ui/TransicionPagina'

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode
}) {
  return <TransicionPagina>{children}</TransicionPagina>
}
