'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import type { OrdenCompleta } from './DashboardView'

const fechaCorta = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Mazatlan',
})

function nombreCliente(clientes: unknown) {
  const registro = Array.isArray(clientes) ? clientes[0] : clientes

  if (!registro || typeof registro !== 'object') return 'Cliente sin asignar'

  const nombre = (registro as { nombre?: unknown }).nombre

  return typeof nombre === 'string' && nombre ? nombre : 'Cliente sin asignar'
}

// Tarjeta "Requisiciones completas" del dashboard: solo cuentan las
// entregadas Y firmadas (foto firmada y sellada subida). Al picarla se
// abre el modal con la lista; cada renglón lleva al detalle.
export default function CompletasStat({
  ordenes,
}: {
  ordenes: OrdenCompleta[]
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="group w-full bg-gonper-surface px-4 py-4 text-left transition-colors duration-[120ms] hover:bg-gonper-hover sm:px-5 lg:px-6 lg:py-5"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-h-[2.7em] break-words text-[10px] font-medium uppercase leading-[1.35] tracking-[0.1em] text-gonper-muted sm:text-[10.5px] lg:text-[11px] lg:tracking-[0.13em]">
            Requisiciones completas
          </p>
          <ArrowUpRight
            className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-gonper-muted opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 lg:block"
            strokeWidth={1.75}
          />
        </div>
        <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-gonper-success lg:mt-2.5 lg:text-[34px]">
          {ordenes.length}
        </p>
        <p className="mt-2 text-[10.5px] font-medium leading-tight text-gonper-primary sm:hidden">
          Ver detalle
        </p>
        <p className="mt-2 hidden text-[11.5px] leading-tight text-gonper-muted sm:block lg:text-[12.5px]">
          Entregadas y firmadas
        </p>
      </button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Requisiciones completas"
        description={`${ordenes.length} ${
          ordenes.length === 1 ? 'requisición' : 'requisiciones'
        } · Entregadas y firmadas`}
        footer={
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => setAbierto(false)}
          >
            Cerrar
          </button>
        }
      >
        {ordenes.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13.5px] font-medium">
              Todavía no hay requisiciones completas
            </p>
            <p className="mt-1 text-[12.5px] text-gonper-muted">
              Una requisición está completa cuando se entrega y se sube la
              foto firmada y sellada.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gonper-border">
            {ordenes.map((orden) => (
              <li key={orden.id}>
                <Link
                  href={`/ordenes/${orden.id}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors duration-[120ms] hover:bg-gonper-hover"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">
                      {nombreCliente(orden.clientes)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gonper-muted">
                      <span className="text-[12px] font-semibold text-gonper-text">
                        {orden.folio}
                      </span>{' '}
                      · Firmada{' '}
                      {fechaCorta.format(
                        new Date(
                          orden.factura_firmada_en ?? orden.created_at,
                        ),
                      )}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full border border-gonper-success-border bg-gonper-success-bg px-2 py-[3px] text-[11px] font-medium text-gonper-success">
                    Completa
                  </span>

                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-gonper-muted opacity-0 transition-all duration-[120ms] group-hover:translate-x-0.5 group-hover:opacity-100"
                    strokeWidth={1.75}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}
