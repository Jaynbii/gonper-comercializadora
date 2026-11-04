'use client'

import { useState } from 'react'
import { ExternalLink, FileText, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { obtenerUrlPDF } from './actions'

export default function VerPdfButton({ pdfPath }: { pdfPath: string | null }) {
  const [isLoading, setIsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!pdfPath) return null

  const handleVerPdf = async () => {
    setIsLoading(true)
    setErrorMsg('')
    setIsModalOpen(true)

    try {
      const url = await obtenerUrlPDF(pdfPath)
      setPdfUrl(url)
    } catch (error) {
      setPdfUrl(null)
      setErrorMsg(
        error instanceof Error ? error.message : 'No se pudo abrir el PDF.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleVerPdf}
        disabled={isLoading}
        className="btn btn-quiet px-3 text-[12px]"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        {isLoading ? 'Abriendo…' : 'Ver PDF'}
      </button>

      <Modal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setErrorMsg('')
        }}
        title="Documento original"
        description={pdfPath}
        size="wide"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false)
                setErrorMsg('')
              }}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cerrar
            </button>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary flex-1 sm:flex-none"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                Abrir en pestaña nueva
              </a>
            )}
          </>
        }
      >
        {pdfUrl ? (
          <div className="h-[62dvh] bg-gonper-surface-muted md:h-[68dvh]">
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0`}
              className="h-full w-full border-none"
              title="Visor de PDF"
            />
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <FileText
              className="mx-auto h-7 w-7 text-gonper-muted"
              strokeWidth={1.5}
            />
            <p className="mt-3 text-[13.5px] font-medium">
              {isLoading ? 'Preparando el documento…' : 'No se pudo abrir el PDF'}
            </p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[12.5px] leading-relaxed text-gonper-muted">
              {isLoading
                ? 'Esto tarda solo un momento.'
                : errorMsg || 'Verifica que el archivo siga disponible.'}
            </p>
            {!isLoading && (
              <button
                type="button"
                onClick={handleVerPdf}
                className="btn btn-quiet mt-4"
              >
                Reintentar
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
