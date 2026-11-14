'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CheckCircle2, Eye } from 'lucide-react'
import { Badge } from '@/components/EstadoBadge'
import { mostrarToast } from '@/components/ui/Toast'
import FacturaFirmadaModal from '../FacturaFirmadaModal'
import { obtenerUrlFacturaFirmada } from '../actions'

const fechaCorta = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * Botón de la factura firmada en el detalle de la requisición.
 * Sin foto: abre el modal para subirla. Con foto: muestra el sello
 * "Firmada", la fecha y el botón para ver la foto.
 */
export default function BotonFacturaFirmada({
  ordenId,
  folio,
  firmadaEn,
  tieneFoto,
}: {
  ordenId: string
  folio: string
  firmadaEn: string | null
  tieneFoto: boolean
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const router = useRouter()

  const handleVer = async () => {
    if (abriendo) return
    setAbriendo(true)
    const resultado = await obtenerUrlFacturaFirmada(ordenId)
    setAbriendo(false)
    if (!resultado.success || !resultado.url) {
      mostrarToast(resultado.error ?? 'No se pudo abrir la foto.', 'error')
      return
    }
    window.open(resultado.url, '_blank', 'noopener,noreferrer')
  }

  if (tieneFoto) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge tono="success">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          Firmada
        </Badge>
        {firmadaEn && (
          <p className="text-[12px] text-gonper-muted">
            Firmada el {fechaCorta.format(new Date(firmadaEn))}
          </p>
        )}
        <button
          type="button"
          onClick={handleVer}
          disabled={abriendo}
          className="btn btn-quiet w-full sm:w-auto"
        >
          <Eye className="h-4 w-4" strokeWidth={1.75} />
          {abriendo ? 'Abriendo…' : 'Ver factura firmada'}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="btn btn-primary w-full sm:w-auto"
      >
        <Camera className="h-4 w-4" strokeWidth={1.75} />
        Subir factura firmada
      </button>
      <FacturaFirmadaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ordenId={ordenId}
        folio={folio}
        onGuardado={() => router.refresh()}
      />
    </>
  )
}
