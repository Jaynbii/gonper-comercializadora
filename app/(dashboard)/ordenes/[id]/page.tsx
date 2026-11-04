import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Package, TriangleAlert, ShoppingCart } from 'lucide-react'
import BotonSurtir from './BotonSurtir'
import EstadoBadge, { Badge } from '@/components/EstadoBadge'

type Producto = {
  nombre: string
  sku: string
  stock_actual: number | string
  unidad_medida: string | null
}

type ItemOrden = {
  id: string
  cantidad_solicitada: number | string
  cantidad_surtida: number | string | null
  estado_item: string | null
  unidad: string | null
  productos: Producto | Producto[] | null
}

type Orden = {
  id: string
  folio: string
  estado: string
  created_at: string
  clientes: { nombre: string } | { nombre: string }[] | null
  orden_items: ItemOrden[]
}

const numero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

const fecha = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
})

const productoDe = (item: ItemOrden): Producto | null =>
  Array.isArray(item.productos) ? item.productos[0] ?? null : item.productos

const nombreCliente = (clientes: Orden['clientes']) => {
  if (!clientes) return 'Cliente desconocido'
  return Array.isArray(clientes)
    ? clientes[0]?.nombre || 'Cliente desconocido'
    : clientes.nombre
}

export default async function OrdenDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ordenes')
    .select(
      `
      id, folio, estado, created_at,
      clientes (nombre),
      orden_items (
        id, cantidad_solicitada, cantidad_surtida, estado_item, unidad,
        productos (nombre, sku, stock_actual, unidad_medida)
      )
    `,
    )
    .eq('id', id)
    .single()

  if (error || !data) return notFound()

  const orden = data as unknown as Orden
  const items = orden.orden_items ?? []

  // Hay stock total solo si TODOS los artículos están cubiertos.
  const hayStockTotal =
    items.length > 0 &&
    items.every((item) => {
      const producto = productoDe(item)
      return (
        !!producto &&
        Number(producto.stock_actual) >= Number(item.cantidad_solicitada)
      )
    })

  const hayStockParcial = items.some(
    (item) => Number(productoDe(item)?.stock_actual) > 0,
  )

  // 👇 NUEVA VARIABLE: Detecta si falta al menos un artículo por surtir 👇
  const hayFaltantes = items.some(
    (item) => Number(productoDe(item)?.stock_actual) < Number(item.cantidad_solicitada)
  )

  const puedeSurtir =
    orden.estado !== 'ENTREGADA' &&
    orden.estado !== 'PARCIAL' &&
    orden.estado !== 'CANCELADA'

  return (
    <div className="mx-auto max-w-245 pb-6">
      <Link
        href="/ordenes"
        className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gonper-muted transition-colors duration-120 hover:text-gonper-primary"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        Volver a órdenes
      </Link>

      <header className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Requerimiento</p>
            <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.025em] sm:text-[28px]">
              {nombreCliente(orden.clientes)}
            </h1>
            <p className="mt-1.5 font-mono text-[11.5px] text-gonper-muted">
              {orden.folio}
            </p>
            <p className="mt-0.5 text-[12px] text-gonper-muted">
              {fecha.format(new Date(orden.created_at))}
            </p>
          </div>
          <div className="shrink-0">
            <EstadoBadge estado={orden.estado} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-gonper-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          
          {/* 👇 CONTENEDOR DE BOTONES MODIFICADO 👇 */}
          <div className="flex flex-col gap-2.5 w-full sm:w-auto">
            {puedeSurtir ? (
              hayStockParcial ? (
                <BotonSurtir ordenId={orden.id} esParcial={!hayStockTotal} />
              ) : (
                <Badge tono="danger">
                  <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Sin stock para surtir
                </Badge>
              )
            ) : (
              <p className="text-[12.5px] text-gonper-muted">
                {orden.estado === 'CANCELADA'
                  ? 'Esta orden está cancelada.'
                  : 'Esta orden ya fue surtida.'}
              </p>
            )}

            {/* 👇 NUEVO BOTÓN AGREGADO AQUÍ 👇 */}
            {puedeSurtir && hayFaltantes && (
              <Link
                href="/compras"
                className="btn btn-primary w-full sm:w-auto"
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                Comprar faltantes a Proveedores
              </Link>
            )}
          </div>

          {puedeSurtir && hayStockParcial && (
            <p className="text-[11.5px] leading-relaxed text-gonper-muted">
              Al surtir se descuenta el inventario automáticamente.
            </p>
          )}
        </div>
      </header>

      <section className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gonper-border px-5 py-3.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
            Cotejo de inventario
          </h2>
          <span className="text-[11.5px] text-gonper-muted">
            {items.length} {items.length === 1 ? 'artículo' : 'artículos'}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Package
              className="mx-auto h-6 w-6 text-gonper-muted"
              strokeWidth={1.5}
            />
            <p className="mt-2 text-[13px] font-medium">
              Esta orden todavía no tiene artículos
            </p>
            <p className="mt-1 text-[12px] text-gonper-muted">
              Procesa el PDF desde la lista de órdenes para capturarlos.
            </p>
          </div>
        ) : (
          <>
            <div className="stagger divide-y divide-gonper-border md:hidden">
              {items.map((item) => {
                const producto = productoDe(item)
                const solicitado = Number(item.cantidad_solicitada)
                const stock = Number(producto?.stock_actual) || 0
                const unidad = item.unidad || producto?.unidad_medida || ''
                const aSurtir = Math.min(stock, solicitado)
                const faltante = Math.max(0, solicitado - aSurtir)
                const surtido = Number(item.cantidad_surtida) || 0

                return (
                  <article key={item.id} className="min-w-0 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-semibold leading-snug">
                          {producto?.nombre || 'Producto eliminado'}
                        </h3>
                        <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                          {producto?.sku || '—'}
                        </p>
                      </div>
                      <Badge
                        tono={
                          faltante === 0
                            ? 'success'
                            : aSurtir > 0
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {faltante === 0
                          ? 'Completo'
                          : aSurtir > 0
                            ? 'Parcial'
                            : 'Sin stock'}
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gonper-border pt-3">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gonper-muted">
                          Solicitado
                        </p>
                        <p className="mt-1 text-[16px] font-semibold tabular-nums">
                          {numero.format(solicitado)}
                          {unidad && (
                            <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                              {unidad}
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
                            stock === 0 ? 'text-gonper-danger' : 'text-gonper-text'
                          }`}
                        >
                          {numero.format(stock)}
                          {unidad && (
                            <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                              {unidad}
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
                            faltante > 0
                              ? 'text-gonper-danger'
                              : 'text-gonper-success'
                          }`}
                        >
                          {numero.format(faltante)}
                          {unidad && (
                            <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                              {unidad}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {(orden.estado === 'ENTREGADA' ||
                      orden.estado === 'PARCIAL') && (
                      <p className="mt-2 flex items-center justify-between border-t border-gonper-border pt-2 text-[12px]">
                        <span className="text-gonper-muted">Surtido</span>
                        <span className="font-semibold tabular-nums">
                          {numero.format(surtido)} {unidad}
                        </span>
                      </p>
                    )}
                  </article>
                )
              })}
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
                    {(orden.estado === 'ENTREGADA' ||
                      orden.estado === 'PARCIAL') && (
                      <th className="px-4 py-3 text-center font-medium">
                        Surtido
                      </th>
                    )}
                    <th className="px-5 py-3 text-center font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gonper-border">
                  {items.map((item) => {
                    const producto = productoDe(item)
                    const solicitado = Number(item.cantidad_solicitada)
                    const stock = Number(producto?.stock_actual) || 0
                    const unidad = item.unidad || producto?.unidad_medida || ''
                    const aSurtir = Math.min(stock, solicitado)
                    const faltante = Math.max(0, solicitado - aSurtir)
                    const surtido = Number(item.cantidad_surtida) || 0

                    return (
                      <tr
                        key={item.id}
                        className="transition-colors duration-[120ms] hover:bg-gonper-hover"
                      >
                        <td className="px-5 py-3.5">
                          <p className="text-[13.5px] font-medium">
                            {producto?.nombre || 'Producto eliminado'}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                            {producto?.sku || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums">
                          {numero.format(solicitado)}
                          <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                            {unidad}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums ${
                            stock === 0 ? 'text-gonper-danger' : ''
                          }`}
                        >
                          {numero.format(stock)}
                          <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                            {unidad}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums ${
                            faltante > 0
                              ? 'text-gonper-danger'
                              : 'text-gonper-success'
                          }`}
                        >
                          {numero.format(faltante)}
                          <span className="ml-1 text-[10.5px] font-normal text-gonper-muted">
                            {unidad}
                          </span>
                        </td>
                        {(orden.estado === 'ENTREGADA' ||
                          orden.estado === 'PARCIAL') && (
                          <td className="px-4 py-3.5 text-center text-[13px] font-semibold tabular-nums">
                            {numero.format(surtido)}
                          </td>
                        )}
                        <td className="px-5 py-3.5 text-center">
                          <Badge
                            tono={
                              faltante === 0
                                ? 'success'
                                : aSurtir > 0
                                  ? 'warning'
                                  : 'danger'
                            }
                          >
                            {faltante === 0
                              ? 'Completo'
                              : aSurtir > 0
                                ? 'Parcial'
                                : 'Sin stock'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}