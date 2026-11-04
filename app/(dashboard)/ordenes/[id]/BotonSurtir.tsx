'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, TriangleAlert } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { surtirOrden } from '../actions'

export default function BotonSurtir({
  ordenId,
  esParcial,
}: {
  ordenId: string
  esParcial: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const handleSurtir = async () => {
    setIsLoading(true)
    setErrorMsg('')

    try {
      await surtirOrden(ordenId)
      setConfirmOpen(false)
      router.refresh()
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'No se pudo surtir la orden.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorMsg('')
          setConfirmOpen(true)
        }}
        className={`btn ${
          esParcial
            ? 'border border-gonper-warning-border bg-gonper-warning-bg text-gonper-warning hover:bg-gonper-warning-bg/70'
            : 'btn-primary'
        }`}
      >
        {esParcial ? (
          <TriangleAlert className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <PackageCheck className="h-4 w-4" strokeWidth={1.75} />
        )}
        {esParcial ? 'Surtir parcialmente' : 'Surtir orden'}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={esParcial ? 'Surtir parcialmente' : 'Surtir orden'}
        description="El inventario se descontará automáticamente."
        confirmLabel={esParcial ? 'Surtir parcial' : 'Surtir orden'}
        pendingLabel="Surtiendo…"
        tono="primary"
        pending={isLoading}
        error={errorMsg}
        onConfirm={handleSurtir}
        onClose={() => {
          if (isLoading) return
          setConfirmOpen(false)
          setErrorMsg('')
        }}
      >
        {esParcial ? (
          <>
            No hay stock suficiente para todos los artículos. Se surtirá solo lo
            disponible y la orden quedará como{' '}
            <strong className="font-semibold">parcial</strong>. ¿Continuar?
          </>
        ) : (
          <>
            Se descontarán del inventario las cantidades solicitadas de esta
            orden. ¿Continuar?
          </>
        )}
      </ConfirmDialog>
    </>
  )
}
