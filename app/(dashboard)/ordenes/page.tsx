import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { ChevronRight, FilePlus2, FileText, Plus, Upload } from 'lucide-react'
import VerPdfButton from './VerPdfButton'
import ProcesarPdfButton from './ProcesarPdfButton'
import AccionesOrden from './AccionesOrden'
import EstadoBadge, { Badge } from '@/components/EstadoBadge'
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

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams?: Promise<{ nueva?: string | string[] }>
}) {
  const supabase = await createClient()
  const params = (await searchParams) || {}
  const nuevaId =
    typeof params.nueva === 'string' ? params.nueva : undefined

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

  // Requisición recién creada (viene de /ordenes/nueva con ?nueva=<id>):
  // su fila queda resaltada con un ring suave y el badge "Nueva".
  // Si el id no existe en la lista, no se muestra nada.
  const nuevaOrden = nuevaId
    ? lista.find((orden) => orden.id === nuevaId)
    : undefined

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
              className={`card min-w-0 p-4 md:flex md:items-center md:justify-between md:gap-6 md:rounded-none md:border-0 md:border-b md:border-gonper-border md:px-5 md:py-3.5 md:last:border-b-0 md:hover:bg-gonper-hover ${
                nuevaOrden?.id === orden.id
                  ? 'ring-1 ring-inset ring-gonper-success'
                  : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  {/* Toda la zona nombre/folio es el enlace al detalle,
                      con chevron para que se vea tocable. */}
                  <Link
                    href={`/ordenes/${orden.id}`}
                    className="group min-w-0 flex-1"
                  >
                    <span className="flex items-center gap-1 text-[14.5px] font-semibold leading-snug tracking-[-0.01em] transition-colors duration-[120ms] group-hover:text-gonper-primary md:text-[13.5px]">
                      <span className="min-w-0 truncate">
                        {nombreCliente(orden.clientes)}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-gonper-muted transition-all duration-[120ms] group-hover:translate-x-0.5 group-hover:text-gonper-primary"
                        strokeWidth={1.75}
                      />
                    </span>
                    <span className="mt-1 block text-[11.5px] text-gonper-muted">
                      <span className="text-[12.5px] font-semibold text-gonper-text">
                        {orden.folio}
                      </span>
                      <span className="mx-1.5 text-gonper-border">/</span>
                      {fecha.format(new Date(orden.created_at))}
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5 md:hidden">
                    {nuevaOrden?.id === orden.id && (
                      <Badge tono="success">Nueva</Badge>
                    )}
                    <EstadoBadge estado={orden.estado} />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:shrink-0 md:justify-end">
                {/* Enlace discreto al detalle, además de la zona
                    nombre/folio, que también es enlace. */}
                <Link
                  href={`/ordenes/${orden.id}`}
                  className="inline-flex min-h-11 items-center gap-0.5 px-1 text-[12.5px] font-medium text-gonper-primary hover:underline md:min-h-0"
                >
                  Ver requisición
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>

                {orden.pdf_path ? (
                  <>
                    {/* En BORRADOR, "Leer archivo" es la acción primaria
                        de la fila: va primero y es el único botón
                        principal, así el flujo sigue solo. */}
                    {orden.estado === 'BORRADOR' && (
                      <ProcesarPdfButton
                        ordenId={orden.id}
                        pdfPath={orden.pdf_path}
                      />
                    )}
                    <VerPdfButton pdfPath={orden.pdf_path} />
                  </>
                ) : (
                  <span className="text-[11.5px] italic text-gonper-muted">
                    Sin PDF
                  </span>
                )}

                <div className="hidden items-center gap-1.5 md:flex">
                  {nuevaOrden?.id === orden.id && (
                    <Badge tono="success">Nueva</Badge>
                  )}
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
