'use client'

import { useState } from 'react'
import { obtenerUrlPDF } from './actions'

export default function VerPdfButton({ pdfPath }: { pdfPath: string | null }) {
  const [isLoading, setIsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  if (!pdfPath) return null

  const handleVerPdf = async () => {
    setIsLoading(true)
    try {
      const url = await obtenerUrlPDF(pdfPath)
      setPdfUrl(url)
      setIsModalOpen(true)
    } catch (error: any) {
      alert('Error al abrir el PDF: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleVerPdf}
        disabled={isLoading}
        className="px-3 py-1 text-sm font-medium text-gonper-primary bg-gonper-primary/10 hover:bg-gonper-primary/20 rounded-md transition-colors flex items-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-gonper-primary border-t-transparent rounded-full animate-spin"></div>
            Abriendo...
          </>
        ) : (
          <>📄 Ver PDF</>
        )}
      </button>

      {/* MODAL VISOR DE PDF */}
      {isModalOpen && pdfUrl && (
        // 👇 Aquí está el cambio: z-[60] ahora es z-60
        <div className="fixed inset-0 bg-black/70 z-60 flex items-center justify-center p-0 md:p-6 backdrop-blur-sm">
          <div className="bg-gonper-surface w-full max-w-5xl h-full md:h-[90vh] md:rounded-xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Header del Modal */}
            <div className="p-4 border-b border-gonper-border flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xl">📄</span>
                <h3 className="font-bold text-gonper-text">Documento Original</h3>
              </div>
              <div className="flex items-center gap-4">
                <a 
                  href={pdfUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-gonper-primary hover:underline font-medium hidden sm:block"
                >
                  Abrir en pestaña nueva ↗
                </a>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="text-3xl text-gray-400 hover:text-red-500 leading-none"
                  title="Cerrar visor"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Visor del PDF */}
            <div className="flex-1 bg-gray-200 relative">
              <iframe 
                src={`${pdfUrl}#toolbar=0&navpanes=0`} 
                className="w-full h-full border-none"
                title="Visor de PDF"
              />
            </div>
            
            {/* Footer del Modal (Solo visible en móviles) */}
            <div className="p-3 border-t border-gonper-border bg-gray-50 text-center sm:hidden">
              <a 
                href={pdfUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-block w-full py-2 bg-gonper-primary text-white rounded-lg text-sm font-bold"
              >
                Abrir PDF en pantalla completa
              </a>
            </div>

          </div>
        </div>
      )}
    </>
  )
}