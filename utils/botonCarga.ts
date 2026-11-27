// LOAD & SUCCESS (reel "Button Part 7" de ui_motion_prompts, Alex
// 2026-11-27): para que la píldora se encoja a círculo con
// animación, el ancho tiene que ser explícito, porque width: auto
// no anima. Se fija el ancho medido en el click y la clase
// .btn-cargando lo colapsa a 44 px (36 px en escritorio).

export function fijarAnchoBoton(e: React.MouseEvent<HTMLButtonElement>) {
  const boton = e.currentTarget
  boton.style.width = `${boton.offsetWidth}px`
}
