'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  Package,
  ReceiptText,
  ShoppingCart,
  Truck,
  X,
  ArrowUpRight,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { Badge } from '@/components/EstadoBadge'
import { generarOrdenCompra, recibirMercancia } from './actions'
import {
  agruparCompraPorProveedor,
  consolidarFaltantesSeleccionados,
  type FaltantePorOrden,
} from '@/utils/faltantesPorOrden'

type Proveedor = {
  id: string
  nombre: string
  producto_proveedores?: {
    producto_id: string
    precio_unitario: number | string
  }[]
}

type Faltante = {
  id: string
  nombre: string
  sku: string
  unidad_medida: string | null
  faltante: number
}

type ItemCompra = {
  id: string
  cantidad_solicitada: number | string
  cantidad_recibida: number | string
  productos?: {
    id: string
    nombre: string
    sku: string
    unidad_medida: string | null
  } | null
}

type Requisicion = {
  id: string
  folio: string
  estado: string
  created_at: string
  clientes?: { nombre: string } | null
}

type OrdenCompra = {
  id: string
  folio: string
  estado: string
  total_estimado: number | string
  created_at: string
  proveedores?: { nombre: string } | null
  orden_compra_items?: ItemCompra[]
}

const moneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

const numero = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 2,
})

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function PorOrdenCards({
  ordenes,
  seleccionadas,
  onToggle,
  onComprar,
  comprandoId,
}: {
  ordenes: FaltantePorOrden[]
  seleccionadas: string[]
  onToggle: (ordenId: string) => void
  onComprar: (orden: FaltantePorOrden) => void
  comprandoId: string | null
}) {
  if (ordenes.length === 0) {
    return (
      <div className="card mt-4">
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" strokeWidth={1.5} />}
          title="Sin requisiciones activas"
          description="No hay requisiciones pendientes o parciales por surtir."
        />
      </div>
    )
  }

  return (
    <div className="stagger mt-4 grid grid-cols-1 gap-3">
      {ordenes.map((orden) => {
        const seleccionada = seleccionadas.includes(orden.ordenId)
        return (
          <article
            key={orden.ordenId}
            className={`card p-4 ${
              seleccionada ? 'ring-2 ring-gonper-primary' : ''
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[14.5px] font-semibold tracking-[-0.01em]">
                    {orden.clienteNombre}
                  </h2>
                  <Badge tono={orden.estado === 'PARCIAL' ? 'warning' : 'warning'}>
                    {orden.estado === 'PARCIAL' ? 'Parcial' : 'Pendiente'}
                  </Badge>
                  <span className="rounded bg-gonper-surface-muted px-1.5 py-0.5 text-[12px] font-semibold text-gonper-text">
                    {orden.folio}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-gonper-muted">
                  {fecha.format(new Date(orden.createdAt))} · Se puede surtir
                  el{' '}
                  <span className="font-semibold text-gonper-text">
                    {orden.porcentajeSurtible}%
                  </span>{' '}
                  con el stock actual
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium">
                  <input
                    type="checkbox"
                    checked={seleccionada}
                    onChange={() => onToggle(orden.ordenId)}
                    aria-label={`Seleccionar requisición ${orden.folio} para comprar su faltante`}
                  />
                  Elegir para comprar
                </label>
                <Link
                  href={`/ordenes/${orden.ordenId}`}
                  className="btn btn-primary shrink-0"
                >
                  Ir a surtir esta requisición
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
              </div>
            </div>

            {orden.faltantes.length === 0 ? (
              <p className="mt-3 border-t border-gonper-border pt-3 text-[12.5px] text-gonper-success">
                Sin faltantes: esta requisición se puede surtir completa con el
                stock actual.
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-2 border-t border-gonper-border pt-3">
                  {orden.faltantes.map((item) => (
                    <li
                      key={item.productoId}
                      className="flex flex-col gap-1 text-[12.5px] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{item.nombre}</span>{' '}
                        <span className="text-gonper-muted">
                          · Faltan {numero.format(item.faltante)}{' '}
                          {item.unidadMedida || ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-gonper-muted">
                        {item.proveedorSugerido
                          ? `${item.proveedorSugerido.proveedorNombre} · ${moneda.format(item.proveedorSugerido.precioUnitario)} c/u`
                          : 'sin precio, pedir por WhatsApp'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-gonper-border pt-2 text-right text-[12px] text-gonper-muted">
                  Costo estimado del faltante{' '}
                  <span className="text-[13px] font-semibold tabular-nums text-gonper-text">
                    {moneda.format(orden.costoEstimadoTotal)}
                  </span>
                  {orden.tieneSinPrecio && (
                    <span className="block text-[11.5px]">
                      Hay artículos sin precio registrado: el total es parcial.
                    </span>
                  )}
                </p>
                <div className="mt-3 flex flex-col gap-2 border-t border-gonper-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11.5px] text-gonper-muted">
                    Compra solo el faltante de esta requisición, con el
                    proveedor sugerido de cada artículo.
                  </p>
                  <button
                    type="button"
                    onClick={() => onComprar(orden)}
                    disabled={comprandoId === orden.ordenId}
                    className="btn btn-primary shrink-0"
                  >
                    <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                    {comprandoId === orden.ordenId
                      ? 'Generando compras…'
                      : 'Comprar faltante de esta requisición'}
                  </button>
                </div>
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}

export default function ComprasClient({
  faltantes,
  proveedores,
  ordenesCompra,
  requisiciones,
  faltantesPorOrden,
  ordenIdInicial,
}: {
  faltantes: Faltante[]
  proveedores: Proveedor[]
  ordenesCompra: OrdenCompra[]
  requisiciones: Requisicion[]
  faltantesPorOrden: FaltantePorOrden[]
  ordenIdInicial?: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'sugerencias' | 'ordenes'>('sugerencias')

  // Fase 1 — Vista por requisición: si se llega con ?orden=<id> (desde el
  // detalle de una requisición), se abre directamente en "Por requisición" con
  // esa card seleccionada.
  const ordenInicialValida =
    ordenIdInicial &&
    faltantesPorOrden.some((orden) => orden.ordenId === ordenIdInicial)
      ? ordenIdInicial
      : undefined
  const [vista, setVista] = useState<'general' | 'por-orden'>(
    ordenInicialValida ? 'por-orden' : 'general',
  )
  const [ordenesSeleccionadas, setOrdenesSeleccionadas] = useState<string[]>(
    ordenInicialValida ? [ordenInicialValida] : [],
  )

  const toggleOrdenSeleccionada = (ordenId: string) => {
    setErrorMsg('')
    setOrdenesSeleccionadas((prev) => {
      if (prev.includes(ordenId)) {
        return prev.filter((id) => id !== ordenId)
      }
      if (prev.length >= 2) {
        setErrorMsg(
          'Solo puedes elegir hasta 2 requisiciones a la vez para no comprar de más.',
        )
        return prev
      }
      return [...prev, ordenId]
    })
    // La selección cambia el faltante consolidado, así que se limpian
    // los productos ya elegidos para comprar y se vuelve a elegir.
    setItemsSeleccionados({})
  }

  // Fase 1 — El faltante consolidado se recalcula solo para las
  // requisiciones seleccionadas (máx. 2). El stock se descuenta una sola
  // vez por producto, no una vez por requisición.
  const faltantesAMostrar: Faltante[] = (() => {
    if (ordenesSeleccionadas.length === 0) return faltantes
    const seleccionadas = faltantesPorOrden.filter((orden) =>
      ordenesSeleccionadas.includes(orden.ordenId),
    )
    const productosMap = new Map(
      seleccionadas
        .flatMap((orden) => orden.demanda)
        .map((d) => [d.productoId, d.enStock] as const),
    )
    const consolidado = consolidarFaltantesSeleccionados({
      ordenes: seleccionadas.map((orden) => ({
        items: orden.demanda.map((d) => ({
          productoId: d.productoId,
          cantidadSolicitada: d.pendiente,
          cantidadSurtida: 0,
        })),
      })),
      productos: new Map(
        [...productosMap.entries()].map(([id, stockActual]) => [
          id,
          { id, nombre: '', sku: '', unidadMedida: null, stockActual },
        ]),
      ),
    })
    const porId = new Map(consolidado.map((f) => [f.productoId, f.faltante]))
    return faltantes
      .filter((f) => porId.has(f.id))
      .map((f) => ({ ...f, faltante: porId.get(f.id) ?? f.faltante }))
  })()

  const [itemsSeleccionados, setItemsSeleccionados] = useState<
    Record<string, { proveedorId: string; cantidad: number; precio: number }>
  >({})
  const [generandoProveedor, setGenerandoProveedor] = useState<string | null>(
    null,
  )

  const [ordenActiva, setOrdenActiva] = useState<OrdenCompra | null>(null)
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<
    Record<string, number>
  >({})
  const [isReceiving, setIsReceiving] = useState(false)
  const [errorRecepcion, setErrorRecepcion] = useState('')

  const [mensaje, setMensaje] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSelectProveedor = (
    productoId: string,
    proveedorId: string,
    faltante: number,
  ) => {
    if (!proveedorId) {
      setItemsSeleccionados((prev) => {
        const nuevos = { ...prev }
        delete nuevos[productoId]
        return nuevos
      })
      return
    }

    const proveedor = proveedores.find((item) => item.id === proveedorId)
    const relacion = (proveedor?.producto_proveedores || []).find(
      (item) => item.producto_id === productoId,
    )

    setItemsSeleccionados((prev) => ({
      ...prev,
      [productoId]: {
        proveedorId,
        cantidad: prev[productoId]?.cantidad ?? faltante,
        precio: Number(relacion?.precio_unitario) || 0,
      },
    }))
  }

  const handleCantidad = (productoId: string, cantidad: number) => {
    setItemsSeleccionados((prev) => {
      if (!prev[productoId]) return prev
      return {
        ...prev,
        [productoId]: { ...prev[productoId], cantidad },
      }
    })
  }

  const handleGenerarTodas = async () => {
    if (proveedoresSeleccionados.length === 0) {
      setErrorMsg('Selecciona al menos un producto y su proveedor.')
      return
    }

    setGenerandoProveedor('todos')
    setMensaje('')
    setErrorMsg('')

    const generadas: string[] = []
    const productosGenerados: string[] = []
    const errores: string[] = []

    for (const proveedorId of proveedoresSeleccionados) {
      const itemsDelProveedor = Object.entries(itemsSeleccionados)
        .filter(([, data]) => data.proveedorId === proveedorId)
        .map(([productoId, data]) => ({
          producto_id: productoId,
          cantidad: data.cantidad,
          precio: data.precio,
        }))

      if (itemsDelProveedor.length === 0) continue

      const proveedor = proveedores.find((item) => item.id === proveedorId)
      try {
        const res = await generarOrdenCompra(proveedorId, itemsDelProveedor)
        generadas.push(res.folio)
        productosGenerados.push(...itemsDelProveedor.map((item) => item.producto_id))
      } catch (error) {
        const detalle = error instanceof Error ? error.message : 'No se pudo generar la orden de compra.'
        errores.push((proveedor?.nombre || 'Proveedor') + ': ' + detalle)
      }
    }

    if (productosGenerados.length > 0) {
      setItemsSeleccionados((prev) => {
        const nuevos = { ...prev }
        productosGenerados.forEach((productoId) => delete nuevos[productoId])
        return nuevos
      })
      router.refresh()
    }

    if (errores.length > 0) {
      const resumen = generadas.length > 0
        ? 'Se generaron ' + generadas.length + ' órdenes de compra (' + generadas.join(', ') + '). '
        : ''
      setErrorMsg(resumen + 'Errores: ' + errores.join(' | '))
    } else if (generadas.length > 0) {
      setMensaje('Compras generadas: ' + generadas.join(', ') + '.')
    }

    setGenerandoProveedor(null)
  }

  // Fase 1b — Comprar el faltante de UNA requisición desde su card.
  // Agrupa por proveedor sugerido y genera una orden de compra por
  // proveedor, solo con artículos con precio. Los sin precio NO se
  // compran: se avisan en el diálogo para pedirlos por WhatsApp.
  const [requisicionAComprar, setRequisicionAComprar] =
    useState<FaltantePorOrden | null>(null)
  const [comprandoRequisicionId, setComprandoRequisicionId] = useState<
    string | null
  >(null)
  const [errorCompra, setErrorCompra] = useState('')

  const compraRequisicion = requisicionAComprar
    ? agruparCompraPorProveedor(requisicionAComprar.faltantes)
    : null

  const abrirCompraRequisicion = (orden: FaltantePorOrden) => {
    if (orden.faltantes.length === 0) return
    setErrorCompra('')
    setRequisicionAComprar(orden)
  }

  const confirmarCompraRequisicion = async () => {
    if (!requisicionAComprar || !compraRequisicion) return
    const { grupos, sinPrecio } = compraRequisicion
    if (grupos.length === 0) {
      setErrorCompra(
        'Ningún artículo tiene precio registrado: pídelos por WhatsApp. No se generó ninguna compra.',
      )
      return
    }

    setComprandoRequisicionId(requisicionAComprar.ordenId)
    setErrorCompra('')
    setMensaje('')

    const generadas: string[] = []
    const errores: string[] = []
    for (const grupo of grupos) {
      try {
        const res = await generarOrdenCompra(
          grupo.proveedorId,
          grupo.items.map((item) => ({
            producto_id: item.productoId,
            cantidad: item.cantidad,
            precio: item.precioUnitario,
          })),
        )
        generadas.push(`${grupo.proveedorNombre} (${res.folio})`)
      } catch (error) {
        const detalle =
          error instanceof Error
            ? error.message
            : 'No se pudo generar la orden de compra.'
        errores.push(`${grupo.proveedorNombre}: ${detalle}`)
      }
    }

    setComprandoRequisicionId(null)

    if (generadas.length > 0) {
      const avisoSinPrecio =
        sinPrecio.length > 0
          ? ` ${sinPrecio.length} ${
              sinPrecio.length === 1 ? 'artículo' : 'artículos'
            } sin precio no se compraron (${sinPrecio
              .map((item) => item.nombre)
              .join(', ')}): pídelos por WhatsApp.`
          : ''
      setMensaje(
        `Compras generadas para ${requisicionAComprar.folio}: ${generadas.join(', ')}.${avisoSinPrecio}`,
      )
      setRequisicionAComprar(null)
      router.refresh()
    }
    if (errores.length > 0) {
      setErrorCompra(
        (generadas.length > 0
          ? 'Se generaron algunas compras. '
          : 'No se pudo generar la compra. ') +
          'Errores: ' +
          errores.join(' | '),
      )
    }
  }

  const abrirRecepcion = (orden: OrdenCompra) => {
    setOrdenActiva(orden)
    setErrorRecepcion('')
    const inicial: Record<string, number> = {}
    ;(orden.orden_compra_items || []).forEach((item) => {
      inicial[item.id] = Number(item.cantidad_solicitada)
    })
    setCantidadesRecibidas(inicial)
  }

  const handleRecibir = async () => {
    if (!ordenActiva) return

    const itemsAEntregar = (ordenActiva.orden_compra_items || [])
      .map((item) => ({
        id: item.id,
        producto_id: item.productos?.id,
        cantidad_recibida: cantidadesRecibidas[item.id] || 0,
      }))
      .filter((item) => item.cantidad_recibida > 0 && item.producto_id)

    if (itemsAEntregar.length === 0) {
      setErrorRecepcion('Ingresa al menos una cantidad recibida.')
      return
    }

    setIsReceiving(true)
    setErrorRecepcion('')

    try {
      await recibirMercancia(
        ordenActiva.id,
        itemsAEntregar as Parameters<typeof recibirMercancia>[1],
      )
      setMensaje(`Mercancía de ${ordenActiva.folio} recibida y stock actualizado.`)
      setOrdenActiva(null)
      router.refresh()
    } catch (error) {
      setErrorRecepcion(
        error instanceof Error ? error.message : 'No se pudo recibir la mercancía.',
      )
    } finally {
      setIsReceiving(false)
    }
  }

  const seleccionados = Object.keys(itemsSeleccionados).length
  const proveedoresSeleccionados = Array.from(
    new Set(Object.values(itemsSeleccionados).map((item) => item.proveedorId)),
  )

  return (
    <div className="mx-auto max-w-[1180px] pb-6">
      <PageHeader
        eyebrow={`${faltantesAMostrar.length} ${
          faltantesAMostrar.length === 1 ? 'producto por reponer' : 'productos por reponer'
        }`}
        title="Compras"
      />

      <div className="mt-5 flex w-full rounded-[6px] border border-gonper-border bg-gonper-surface p-1 sm:inline-flex sm:w-auto">
        <button
          type="button"
          onClick={() => setTab('sugerencias')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-[4px] px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-[120ms] sm:flex-none ${
            tab === 'sugerencias'
              ? 'bg-gonper-primary text-white'
              : 'text-gonper-muted hover:text-gonper-text'
          }`}
        >
          Sugerencias
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums ${
              tab === 'sugerencias'
                ? 'bg-white/15 text-white'
                : 'bg-gonper-surface-muted text-gonper-muted'
            }`}
          >
            {faltantesAMostrar.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('ordenes')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-[4px] px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-[120ms] sm:flex-none ${
            tab === 'ordenes'
              ? 'bg-gonper-primary text-white'
              : 'text-gonper-muted hover:text-gonper-text'
          }`}
        >
          Órdenes de compra
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums ${
              tab === 'ordenes'
                ? 'bg-white/15 text-white'
                : 'bg-gonper-surface-muted text-gonper-muted'
            }`}
          >
            {ordenesCompra.length}
          </span>
        </button>
      </div>

      {(mensaje || errorMsg) && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-[6px] border px-3.5 py-3 text-[12.5px] ${
            mensaje
              ? 'border-gonper-success-border bg-gonper-success-bg text-gonper-success'
              : 'border-gonper-danger-border bg-gonper-danger-bg text-gonper-danger'
          }`}
        >
          {mensaje ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          )}
          <p className="flex-1">{mensaje || errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              setMensaje('')
              setErrorMsg('')
            }}
            className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <section className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold tracking-[-0.01em]">
              Requisiciones pendientes de surtir
            </p>
            <p className="mt-0.5 text-[11.5px] text-gonper-muted">
              Acceso directo a las requisiciones de tus clientes.
            </p>
          </div>
          <Badge tono={requisiciones.length > 0 ? 'warning' : 'success'}>
            {requisiciones.length}
          </Badge>
        </div>

        {requisiciones.length === 0 ? (
          <div className="card px-4 py-5">
            <p className="text-[12.5px] text-gonper-muted">
              No hay requisiciones pendientes de surtir.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {requisiciones.map((requisicion) => (
              <article
                key={requisicion.id}
                className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[13.5px] font-semibold">
                      {requisicion.clientes?.nombre || 'Cliente desconocido'}
                    </h2>
                    <Badge tono="warning">
                      {requisicion.estado === 'PARCIAL' ? 'Parcial' : 'Pendiente'}
                    </Badge>
                    <span className="rounded bg-gonper-surface-muted px-1.5 py-0.5 text-[12px] font-semibold text-gonper-text">
                      {requisicion.folio}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-gonper-muted">
                    Requisición · {fecha.format(new Date(requisicion.created_at))}
                  </p>
                </div>
                <Link
                  href={`/ordenes/${requisicion.id}`}
                  className="btn btn-quiet shrink-0"
                >
                  Abrir requisición
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      {tab === 'sugerencias' && (
        <div key="sugerencias" className="animate-fade mt-4">
          {/* Fase 1 — General: faltante consolidado de todas las requisiciones.
              Por requisición: una card por requisición activa para elegir cuáles
              surtir hoy (máx. 2 seleccionadas). */}
          <div className="flex w-full rounded-[6px] border border-gonper-border bg-gonper-surface p-1 sm:inline-flex sm:w-auto">
            <button
              type="button"
              onClick={() => setVista('general')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-[4px] px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-[120ms] sm:flex-none ${
                vista === 'general'
                  ? 'bg-gonper-primary text-white'
                  : 'text-gonper-muted hover:text-gonper-text'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setVista('por-orden')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-[4px] px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-[120ms] sm:flex-none ${
                vista === 'por-orden'
                  ? 'bg-gonper-primary text-white'
                  : 'text-gonper-muted hover:text-gonper-text'
              }`}
            >
              Por requisición
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums ${
                  vista === 'por-orden'
                    ? 'bg-white/15 text-white'
                    : 'bg-gonper-surface-muted text-gonper-muted'
                }`}
              >
                {faltantesPorOrden.length}
              </span>
            </button>
          </div>

          {ordenesSeleccionadas.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-[6px] border border-gonper-warning-border bg-gonper-warning-bg px-3.5 py-3 text-[12.5px] text-gonper-warning sm:flex-row sm:items-center sm:justify-between">
              <p>
                Faltante calculado solo para{' '}
                <span className="font-semibold">
                  {ordenesSeleccionadas.length === 1
                    ? '1 requisición seleccionada'
                    : '2 requisiciones seleccionadas'}
                </span>
                . Cambia a la vista General para comprar solo eso.
              </p>
              <button
                type="button"
                onClick={() => {
                  setOrdenesSeleccionadas([])
                  setItemsSeleccionados({})
                }}
                className="btn btn-quiet shrink-0"
              >
                Limpiar selección
              </button>
            </div>
          )}

          {vista === 'por-orden' ? (
            <PorOrdenCards
              ordenes={faltantesPorOrden}
              seleccionadas={ordenesSeleccionadas}
              onToggle={toggleOrdenSeleccionada}
              onComprar={abrirCompraRequisicion}
              comprandoId={comprandoRequisicionId}
            />
          ) : faltantesAMostrar.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<CheckCircle2 className="h-6 w-6" strokeWidth={1.5} />}
                title="Sin faltantes"
                description="El inventario cubre la demanda de las requisiciones activas."
              />
            </div>
          ) : (
            <>
              <div className="stagger grid grid-cols-1 gap-3 md:hidden">
                {faltantesAMostrar.map((producto) => {
                  const seleccion = itemsSeleccionados[producto.id]
                  const opciones = proveedores.filter((proveedor) =>
                    (proveedor.producto_proveedores || []).some(
                      (relacion) => relacion.producto_id === producto.id,
                    ),
                  )

                  return (
                    <article key={producto.id} className="card min-w-0 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-[14.5px] font-semibold leading-snug tracking-[-0.01em]">
                            {producto.nombre}
                          </h2>
                          <p className="mt-1 font-mono text-[11.5px] text-gonper-muted">
                            {producto.sku}
                          </p>
                        </div>
                        <Badge tono="warning">
                          Faltan {numero.format(producto.faltante)}
                          {producto.unidad_medida
                            ? ` ${producto.unidad_medida}`
                            : ''}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="field-label"
                            htmlFor={`prov-${producto.id}`}
                          >
                            Proveedor
                          </label>
                          <select
                            id={`prov-${producto.id}`}
                            className="field"
                            value={seleccion?.proveedorId || ''}
                            onChange={(e) =>
                              handleSelectProveedor(
                                producto.id,
                                e.target.value,
                                producto.faltante,
                              )
                            }
                          >
                            <option value="">Selecciona proveedor</option>
                            {opciones.map((proveedor) => {
                              const relacion = (
                                proveedor.producto_proveedores || []
                              ).find(
                                (item) => item.producto_id === producto.id,
                              )
                              return (
                                <option key={proveedor.id} value={proveedor.id}>
                                  {proveedor.nombre} ·{' '}
                                  {moneda.format(
                                    Number(relacion?.precio_unitario) || 0,
                                  )}
                                </option>
                              )
                            })}
                          </select>
                        </div>

                        <div>
                          <label
                            className="field-label"
                            htmlFor={`cant-${producto.id}`}
                          >
                            Cantidad a pedir
                          </label>
                          <input
                            id={`cant-${producto.id}`}
                            type="number"
                            min="1"
                            step="0.01"
                            className="field tabular-nums"
                            value={seleccion?.cantidad ?? producto.faltante}
                            onChange={(e) =>
                              handleCantidad(producto.id, Number(e.target.value))
                            }
                            disabled={!seleccion}
                          />
                        </div>
                      </div>

                      {seleccion && (
                        <p className="mt-3 border-t border-gonper-border pt-2 text-right text-[12px] text-gonper-muted">
                          Subtotal{' '}
                          <span className="text-[13px] font-semibold tabular-nums text-gonper-text">
                            {moneda.format(seleccion.precio * seleccion.cantidad)}
                          </span>
                        </p>
                      )}
                    </article>
                  )
                })}
              </div>

              <div className="mt-5 hidden overflow-hidden rounded-[8px] border border-gonper-border bg-gonper-surface md:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gonper-border bg-gonper-bg/60 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
                      <th className="px-5 py-3 font-medium">Producto</th>
                      <th className="px-5 py-3 text-center font-medium">
                        Faltante
                      </th>
                      <th className="px-5 py-3 font-medium">Proveedor y precio</th>
                      <th className="px-5 py-3 text-center font-medium">
                        Cantidad
                      </th>
                      <th className="px-5 py-3 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gonper-border">
                    {faltantesAMostrar.map((producto) => {
                      const seleccion = itemsSeleccionados[producto.id]
                      const opciones = proveedores.filter((proveedor) =>
                        (proveedor.producto_proveedores || []).some(
                          (relacion) => relacion.producto_id === producto.id,
                        ),
                      )

                      return (
                        <tr
                          key={producto.id}
                          className="transition-colors duration-[120ms] hover:bg-gonper-hover"
                        >
                          <td className="px-5 py-3">
                            <p className="text-[13.5px] font-medium">
                              {producto.nombre}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                              {producto.sku}
                            </p>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <Badge tono="warning">
                              {numero.format(producto.faltante)}
                              {producto.unidad_medida
                                ? ` ${producto.unidad_medida}`
                                : ''}
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            <select
                              className="field h-10"
                              value={seleccion?.proveedorId || ''}
                              onChange={(e) =>
                                handleSelectProveedor(
                                  producto.id,
                                  e.target.value,
                                  producto.faltante,
                                )
                              }
                              aria-label={`Proveedor para ${producto.nombre}`}
                            >
                              <option value="">Selecciona proveedor</option>
                              {opciones.map((proveedor) => {
                                const relacion = (
                                  proveedor.producto_proveedores || []
                                ).find(
                                  (item) => item.producto_id === producto.id,
                                )
                                return (
                                  <option key={proveedor.id} value={proveedor.id}>
                                    {proveedor.nombre} ·{' '}
                                    {moneda.format(
                                      Number(relacion?.precio_unitario) || 0,
                                    )}
                                  </option>
                                )
                              })}
                            </select>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              step="0.01"
                              className="field h-10 w-24 text-center tabular-nums"
                              value={seleccion?.cantidad ?? producto.faltante}
                              onChange={(e) =>
                                handleCantidad(
                                  producto.id,
                                  Number(e.target.value),
                                )
                              }
                              disabled={!seleccion}
                              aria-label={`Cantidad de ${producto.nombre}`}
                            />
                          </td>
                          <td className="px-5 py-3 text-right text-[13px] font-semibold tabular-nums">
                            {seleccion
                              ? moneda.format(
                                  seleccion.precio * seleccion.cantidad,
                                )
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {seleccionados > 0 && (
                  <div className="flex flex-col gap-3 border-t border-gonper-border bg-gonper-bg/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[12.5px] text-gonper-muted">
                      <span className="font-semibold text-gonper-text">
                        {seleccionados}
                      </span>{' '}
                      {seleccionados === 1
                        ? 'producto seleccionado'
                        : 'productos seleccionados'}
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerarTodas}
                      disabled={generandoProveedor !== null}
                      className="btn btn-primary"
                    >
                      {generandoProveedor === 'todos' ? 'Generando compras…' : 'Generar compras'}
                    </button>
                  </div>
                )}
              </div>

              {seleccionados > 0 && (
                <div className="mt-4 md:hidden">
                  <button
                    type="button"
                    onClick={handleGenerarTodas}
                    disabled={generandoProveedor !== null}
                    className="btn btn-primary w-full"
                  >
                    {generandoProveedor === 'todos' ? 'Generando compras…' : 'Generar compras'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'ordenes' && (
        <div key="ordenes" className="animate-fade mt-4">
          {ordenesCompra.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<ReceiptText className="h-6 w-6" strokeWidth={1.5} />}
                title="Sin órdenes de compra"
                description="Genera una orden de compra desde las sugerencias para empezar a reponer."
              />
            </div>
          ) : (
            <div className="stagger grid grid-cols-1 gap-3">
              {ordenesCompra.map((orden) => (
                <article key={orden.id} className="card p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[14.5px] font-semibold tracking-[-0.01em]">
                          {orden.proveedores?.nombre || 'Proveedor'}
                        </h2>
                        <Badge
                          tono={
                            orden.estado === 'RECIBIDA' ? 'success' : 'warning'
                          }
                        >
                          {orden.estado === 'RECIBIDA'
                            ? 'Recibida'
                            : 'Pendiente'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-gonper-muted">
                        <span className="font-semibold text-gonper-text">
                          {orden.folio}
                        </span>{' '}
                        · {fecha.format(new Date(orden.created_at))}
                      </p>
                      <p className="mt-1 text-[12px] text-gonper-muted">
                        Orden de compra interna ·{' '}
                        {orden.orden_compra_items?.length || 0}{' '}
                        {orden.orden_compra_items?.length === 1
                          ? 'producto'
                          : 'productos'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
                          Total estimado
                        </p>
                        <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                          {moneda.format(Number(orden.total_estimado))}
                        </p>
                      </div>

                      {orden.estado === 'PENDIENTE' && (
                        <button
                          type="button"
                          onClick={() => abrirRecepcion(orden)}
                          className="btn btn-quiet"
                        >
                          <Truck className="h-4 w-4" strokeWidth={1.75} />
                          Recibir
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!requisicionAComprar}
        onClose={() => {
          if (comprandoRequisicionId) return
          setRequisicionAComprar(null)
          setErrorCompra('')
        }}
        title="Comprar faltante de esta requisición"
        description={
          requisicionAComprar
            ? `${requisicionAComprar.clienteNombre} · ${requisicionAComprar.folio} · ${fecha.format(new Date(requisicionAComprar.createdAt))}`
            : ''
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                if (comprandoRequisicionId) return
                setRequisicionAComprar(null)
                setErrorCompra('')
              }}
              disabled={comprandoRequisicionId !== null}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarCompraRequisicion}
              disabled={
                comprandoRequisicionId !== null ||
                !compraRequisicion ||
                compraRequisicion.grupos.length === 0
              }
              className="btn btn-primary flex-1 sm:flex-none"
            >
              <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
              {comprandoRequisicionId
                ? 'Generando compras…'
                : 'Confirmar compra'}
            </button>
          </>
        }
      >
        {requisicionAComprar && compraRequisicion && (
          <div className="px-5 py-5">
            <p className="text-[12.5px] text-gonper-muted">
              Se genera una orden de compra por proveedor, solo con los
              artículos que tienen precio registrado.
            </p>

            {compraRequisicion.grupos.length === 0 ? (
              <p className="mt-4 rounded-[6px] border border-gonper-warning-border bg-gonper-warning-bg px-3 py-2 text-[12.5px] text-gonper-warning">
                Ningún artículo tiene precio registrado: pídelos por
                WhatsApp. No se generó ninguna compra.
              </p>
            ) : (
              <>
                <div className="mt-4 space-y-3">
                  {compraRequisicion.grupos.map((grupo) => (
                    <div
                      key={grupo.proveedorId}
                      className="rounded-[6px] border border-gonper-border bg-gonper-bg/50 p-3"
                    >
                      <p className="text-[13px] font-semibold">
                        {grupo.proveedorNombre}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {grupo.items.map((item) => (
                          <li
                            key={item.productoId}
                            className="flex items-center justify-between gap-3 text-[12.5px]"
                          >
                            <span className="min-w-0">
                              <span className="font-medium">{item.nombre}</span>{' '}
                              <span className="text-gonper-muted">
                                · {numero.format(item.cantidad)} ×{' '}
                                {moneda.format(item.precioUnitario)}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {moneda.format(item.subtotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 border-t border-gonper-border pt-2 text-right text-[12px] text-gonper-muted">
                        Subtotal{' '}
                        <span className="text-[13px] font-semibold tabular-nums text-gonper-text">
                          {moneda.format(grupo.subtotal)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-right text-[13px] text-gonper-muted">
                  Total estimado{' '}
                  <span className="text-[15px] font-semibold tabular-nums text-gonper-text">
                    {moneda.format(
                      compraRequisicion.grupos.reduce(
                        (acc, grupo) => acc + grupo.subtotal,
                        0,
                      ),
                    )}
                  </span>
                </p>
              </>
            )}

            {compraRequisicion.sinPrecio.length > 0 && (
              <div className="mt-4 rounded-[6px] border border-gonper-warning-border bg-gonper-warning-bg px-3 py-2 text-[12.5px] text-gonper-warning">
                <p className="font-semibold">
                  Sin precio, no se compran: pedir por WhatsApp
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {compraRequisicion.sinPrecio.map((item) => (
                    <li key={item.productoId}>
                      {item.nombre} · faltan {numero.format(item.cantidad)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {errorCompra && (
              <p className="mt-3 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
                {errorCompra}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!ordenActiva}
        onClose={() => {
          if (isReceiving) return
          setOrdenActiva(null)
          setErrorRecepcion('')
        }}
        title="Recibir mercancía"
        description={`${ordenActiva?.folio || ''}${
          ordenActiva?.proveedores?.nombre
            ? ` · ${ordenActiva.proveedores.nombre}`
            : ''
        }`}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                if (isReceiving) return
                setOrdenActiva(null)
                setErrorRecepcion('')
              }}
              disabled={isReceiving}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRecibir}
              disabled={isReceiving}
              className="btn btn-primary flex-1 sm:flex-none"
            >
              <Truck className="h-4 w-4" strokeWidth={1.75} />
              {isReceiving ? 'Guardando…' : 'Confirmar recepción'}
            </button>
          </>
        }
      >
        {ordenActiva && (
          <div className="px-5 py-5">
            <p className="text-[12.5px] text-gonper-muted">
              Confirma las cantidades que llegaron para actualizar el inventario.
            </p>

            <div className="mt-4 space-y-2">
              {ordenActiva.orden_compra_items?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[6px] border border-gonper-border bg-gonper-bg/50 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {item.productos?.nombre}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-gonper-muted">
                      Solicitado {numero.format(Number(item.cantidad_solicitada))}{' '}
                      {item.productos?.unidad_medida || ''}
                    </p>
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="field h-10 w-24 shrink-0 text-center font-semibold tabular-nums"
                    value={cantidadesRecibidas[item.id] ?? 0}
                    onChange={(e) =>
                      setCantidadesRecibidas({
                        ...cantidadesRecibidas,
                        [item.id]: Number(e.target.value),
                      })
                    }
                    aria-label={`Cantidad recibida de ${item.productos?.nombre}`}
                  />
                </div>
              ))}

              {(!ordenActiva.orden_compra_items ||
                ordenActiva.orden_compra_items.length === 0) && (
                <div className="rounded-[6px] border border-dashed border-gonper-border px-4 py-10 text-center">
                  <Package
                    className="mx-auto h-6 w-6 text-gonper-muted"
                    strokeWidth={1.5}
                  />
                  <p className="mt-2 text-[13px] font-medium">
                    Esta orden de compra no tiene artículos.
                  </p>
                </div>
              )}
            </div>

            {errorRecepcion && (
              <p className="mt-3 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
                {errorRecepcion}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
