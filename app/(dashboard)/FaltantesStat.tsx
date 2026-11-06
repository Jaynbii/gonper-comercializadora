'use client'

import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'

type Fila = {
  id: string
  nombre: string
  sku: string
  requerido: number
  stock: number
  faltante: number
}

export default function FaltantesStat({
  data,
  ordenesActivas,
}: {
  data: Fila[]
  ordenesActivas: number
}) {
  const [abierto, setAbierto] = useState(false)

  const conFaltante = data.filter((producto) => producto.faltante > 0)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="group w-full px-4 py-4 text-left transition-colors duration-[120ms] hover:bg-gonper-hover sm:px-5 lg:px-6 lg:py-5"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-h-[2.7em] text-[10px] font-medium uppercase leading-[1.35] tracking-[0.1em] text-gonper-muted sm:text-[10.5px] lg:text-[11px] lg:tracking-[0.13em]">
            Faltantes
          </p>
          <ArrowUpRight
            className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-gonper-muted opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 lg:block"
            strokeWidth={1.75}
          />
        </div>
        <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-gonper-warning lg:mt-2.5 lg:text-[34px]">
          {conFaltante.length}
        </p>
        <p className="mt-2 text-[10.5px] font-medium leading-tight text-gonper-primary sm:hidden">
          Ver detalle
        </p>
        <p className="mt-2 hidden text-[11.5px] leading-tight text-gonper-muted sm:block lg:text-[12.5px]">
          {conFaltante.length > 0 ? 'Según requisiciones activas' : 'Inventario suficiente'}
        </p>
      </button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Proyección de demanda"
        description={`${conFaltante.length} ${
          conFaltante.length === 1 ? 'producto' : 'productos'
        } · ${ordenesActivas} ${
          ordenesActivas === 1 ? 'requisición activa' : 'requisiciones activas'
        }`}
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
        {data.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13.5px] font-medium">Sin demanda pendiente</p>
            <p className="mt-1 text-[12.5px] text-gonper-muted">
              No hay requisiciones activas que requieran inventario.
            </p>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1fr)_5rem_5rem_5.5rem] gap-2 border-b border-gonper-border bg-gonper-surface px-5 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted sm:grid">
              <span>Producto</span>
              <span className="text-center">Requerido</span>
              <span className="text-center">En stock</span>
              <span className="text-center">Faltante</span>
            </div>

            <div className="divide-y divide-gonper-border">
              {data.map((producto) => (
                <div
                  key={producto.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3 transition-colors duration-[120ms] hover:bg-gonper-hover sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5.5rem] sm:items-center sm:gap-2 sm:py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {producto.nombre}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                      {producto.sku}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 sm:hidden">
                    <span className="text-[11.5px] text-gonper-muted">
                      Requerido{' '}
                      <span className="ml-1 text-[12.5px] font-medium text-gonper-text">
                        {producto.requerido}
                      </span>
                    </span>
                    <span className="text-[11.5px] text-gonper-muted">
                      Stock{' '}
                      <span className="ml-1 text-[12.5px] font-medium text-gonper-text">
                        {producto.stock}
                      </span>
                    </span>
                    <span className="text-[11.5px] text-gonper-muted">
                      Falta{' '}
                      <span
                        className={`ml-1 text-[12.5px] font-semibold ${
                          producto.faltante > 0
                            ? 'text-gonper-warning'
                            : 'text-gonper-muted'
                        }`}
                      >
                        {producto.faltante > 0 ? producto.faltante : '—'}
                      </span>
                    </span>
                  </div>

                  <div className="hidden text-center sm:block">
                    <span className="text-[13px]">{producto.requerido}</span>
                  </div>

                  <div className="hidden text-center sm:block">
                    <span className="text-[13px] text-gonper-muted">
                      {producto.stock}
                    </span>
                  </div>

                  <div className="hidden text-center sm:block">
                    <span
                      className={`text-[13px] font-semibold ${
                        producto.faltante > 0
                          ? 'text-gonper-warning'
                          : 'text-gonper-muted'
                      }`}
                    >
                      {producto.faltante > 0 ? producto.faltante : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
