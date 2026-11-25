import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { CheckCircle2, FilePlus2, FileText, Upload } from 'lucide-react'
import ProcesarPdfButton from './ProcesarPdfButton'
import ListaRequisiciones, {
  nombreCliente,
  type Orden,
} from './ListaRequisiciones'
import EmptyState from '@/components/ui/EmptyState'
import TransicionPagina from '@/components/ui/TransicionPagina'
import PageHeader from '@/components/ui/PageHeader'

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
      `id, folio, estado, created_at, pdf_path, factura_firmada_path, cliente_id, clientes (nombre)`,
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
    <TransicionPagina>
    <div className="mx-auto max-w-[1180px] pb-6">
      <PageHeader
        eyebrow={`${lista.length} ${
          lista.length === 1 ? 'requisición' : 'requisiciones'
        } registradas`}
        title="Requisiciones"
        action={
          <Link
            href="/ordenes/nueva"
            transitionTypes={['nav-zoom']}
            className="btn btn-primary hidden sm:inline-flex"
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} />
            Subir requisición
          </Link>
        }
      />

      {/* Siguiente paso tras subir el archivo. Antes la lista solo
          resaltaba la fila nueva con un ring suave y el badge "Nueva",
          y el usuario tenía que descubrir el botón chico "Leer archivo"
          entre las demás acciones de la fila. Ahora la tarjeta le dice
          en palabras simples qué hacer y el botón es a todo lo ancho.
          Solo aplica a la requisición recién subida y en BORRADOR
          (aún sin leer); si ya se leyó, la fila normal basta. */}
      {nuevaOrden && nuevaOrden.estado === 'BORRADOR' && nuevaOrden.pdf_path && (
        <section className="card mt-5 border-gonper-success-border bg-gonper-success-bg/40 p-5">
          <p className="flex items-center gap-2 text-[14.5px] font-semibold leading-snug">
            <CheckCircle2
              className="h-5 w-5 shrink-0 text-gonper-success"
              strokeWidth={1.75}
            />
            Archivo subido: {nombreCliente(nuevaOrden.clientes)} ·{' '}
            {nuevaOrden.folio}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gonper-muted">
            La requisición ya quedó guardada. Ahora lee el archivo para ver
            sus artículos y revisar las cantidades.
          </p>
          <div className="mt-4">
            <ProcesarPdfButton
              ordenId={nuevaOrden.id}
              pdfPath={nuevaOrden.pdf_path}
              grande
            />
          </div>
        </section>
      )}

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
              <Link
                href="/ordenes/nueva"
                transitionTypes={['nav-zoom']}
                className="btn btn-primary"
              >
                <FilePlus2 className="h-4 w-4" strokeWidth={1.75} />
                Subir mi primera requisición
              </Link>
            }
          />
        </div>
      ) : (
        <ListaRequisiciones
          ordenes={lista}
          clientes={clientes || []}
          nuevaId={nuevaOrden?.id}
        />
      )}
    </div>
    </TransicionPagina>
  )
}
