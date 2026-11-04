'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  Package,
  ReceiptText,
  Truck,
  X,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { Badge } from '@/components/EstadoBadge'
import { generarOrdenCompra, recibirMercancia } from './actions'

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

export default function ComprasClient({
  faltantes,
  proveedores,
  ordenesCompra,
}: {
  faltantes: Faltante[]
  proveedores: Proveedor[]
  ordenesCompra: OrdenCompra[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'sugerencias' | 'ordenes'>('sugerencias')

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

  const handleGenerar = async (proveedorId: string) => {
    const itemsDelProveedor = Object.entries(itemsSeleccionados)
      .filter(([, data]) => data.proveedorId === proveedorId)
      .map(([productoId, data]) => ({
        producto_id: productoId,
        cantidad: data.cantidad,
        precio: data.precio,
      }))

    if (itemsDelProveedor.length === 0) {
      setErrorMsg('Selecciona al menos un producto.')
      return
    }

    setGenerandoProveedor(proveedorId)
    setMensaje('')
    setErrorMsg('')

    try {
      const res = await generarOrdenCompra(proveedorId, itemsDelProveedor)
      setMensaje(`Orden ${res.folio} generada con éxito.`)
      setItemsSeleccionados((prev) => {
        const nuevos = { ...prev }
        itemsDelProveedor.forEach((item) => delete nuevos[item.producto_id])
        return nuevos
      })
      router.refresh()
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'No se pudo generar la orden.',
      )
    } finally {
      setGenerandoProveedor(null)
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
        eyebrow={`${faltantes.length} ${
          faltantes.length === 1 ? 'producto por reponer' : 'productos por reponer'
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
            {faltantes.length}
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
          Órdenes
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

      {tab === 'sugerencias' && (
        <div key="sugerencias" className="animate-fade mt-4">
          {faltantes.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<CheckCircle2 className="h-6 w-6" strokeWidth={1.5} />}
                title="Sin faltantes"
                description="El inventario cubre la demanda de las órdenes activas."
              />
            </div>
          ) : (
            <>
              <div className="stagger grid grid-cols-1 gap-3 md:hidden">
                {faltantes.map((producto) => {
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
                    {faltantes.map((producto) => {
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
                    <div className="flex flex-wrap gap-2">
                      {proveedoresSeleccionados.map((proveedorId) => {
                        const proveedor = proveedores.find(
                          (item) => item.id === proveedorId,
                        )
                        return (
                          <button
                            key={proveedorId}
                            type="button"
                            onClick={() => handleGenerar(proveedorId)}
                            disabled={generandoProveedor !== null}
                            className="btn btn-primary"
                          >
                            {generandoProveedor === proveedorId
                              ? 'Generando…'
                              : `Generar orden · ${proveedor?.nombre}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {seleccionados > 0 && (
                <div className="mt-4 space-y-2 md:hidden">
                  {proveedoresSeleccionados.map((proveedorId) => {
                    const proveedor = proveedores.find(
                      (item) => item.id === proveedorId,
                    )
                    return (
                      <button
                        key={proveedorId}
                        type="button"
                        onClick={() => handleGenerar(proveedorId)}
                        disabled={generandoProveedor !== null}
                        className="btn btn-primary w-full"
                      >
                        {generandoProveedor === proveedorId
                          ? 'Generando…'
                          : `Generar orden · ${proveedor?.nombre}`}
                      </button>
                    )
                  })}
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
                description="Genera una orden desde las sugerencias para empezar a reponer."
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
                      <p className="mt-1 font-mono text-[11.5px] text-gonper-muted">
                        {orden.folio} ·{' '}
                        {fecha.format(new Date(orden.created_at))}
                      </p>
                      <p className="mt-1 text-[12px] text-gonper-muted">
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
                    Esta orden no tiene artículos.
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
