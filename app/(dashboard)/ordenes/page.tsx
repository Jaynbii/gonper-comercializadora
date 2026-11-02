import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import VerPdfButton from './VerPdfButton'
import ProcesarPdfButton from './ProcesarPdfButton'
import AccionesOrden from './AccionesOrden'

export default async function OrdenesPage() {
  const supabase = await createClient()
  
  const { data: ordenes, error } = await supabase
    .from('ordenes')
    .select(`id, folio, estado, created_at, pdf_path, cliente_id, clientes (nombre)`)
    .order('created_at', { ascending: false })

  // Necesitamos la lista de clientes para el selector de edición
  const { data: clientes } = await supabase.from('clientes').select('id, nombre').order('nombre')

  const getBadgeColor = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-amber-100 text-amber-700'
      case 'PARCIAL': return 'bg-orange-100 text-orange-700'
      case 'ENTREGADA': return 'bg-emerald-100 text-emerald-700'
      case 'CANCELADA': return 'bg-red-100 text-red-700'
      case 'BORRADOR': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gonper-text">Órdenes y Requisiciones</h1>
          <p className="text-sm text-gonper-muted">Historial de pedidos recibidos</p>
        </div>
        <Link href="/ordenes/nueva" className="bg-gonper-primary hover:bg-gonper-primary-hover text-white px-4 py-2 rounded-lg font-medium w-full md:w-auto text-center">+ Subir Requerimiento (PDF)</Link>
      </div>

      <div className="bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-red-500">Error al cargar órdenes</div>
        ) : ordenes && ordenes.length > 0 ? (
          <div className="divide-y divide-gonper-border">
            {ordenes.map((orden) => (
              <div key={orden.id} className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gonper-bg/50 transition-colors">
                <div>
                  <Link href={`/ordenes/${orden.id}`} className="font-bold text-gonper-text hover:text-gonper-primary hover:underline transition-colors">
                    {(orden.clientes as any)?.nombre || 'Cliente Desconocido'}
                  </Link>
                  <p className="text-xs text-gonper-muted font-mono mt-1">{orden.folio}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between md:justify-end gap-4 w-full md:w-auto">
                  
                  {/* Botones de PDF */}
                  <div className="flex items-center gap-2">
                    {orden.pdf_path ? (
                      <>
                        <VerPdfButton pdfPath={orden.pdf_path} />
                        {orden.estado === 'BORRADOR' && <ProcesarPdfButton ordenId={orden.id} pdfPath={orden.pdf_path} />}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Sin PDF</span>
                    )}
                  </div>

                  <div className="text-left md:text-right hidden md:block">
                    <p className="text-xs text-gonper-muted">Fecha</p>
                    <p className="text-sm font-medium">{new Date(orden.created_at).toLocaleDateString('es-MX')}</p>
                  </div>
                  
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${getBadgeColor(orden.estado)}`}>{orden.estado}</span>

                  {/* 👇 NUEVO COMPONENTE DE ACCIONES 👇 */}
                  <AccionesOrden orden={orden} clientes={clientes || []} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center flex flex-col items-center">
            <span className="text-4xl mb-4">📄</span>
            <h3 className="text-lg font-bold text-gonper-text mb-1">No hay órdenes aún</h3>
            <p className="text-gonper-muted text-sm mb-4">Sube tu primer requerimiento en PDF para empezar.</p>
            <Link href="/ordenes/nueva" className="text-gonper-primary font-medium hover:underline">Subir mi primer PDF &rarr;</Link>
          </div>
        )}
      </div>
    </div>
  )
}