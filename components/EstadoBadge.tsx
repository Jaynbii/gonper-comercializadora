import type { ReactNode } from 'react'

type Tono = 'neutral' | 'warning' | 'success' | 'danger'

const TONOS: Record<Tono, string> = {
  neutral:
    'border-gonper-border bg-gonper-surface-muted text-gonper-muted',
  warning:
    'border-gonper-warning-border bg-gonper-warning-bg text-gonper-warning',
  success:
    'border-gonper-success-border bg-gonper-success-bg text-gonper-success',
  danger: 'border-gonper-danger-border bg-gonper-danger-bg text-gonper-danger',
}

const ESTADOS: Record<string, { tono: Tono; etiqueta: string }> = {
  PENDIENTE: { tono: 'warning', etiqueta: 'Pendiente' },
  PARCIAL: { tono: 'warning', etiqueta: 'Parcial' },
  ENTREGADA: { tono: 'success', etiqueta: 'Entregada' },
  CANCELADA: { tono: 'danger', etiqueta: 'Cancelada' },
  BORRADOR: { tono: 'neutral', etiqueta: 'Borrador' },
}

export function Badge({
  tono = 'neutral',
  children,
}: {
  tono?: Tono
  children: ReactNode
}) {
  return <span className={`badge ${TONOS[tono]}`}>{children}</span>
}

export default function EstadoBadge({ estado }: { estado: string }) {
  const config = ESTADOS[estado] ?? {
    tono: 'neutral' as Tono,
    etiqueta: estado,
  }

  return <Badge tono={config.tono}>{config.etiqueta}</Badge>
}
