// Lista de requisiciones con buscador (Alex, 2026-11-25): filtra por
// folio, cliente o estado sin recargar la página. Las filas son las
// mismas que tenía la página del servidor, movidas aquí tal cual para
// poder filtrarlas en el cliente.
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ViewTransition } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import VerPdfButton from './VerPdfButton'
import ProcesarPdfButton from './ProcesarPdfButton'
import AccionesOrden from './AccionesOrden'
import EstadoBadge, { Badge } from '@/components/EstadoBadge'
import {
  filtrarRequisiciones,
  type RequisicionBuscable,
} from '@/utils/filtroRequisiciones'
import { normalizarTexto } from '@/utils/filtroCotejo'

export type Orden = {
  id: string
  folio: string
  estado: string
  created_at: string
  pdf_path: string | null
  factura_firmada_path: string | null
  cliente_id: string
  clientes: { nombre: string } | { nombre: string }[] | null
}

export const nombreCliente = (clientes: Orden['clientes']) => {
  if (!clientes) return 'Cliente desconocido'
  return Array.isArray(clientes)
    ? clientes[0]?.nombre || 'Cliente desconocido'
    : clientes.nombre
}

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export default function ListaRequisiciones({
  ordenes,
  clientes,
  nuevaId,
}: {
  ordenes: Orden[]
  clientes: { id: string; nombre: string }[]
  nuevaId?: string
}) {
  const [busqueda, setBusqueda] = useState('')

  const buscables: RequisicionBuscable[] = useMemo(
    () =>
      ordenes.map((o) => ({
        id: o.id,
        folio: o.folio,
        cliente: nombreCliente(o.clientes),
        estado: o.estado,
      })),
    [ordenes],
  )
  const filtradas = useMemo(
    () => filtrarRequisiciones(buscables, busqueda),
    [buscables, busqueda],
  )
  const buscando = normalizarTexto(busqueda).length > 0
  const lista = useMemo(
    () =>
      ordenes.filter((o) =>
        filtradas.some((f) => f.id === o.id),
      ),
    [ordenes, filtradas],
  )

  return (
    <>
      <div className="relative mt-5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gonper-muted"
          strokeWidth={1.75}
        />
        <input
          type="text"
          placeholder="Buscar por folio, cliente o estado"
          className="field pl-9"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar requisición"
        />
      </div>
      {buscando && (
        <p className="mt-2 text-[12px] text-gonper-muted">
          {lista.length} de {ordenes.length}{' '}
          {ordenes.length === 1 ? 'requisición' : 'requisiciones'}
        </p>
      )}

      {buscando && lista.length === 0 ? (
        <div className="card mt-4 px-4 py-5 text-center">
          <p className="text-[13px] text-gonper-muted">
            Sin resultados para «{busqueda}»
          </p>
          <button
            type="button"
            onClick={() => setBusqueda('')}
            className="btn btn-quiet mt-3"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:mt-5 md:gap-0 md:overflow-hidden md:rounded-[8px] md:border md:border-gonper-border md:bg-gonper-surface">
          {lista.map((orden) => (
            <article
              key={orden.id}
              className={`card min-w-0 p-4 md:flex md:items-center md:justify-between md:gap-6 md:rounded-none md:border-0 md:border-b md:border-gonper-border md:px-5 md:py-3.5 md:last:border-b-0 md:hover:bg-gonper-hover ${
                nuevaId === orden.id
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
                    transitionTypes={['nav-forward']}
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
                      {/* El folio hace morph al detalle: mismo nombre
                          en la lista y en el encabezado del detalle. */}
                      <ViewTransition
                        name={`req-${orden.id}`}
                        share="morph"
                        default="none"
                      >
                        <span className="text-[12.5px] font-semibold text-gonper-text">
                          {orden.folio}
                        </span>
                      </ViewTransition>
                      <span className="mx-1.5 text-gonper-border">/</span>
                      {fecha.format(new Date(orden.created_at))}
                      {/* En móvil el estado va junto al folio (ley de
                          proximidad); en escritorio sigue en la fila de
                          acciones. */}
                      <span className="ml-2 inline-flex items-center gap-1 align-middle md:hidden">
                        {nuevaId === orden.id && (
                          <Badge tono="success">Nueva</Badge>
                        )}
                        <EstadoBadge estado={orden.estado} />
                      </span>
                    </span>
                  </Link>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:shrink-0 md:justify-end">
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
                  {nuevaId === orden.id && (
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
    </>
  )
}
