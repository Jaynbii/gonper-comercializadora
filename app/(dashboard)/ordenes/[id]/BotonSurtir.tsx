'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, TriangleAlert } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { mostrarToast } from '@/components/ui/Toast'
import { surtirOrden } from '../actions'
import FacturaFirmadaModal from '../FacturaFirmadaModal'
import { mensajeErrorSurtir } from '@/utils/surtir'

export default function BotonSurtir({
  ordenId,
  esParcial,
}: {
  ordenId: string
  esParcial: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [modalFirmadaOpen, setModalFirmadaOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const handleSurtir = async () => {
    setIsLoading(true)
    setErrorMsg('')

    try {
      // surtirOrden() DEVUELVE el resultado, no lanza: los valores
      // devueltos por una Server Action llegan tal cual al teléfono,
      // mientras que un throw se redacta en producción como
      // "Minified React error #441" (digest 2179146847). Por eso el
      // mensaje real del fallo se lee de `resultado.error`.
      const resultado = await surtirOrden(ordenId)
      if (!resultado.success) {
        setErrorMsg(mensajeErrorSurtir(resultado.error).mensaje)
        return
      }
      setConfirmOpen(false)
      mostrarToast(
        esParcial ? 'Surtido parcial registrado.' : 'Requisición surtida.',
      )
      // Surtido completo: la requisición quedó ENTREGADA y toca subir
      // la foto de la factura firmada y sellada. En parcial no: aún
      // faltan artículos y la firma llega con la entrega final.
      //
      // OJO: aquí NO se hace router.refresh(). El refresh recarga el
      // detalle y la página deja de dibujar este botón (ya no hay nada
      // que surtir), así que el botón se desmonta y con él se cerraba
      // el modal al instante (bug visto por Alex 2026-11-13). El
      // refresh se hace al cerrar el modal.
      if (resultado.estado === 'ENTREGADA') {
        setModalFirmadaOpen(true)
      } else {
        router.refresh()
      }
    } catch (error) {
      // Red de seguridad: si algo fuera de surtirOrden() lanzara
      // (p. ej. fallo de red), nunca se muestra el "#441" tal cual.
      const { mensaje, digest } = mensajeErrorSurtir(error)
      if (digest) console.error('Error al surtir, digest:', digest)
      setErrorMsg(mensaje)
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
        className={`btn w-full sm:w-auto ${
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
        {esParcial ? 'Surtir parcialmente' : 'Surtir requisición'}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={esParcial ? 'Surtir parcialmente' : 'Surtir requisición'}
        description="El inventario se descontará automáticamente."
        confirmLabel={esParcial ? 'Surtir parcial' : 'Surtir requisición'}
        pendingLabel="Procesando entrega…"
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
            disponible y la requisición quedará como{' '}
            <strong className="font-semibold">parcial</strong>. ¿Continuar?
          </>
        ) : (
          <>
            Se descontarán del inventario las cantidades solicitadas de esta
            orden. ¿Continuar?
          </>
        )}
      </ConfirmDialog>

      <FacturaFirmadaModal
        open={modalFirmadaOpen}
        onClose={() => {
          setModalFirmadaOpen(false)
          router.refresh()
        }}
        ordenId={ordenId}
      />
    </>
  )
}
