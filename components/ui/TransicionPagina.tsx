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
      {children}
    </ViewTransition>
  )
}
