export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="animate-page">{children}</div>
}
