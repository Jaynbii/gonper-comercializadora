// Pantalla de carga del panel: esqueleto sobrio mientras llega la
// ruta (Next la muestra al instante al navegar). Solo bloques con
// el brillo .skeleton; sin datos ni logica. El esqueleto lleva su
// propia transición de salida (cargando-out): al resolverse los
// datos baja 10 px y se desvanece mientras entra el contenido real
// (paso 2 de la guía de Next, Suspense reveals).
import { ViewTransition } from 'react'

export default function LoadingPanel() {
  return (
    <ViewTransition exit="cargando-out" default="none">
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
    </ViewTransition>
  )
}
