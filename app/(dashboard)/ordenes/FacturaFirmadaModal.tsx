'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { mostrarToast } from '@/components/ui/Toast'
import { guardarFacturaFirmada } from './actions'
import { validarFotoFirmada } from '@/utils/facturaFirmada'

/**
 * Modal para subir la foto de la requisición firmada y sellada, como
 * comprobante de entrega. La requisición ya está en ENTREGADA
 * ("surtida") y así se queda; la foto solo agrega el sello "Firmada"
 * y los campos para reportes (ruta + fecha). La foto es obligatoria
 * para aceptar, pero "Subir después" nunca bloquea el surtido.
 */
export default function FacturaFirmadaModal({
  open,
  onClose,
  ordenId,
  folio,
  onGuardado,
}: {
  open: boolean
  onClose: () => void
  ordenId: string
  folio?: string
  onGuardado?: () => void
}) {
  const [foto, setFoto] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const inputCamaraRef = useRef<HTMLInputElement>(null)
  const inputGaleriaRef = useRef<HTMLInputElement>(null)

  const limpiar = () => {
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia)
    setFoto(null)
    setVistaPrevia(null)
    setErrorMsg('')
  }

  const cerrar = () => {
    if (subiendo) return
    limpiar()
    onClose()
  }

  const elegirFoto = (archivo: File | null) => {
    if (!archivo) return
    const error = validarFotoFirmada(archivo)
    if (error) {
      setErrorMsg(error)
      return
    }
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia)
    setFoto(archivo)
    setVistaPrevia(URL.createObjectURL(archivo))
    setErrorMsg('')
  }

  const handleAceptar = async () => {
    if (!foto || subiendo) return
    setSubiendo(true)
    setErrorMsg('')

    const formData = new FormData()
    formData.append('orden_id', ordenId)
    formData.append('foto', foto)
    const resultado = await guardarFacturaFirmada(formData)

    setSubiendo(false)
    if (!resultado.success) {
      setErrorMsg(resultado.error ?? 'No se pudo guardar la foto.')
      return
    }
    mostrarToast('Factura firmada guardada.')
    limpiar()
    onGuardado?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Factura firmada y sellada"
      description={
        folio
          ? `Toma la foto de la requisición ${folio} ya firmada y sellada. Se guarda como comprobante de entrega.`
          : 'Toma la foto de la requisición ya firmada y sellada. Se guarda como comprobante de entrega.'
      }
      footer={
        <>
          <button
            type="button"
            onClick={cerrar}
            disabled={subiendo}
            className="btn btn-quiet"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={cerrar}
            disabled={subiendo}
            className="btn btn-quiet"
          >
            Subir después
          </button>
          <button
            type="button"
            onClick={handleAceptar}
            disabled={!foto || subiendo}
            className="btn btn-primary"
          >
            {subiendo ? 'Guardando…' : 'Aceptar'}
          </button>
        </>
      }
    >
      <div className="px-5 py-5">
        {vistaPrevia ? (
          <div>
            {/* Vista previa local (blob:): next/image no optimiza
                URLs locales, por eso <img> con el aviso silenciado. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vistaPrevia}
              alt="Foto de la factura firmada y sellada"
              className="max-h-80 w-full rounded-[10px] border border-gonper-border object-contain"
            />
            <button
              type="button"
              onClick={limpiar}
              disabled={subiendo}
              className="btn btn-quiet mt-3"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
              Quitar foto y tomar otra
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => inputCamaraRef.current?.click()}
              disabled={subiendo}
              className="btn btn-primary w-full"
            >
              <Camera className="h-4 w-4" strokeWidth={1.75} />
              Tomar foto
            </button>
            <button
              type="button"
              onClick={() => inputGaleriaRef.current?.click()}
              disabled={subiendo}
              className="btn btn-quiet w-full"
            >
              <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
              Elegir de la galería
            </button>
            <p className="mt-1 text-[12px] leading-relaxed text-gonper-muted">
              La foto debe verse la firma y el sello. JPG, PNG o WebP,
              hasta 10 MB.
            </p>
          </div>
        )}

        {/* Dos entradas: la de cámara abre la cámara trasera del teléfono;
            la de galería deja elegir una foto ya tomada. Se resetea el
            valor tras elegir para poder tomar la misma foto otra vez. */}
        <input
          ref={inputCamaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            elegirFoto(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
        <input
          ref={inputGaleriaRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            elegirFoto(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />

        {errorMsg && (
          <p
            role="alert"
            className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger"
          >
            {errorMsg}
          </p>
        )}
      </div>
    </Modal>
  )
}
