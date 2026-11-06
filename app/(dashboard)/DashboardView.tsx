import Link from 'next/link'
import { ArrowRight, ArrowUpRight, CheckCircle2, Inbox, Plus } from 'lucide-react'
import EstadoBadge from '@/components/EstadoBadge'
import FaltantesStat from './FaltantesStat'

export type UltimaOrden = {
  id: string
  folio: string
  estado: string
  created_at: string
  clientes: unknown
}

export type FilaProyeccion = {
  id: string
  nombre: string
  sku: string
  requerido: number
  stock: number
  faltante: number
}

type Props = {
  hoy: string
  pendientes: number
  parciales: number
  stockCritico: number
  totalProductos: number
  ultimasOrdenes: UltimaOrden[]
  proyeccion: FilaProyeccion[]
}

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

export default function DashboardView({
  hoy,
  pendientes,
  parciales,
  stockCritico,
  totalProductos,
  ultimasOrdenes,
  proyeccion,
}: Props) {
  const activas = pendientes + parciales
  const conFaltante = proyeccion.filter((producto) => producto.faltante > 0)

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11.5px] font-medium text-gonper-muted">{hoy}</p>
          <h1 className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[30px]">
            Resumen
          </h1>
        </div>

        <Link href="/ordenes/nueva" className="btn btn-primary self-start sm:self-auto">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Nueva requisición
        </Link>
      </header>

      <div
        className="animate-rise card mt-6 grid grid-cols-3 divide-x divide-gonper-border sm:mt-7"
        style={{ animationDelay: '40ms' }}
      >
        <Link
          href="/ordenes"
          className="group px-4 py-4 transition-colors duration-[120ms] hover:bg-gonper-hover sm:px-5 lg:px-6 lg:py-5"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-h-[2.7em] text-[10px] font-medium uppercase leading-[1.35] tracking-[0.1em] text-gonper-muted sm:text-[10.5px] lg:text-[11px] lg:tracking-[0.13em]">
              Requisiciones activas
            </p>
            <ArrowUpRight
              className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-gonper-muted opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 lg:block"
              strokeWidth={1.75}
            />
          </div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] lg:mt-2.5 lg:text-[34px]">
            {activas}
          </p>
          <p className="mt-2 text-[10.5px] leading-tight text-gonper-muted sm:hidden">
            Ver requisiciones
          </p>
          <p className="mt-2 hidden text-[11.5px] leading-tight text-gonper-muted sm:block lg:text-[12.5px]">
            {pendientes} pendientes · {parciales} parciales
          </p>
        </Link>

        <Link
          href="/inventario"
          className="group px-4 py-4 transition-colors duration-[120ms] hover:bg-gonper-hover sm:px-5 lg:px-6 lg:py-5"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-h-[2.7em] text-[10px] font-medium uppercase leading-[1.35] tracking-[0.1em] text-gonper-muted sm:text-[10.5px] lg:text-[11px] lg:tracking-[0.13em]">
              Stock bajo mínimo
            </p>
            <ArrowUpRight
              className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-gonper-muted opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 lg:block"
              strokeWidth={1.75}
            />
          </div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] lg:mt-2.5 lg:text-[34px]">
            {stockCritico}
          </p>
          <p className="mt-2 text-[10.5px] leading-tight text-gonper-muted sm:hidden">
            Ver inventario
          </p>
          <p className="mt-2 hidden text-[11.5px] leading-tight text-gonper-muted sm:block lg:text-[12.5px]">
            de {totalProductos} productos
          </p>
        </Link>

        <FaltantesStat data={proyeccion} ordenesActivas={activas} />
      </div>

      <div
        className="animate-rise mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
        style={{ animationDelay: '90ms' }}
      >
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-gonper-border px-5 py-3.5">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Últimas requisiciones</h2>
            <Link
              href="/ordenes"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-gonper-muted transition-colors duration-[120ms] hover:text-gonper-primary"
            >
              Ver todas
              <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
            </Link>
          </div>

          {ultimasOrdenes.length > 0 ? (
            <ul className="divide-y divide-gonper-border">
              {ultimasOrdenes.map((orden) => (
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
                        · {fechaCorta.format(new Date(orden.created_at))}
                      </p>
                    </div>

                    <EstadoBadge estado={orden.estado} />

                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-gonper-muted opacity-0 transition-all duration-[120ms] group-hover:translate-x-0.5 group-hover:opacity-100"
                      strokeWidth={1.75}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Inbox className="h-6 w-6 text-gonper-muted" strokeWidth={1.5} />
              <p className="mt-3 text-[13.5px] font-medium">Todavía no hay requisiciones</p>
              <p className="mt-1 max-w-[34ch] text-[12.5px] text-gonper-muted">
                Sube la primera requisición para empezar a surtir.
              </p>
              <Link href="/ordenes/nueva" className="btn btn-quiet mt-4">
                Subir requisición
              </Link>
            </div>
          )}
        </section>

        <section className="card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-gonper-border px-5 py-3.5">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Requiere atención</h2>
            <span className="text-[11.5px] font-medium text-gonper-muted">
              {conFaltante.length} con faltante
            </span>
          </div>

          {conFaltante.length > 0 ? (
            <ul className="flex-1 divide-y divide-gonper-border">
              {conFaltante.slice(0, 5).map((producto) => (
                <li
                  key={producto.id}
                  className="flex items-baseline justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px]">{producto.nombre}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                      {producto.sku}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-gonper-warning">
                    {producto.faltante}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
              <CheckCircle2
                className="h-6 w-6 text-gonper-success"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-[13.5px] font-medium">Todo cubierto</p>
              <p className="mt-1 max-w-[32ch] text-[12.5px] text-gonper-muted">
                No hay faltantes contra las requisiciones activas.
              </p>
            </div>
          )}

          <div className="border-t border-gonper-border px-5 py-3">
            <Link
              href="/compras"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-gonper-primary transition-opacity duration-[120ms] hover:opacity-70"
            >
              Preparar compra
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
