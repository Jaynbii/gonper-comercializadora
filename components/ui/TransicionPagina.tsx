// Transiciones de página (del reel de @ale.uiux: 8 formas de moverse
// entre pantallas). Usa el <ViewTransition> nativo de React 19.3 /
// Next 16: sin librerías extra. Cada navegación lleva un tipo y el
// CSS de globals.css decide cómo se anima:
// - nav-forward: deslizar al entrar a un detalle.
// - nav-back: deslizar de regreso a la lista.
// - nav-section: fundido calmado entre secciones (Sidebar, Inicio).
// - nav-zoom: acercamiento suave al abrir un formulario nuevo.
// - sin tipo (atrás del navegador, refresh): fundido por defecto.
// El elemento compartido (folio lista → detalle) se marca aparte
// con <ViewTransition name={`req-${id}`}> y hace morph solo.
// Además, anidado dentro, va el reveal del Cargando (paso 2 de la
// guía): cuando los datos resuelven y la página monta, el contenido
// entra con cargando-in (sube 10 px + fundido) mientras el esqueleto
// de loading.tsx sale con cargando-out. Los dos enters se componen:
// el de navegación da la dirección (slide 60 px) y el reveal da la
// llegada suave. Sin el reveal, el contenido aparecía de golpe tras
// el esqueleto. El morph del folio sigue sin poder verse: el folio
// no existe en el esqueleto, así que no hay con qué emparejarlo.
import { ViewTransition, type ReactNode } from 'react'

const TIPOS = {
  'nav-forward': 'nav-forward',
  'nav-back': 'nav-back',
  'nav-section': 'nav-section',
  'nav-zoom': 'nav-zoom',
  default: 'nav-fade',
} as const

export default function TransicionPagina({
  children,
}: {
  children: ReactNode
}) {
  return (
    <ViewTransition enter={TIPOS} exit={TIPOS} default="none">
      <ViewTransition enter="cargando-in" default="none">
        {children}
      </ViewTransition>
    </ViewTransition>
  )
}
