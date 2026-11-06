import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { FilePlus2, FileText, Plus, Upload } from 'lucide-react'
import VerPdfButton from './VerPdfButton'
import ProcesarPdfButton from './ProcesarPdfButton'
import AccionesOrden from './AccionesOrden'
import EstadoBadge from '@/components/EstadoBadge'
import EmptyState from '@/components/ui/EmptyState'
import Fab from '@/components/ui/Fab'
import PageHeader from '@/components/ui/PageHeader'

type Orden = {
  id: string
  folio: string
  estado: string
  created_at: string
  pdf_path: string | null
  cliente_id: string
  clientes: { nombre: string } | { nombre: string }[] | null
}

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const nombreCliente = (clientes: Orden['clientes']) => {
  if (!clientes) return 'Cliente desconocido'
  return Array.isArray(clientes)
    ? clientes[0]?.nombre || 'Cliente desconocido'
    : clientes.nombre
}

export default async function OrdenesPage() {
  const supabase = await createClient()

  const { data: ordenes, error } = await supabase
    .from('ordenes')
    .select(
      `id, folio, estado, created_at, pdf_path, cliente_id, clientes (nombre)`,
    )
    .order('created_at', { ascending: false })

  // Necesitamos la lista de clientes para el selector de edición
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .order('nombre')

  const lista = (ordenes ?? []) as Orden[]

  return (
    <div className="mx-auto max-w-[1180px] pb-6">
      <PageHeader
        eyebrow={`${lista.length} ${
          lista.length === 1 ? 'requisición' : 'requisiciones'
        } registradas`}
        title="Requisiciones"
        action={
          <Link href="/ordenes/nueva" className="btn btn-primary hidden sm:inline-flex">
            <Upload className="h-4 w-4" strokeWidth={1.75} />
            Subir requisición
          </Link>
        }
      />

      {error ? (
        <div className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-4 py-3 text-[13px] text-gonper-danger">
          No se pudieron cargar las requisiciones. Intenta recargar la página.
        </div>
      ) : lista.length === 0 ? (
        <div className="card mt-5">
          <EmptyState
            icon={<FileText className="h-6 w-6" strokeWidth={1.5} />}
            title="Sin requisiciones todavía"
            description="Sube la primera requisición en PDF o foto para capturar sus artículos."
            action={
              <Link href="/ordenes/nueva" className="btn btn-primary">
                <FilePlus2 className="h-4 w-4" strokeWidth={1.75} />
                Subir mi primera requisición
              </Link>
            }
          />
        </div>
      ) : (
        <div className="stagger mt-4 grid grid-cols-1 gap-3 md:mt-5 md:gap-0 md:overflow-hidden md:rounded-[8px] md:border md:border-gonper-border md:bg-gonper-surface">
          {lista.map((orden) => (
            <article
              key={orden.id}
              className="card min-w-0 p-4 md:flex md:items-center md:justify-between md:gap-6 md:rounded-none md:border-0 md:border-b md:border-gonper-border md:px-5 md:py-3.5 md:last:border-b-0 md:hover:bg-gonper-hover"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/ordenes/${orden.id}`}
                    className="min-w-0 text-[14.5px] font-semibold leading-snug tracking-[-0.01em] transition-colors duration-[120ms] hover:text-gonper-primary md:text-[13.5px]"
                  >
                    {nombreCliente(orden.clientes)}
                  </Link>
                  <div className="shrink-0 md:hidden">
                    <EstadoBadge estado={orden.estado} />
                  </div>
                </div>

                <p className="mt-1 text-[11.5px] text-gonper-muted">
                  <span className="text-[12.5px] font-semibold text-gonper-text">
                    {orden.folio}
                  </span>
                  <span className="mx-1.5 text-gonper-border">/</span>
                  {fecha.format(new Date(orden.created_at))}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:shrink-0 md:justify-end">
                {orden.pdf_path ? (
                  <>
                    <VerPdfButton pdfPath={orden.pdf_path} />
                    {orden.estado === 'BORRADOR' && (
                      <ProcesarPdfButton
                        ordenId={orden.id}
                        pdfPath={orden.pdf_path}
                      />
                    )}
                  </>
                ) : (
                  <span className="text-[11.5px] italic text-gonper-muted">
                    Sin PDF
                  </span>
                )}

                <div className="hidden md:block">
                  <EstadoBadge estado={orden.estado} />
                </div>

                <div className="-mr-1 shrink-0">
                  <AccionesOrden orden={orden} clientes={clientes || []} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Fab
        href="/ordenes/nueva"
        label="Subir requisición"
        icon={<Plus className="h-6 w-6" strokeWidth={2} />}
      />
    </div>
  )
}
