// El wrapper de transiciones NO va aquí: la guía de Next dice que el
// <ViewTransition> vive en cada page.tsx. En el template nunca se
// desmonta (el Suspense de loading.tsx está dentro), así que enter/exit
// no se disparan y no hay animación. Cada página lo envuelve aparte.
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
