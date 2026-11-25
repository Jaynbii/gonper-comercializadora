// Cotejo de inventario con filtros por artículo (Alex, 2026-11-24):
// buscador por nombre o SKU + filtros por estado (Todos, Sin stock,
// Parcial, Completo, Surtidos). La lista — tarjetas en móvil, tabla
// en escritorio — se filtra en el cliente; los números de cada fila
// ya vienen calculados del servidor (`estadoCotejoItem`). El sello
// SURTIDA se conserva: los filtros quedan fuera del sello y la lista
// dentro, como antes.
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Search } from 'lucide-react'
import { Badge } from '@/components/EstadoBadge'
import CotejoSurtido from './CotejoSurtido'
import EditarArticulosModal from './EditarArticulosModal'
import {
  FILTROS_COTEJO,
  filtrarCotejo,
  type FilaCotejo,
  type FiltroCotejo,
} from '@/utils/filtroCotejo'
import type { FilaEdicion } from '@/utils/editarItemsOrden'
import type { ProductoCatalogo } from '@/utils/vincularProductos'

const numero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

const TONO_ESTADO = {
  completo: 'success',
  parcial: 'warning',
  'sin-stock': 'danger',
  'sin-surtir': 'neutral',
} as const

const ETIQUETA_ESTADO = {
  completo: 'Completo',
  parcial: 'Parcial',
  'sin-stock': 'Sin stock',
  'sin-surtir': 'Sin surtir',
} as const

export default function CotejoArticulos({
  filas,
  muestraSurtido,
  surtida,
  ordenId,
  catalogo,
  filasEdicion,
  editable,
  motivoNoEditable,
}: {
  filas: FilaCotejo[]
  muestraSurtido: boolean
  surtida: boolean
  ordenId: string
  catalogo: ProductoCatalogo[]
  filasEdicion: FilaEdicion[]
  editable: boolean
  motivoNoEditable: string
}) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroCotejo>('todos')
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false)
  const visibles = useMemo(
    () => filtrarCotejo(filas, busqueda, filtro),
    [filas, busqueda, filtro],
  )
  const filtrando = busqueda.trim() !== '' || filtro !== 'todos'
  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltro('todos')
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-gonper-border px-5 py-3.5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
          Cotejo de inventario
        </h2>
        <span className="flex items-center gap-2">
          {surtida && <Badge tono="success">Surtida</Badge>}
          <span className="text-[11.5px] text-gonper-muted">
            {filtrando
              ? `${visibles.length} de ${filas.length} artículos`
              : `${filas.length} ${filas.length === 1 ? 'artículo' : 'artículos'}`}
          </span>
        </span>
      </div>

      <div className="space-y-3 border-b border-gonper-border px-5 py-3.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gonper-muted"
            strokeWidth={1.75}
          />
          <input
            type="search"
            placeholder="Buscar artículo o SKU"
            className="field pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar artículo"
          />
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filtrar artículos"
        >
          {FILTROS_COTEJO.map((f) => {
            const activo = filtro === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                aria-pressed={activo}
                className={`flex min-h-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-[12.5px] font-medium transition-colors duration-[120ms] ${
                  activo
                    ? 'border-gonper-primary bg-gonper-primary text-gonper-on-primary'
                    : 'border-gonper-border bg-gonper-surface text-gonper-muted hover:text-gonper-text'
                }`}
              >
                {f.etiqueta}
              </button>
            )
          })}
        </div>
        {editable ? (
          <button
            type="button"
            onClick={() => setModalEditarAbierto(true)}
            className="btn btn-quiet w-full justify-center"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
            Editar artículos
          </button>
        ) : (
          <p className="text-[12px] text-gonper-muted">{motivoNoEditable}</p>
        )}
      </div>

      <EditarArticulosModal
        open={modalEditarAbierto}
        onClose={() => setModalEditarAbierto(false)}
        onGuardado={() => {
          setModalEditarAbierto(false)
          router.refresh()
        }}
        ordenId={ordenId}
        filas={filasEdicion}
        catalogo={catalogo}
      />

      <CotejoSurtido surtida={surtida}>
        {visibles.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] font-medium">
              Sin resultados
              {busqueda.trim() !== '' ? ` para «${busqueda.trim()}»` : ''}
            </p>
            <p className="mt-1 text-[12px] text-gonper-muted">
              Prueba con otro nombre, SKU o filtro.
            </p>
            <button
              type="button"
              onClick={limpiarFiltros}
              className="btn btn-quiet mt-4"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gonper-border md:hidden">
              {visibles.map((fila) => (
                <article key={fila.id} className="min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold leading-snug">
                        {fila.nombre}
                      </h3>
                      <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                        {fila.sku || '—'}
                      </p>
                    </div>
                    <Badge tono={TONO_ESTADO[fila.estado]}>
                      {ETIQUETA_ESTADO[fila.estado]}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gonper-border pt-3">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gonper-muted">
                        Solicitado
                      </p>
                      <p className="mt-1 text-[16px] font-semibold tabular-nums">
                        {numero.format(fila.solicitado)}
                        {fila.unidad && (
                          <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                            {fila.unidad}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gonper-muted">
                        En stock
                      </p>
                      <p
                        className={`mt-1 text-[16px] font-semibold tabular-nums ${
                          fila.stock === 0
                            ? 'text-gonper-danger'
                            : 'text-gonper-text'
                        }`}
                      >
                        {numero.format(fila.stock)}
                        {fila.unidad && (
                          <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                            {fila.unidad}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gonper-muted">
                        Faltante
                      </p>
                      <p
                        className={`mt-1 text-[16px] font-semibold tabular-nums ${
                          fila.faltante > 0
                            ? 'text-gonper-danger'
                            : 'text-gonper-success'
                        }`}
                      >
                        {numero.format(fila.faltante)}
                        {fila.unidad && (
                          <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                            {fila.unidad}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {muestraSurtido && (
                    <p className="mt-2 flex items-center justify-between border-t border-gonper-border pt-2 text-[12px]">
                      <span className="text-gonper-muted">Surtido</span>
                      <span className="font-semibold tabular-nums">
                        {numero.format(fila.surtido)} {fila.unidad}
                      </span>
                    </p>
                  )}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-gonper-border bg-gonper-bg/60 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
                    <th className="px-5 py-3 font-medium">Artículo</th>
                    <th className="px-4 py-3 text-center font-medium">
                      Solicitado
                    </th>
                    <th className="px-4 py-3 text-center font-medium">
                      En stock
                    </th>
                    <th className="px-4 py-3 text-center font-medium">
                      Faltante
                    </th>
                    {muestraSurtido && (
                      <th className="px-4 py-3 text-center font-medium">
                        Surtido
                      </th>
                    )}
                    <th className="px-5 py-3 text-center font-medium">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gonper-border">
                  {visibles.map((fila) => (
                    <tr
                      key={fila.id}
                      className="transition-colors duration-[120ms] hover:bg-gonper-hover"
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-[13.5px] font-medium">
                          {fila.nombre}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                          {fila.sku || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums">
                        {numero.format(fila.solicitado)}
                        <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                          {fila.unidad}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums ${
                          fila.stock === 0 ? 'text-gonper-danger' : ''
                        }`}
                      >
                        {numero.format(fila.stock)}
                        <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                          {fila.unidad}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums ${
                          fila.faltante > 0
                            ? 'text-gonper-danger'
                            : 'text-gonper-success'
                        }`}
                      >
                        {numero.format(fila.faltante)}
                        <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                          {fila.unidad}
                        </span>
                      </td>
                      {muestraSurtido && (
                        <td className="px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums">
                          {numero.format(fila.surtido)}
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-center">
                        <Badge tono={TONO_ESTADO[fila.estado]}>
                          {ETIQUETA_ESTADO[fila.estado]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CotejoSurtido>
    </>
  )
}
