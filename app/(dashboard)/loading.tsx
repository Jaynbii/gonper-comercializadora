// Pantalla de carga del panel: esqueleto sobrio mientras llega la
// ruta (Next la muestra al instante al navegar). Solo bloques con
// el brillo .skeleton; sin datos ni logica.
export default function LoadingPanel() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando"
      className="mx-auto w-full max-w-5xl"
    >
      <div className="skeleton h-8 w-44 rounded-lg" />
      <div className="skeleton mt-2 h-4 w-64 rounded" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card p-4">
            <div className="skeleton h-4 w-2/3 rounded" />
            <div className="skeleton mt-3 h-3 w-1/2 rounded" />
            <div className="skeleton mt-2 h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
