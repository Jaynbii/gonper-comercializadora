
'use client'

import { useState } from 'react'
import { generarOrdenCompra, recibirMercancia } from './actions'

export default function ComprasClient({ faltantes, proveedores, ordenesCompra }: any) {
  const [tab, setTab] = useState<'sugerencias' | 'ordenes'>('sugerencias')

  // Estados para generar órdenes de compra.
  const [itemsSeleccionados, setItemsSeleccionados] = useState<Record<string, { proveedorId: string, cantidad: number, precio: number }>>({})
  const [isGenerating, setIsGenerating] = useState(false)

  // Estados para recibir mercancía.
  const [ordenActiva, setOrdenActiva] = useState<any | null>(null)
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<string, number>>({})
  const [isReceiving, setIsReceiving] = useState(false)

  // Selecciona proveedor y establece como cantidad inicial el faltante del producto.
  const handleSelectProveedor = (productoId: string, proveedorId: string, faltante: number) => {
    const prov = proveedores.find((p: any) => p.id === proveedorId)
    const rel = (prov?.producto_proveedores || []).find((r: any) => r.producto_id === productoId)
    const precio = rel ? rel.precio_unitario : 0

    // Si se selecciona la opción vacía, se elimina la selección del producto.
    if (!proveedorId) {
      setItemsSeleccionados(prev => {
        const nuevos = { ...prev }
        delete nuevos[productoId]
        return nuevos
      })
      return
    }

    setItemsSeleccionados(prev => ({
      ...prev,
      [productoId]: {
        proveedorId,
        cantidad: faltante,
        precio
      }
    }))
  }

  // Actualiza manualmente la cantidad que se solicitará al proveedor.
  const handleCantidad = (productoId: string, cantidad: number) => {
    setItemsSeleccionados(prev => ({
      ...prev,
      [productoId]: {
        ...prev[productoId],
        cantidad
      }
    }))
  }

  // Genera una orden con los productos seleccionados para un proveedor.
  const handleGenerar = async (proveedorId: string) => {
    const itemsDelProveedor = Object.entries(itemsSeleccionados)
      .filter(([_, data]) => data.proveedorId === proveedorId)
      .map(([prodId, data]) => ({
        producto_id: prodId,
        cantidad: data.cantidad,
        precio: data.precio
      }))

    if (itemsDelProveedor.length === 0) {
      return alert('Selecciona al menos un producto')
    }

    setIsGenerating(true)

    try {
      const res = await generarOrdenCompra(proveedorId, itemsDelProveedor)
      alert(`Orden ${res.folio} generada con éxito`)
      window.location.reload()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // Registra las cantidades de mercancía que llegaron del proveedor.
  const handleRecibir = async () => {
    const itemsAEntregar = ordenActiva.orden_compra_items.map((item: any) => ({
      id: item.id,
      producto_id: item.productos?.id,
      cantidad_recibida: cantidadesRecibidas[item.id] || 0
    })).filter((i: any) => i.cantidad_recibida > 0 && i.producto_id)

    if (itemsAEntregar.length === 0) {
      return alert('Ingresa al menos una cantidad recibida')
    }

    setIsReceiving(true)

    try {
      await recibirMercancia(ordenActiva.id, itemsAEntregar)
      alert('Mercancía recibida y stock actualizado')
      setOrdenActiva(null)
      window.location.reload()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsReceiving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gonper-text">Compras y Reabastecimiento</h1>
          <p className="text-sm text-gonper-muted">Gestiona faltantes y recibe mercancía de proveedores</p>
        </div>
      </div>

      {/* Pestañas de navegación. */}
      <div className="flex border-b border-gonper-border mb-6">
        <button
          onClick={() => setTab('sugerencias')}
          className={`px-6 py-3 font-medium text-sm transition-colors ${tab === 'sugerencias' ? 'border-b-2 border-gonper-primary text-gonper-primary' : 'text-gonper-muted hover:text-gonper-text'}`}
        >
          Sugerencia de Compra ({faltantes.length})
        </button>

        <button
          onClick={() => setTab('ordenes')}
          className={`px-6 py-3 font-medium text-sm transition-colors ${tab === 'ordenes' ? 'border-b-2 border-gonper-primary text-gonper-primary' : 'text-gonper-muted hover:text-gonper-text'}`}
        >
          Órdenes de Compra Generadas
        </button>
      </div>

      {/* Contenido de sugerencias de compra. */}
      {tab === 'sugerencias' && (
        <div className="bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
          {faltantes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 border-b border-gonper-border">
                  <tr>
                    <th className="p-4">Producto</th>
                    <th className="p-4 text-center">Faltante</th>
                    <th className="p-4">Proveedor y Precio</th>
                    <th className="p-4 text-center">Cant. a Pedir</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gonper-border">
                  {faltantes.map((prod: any) => {
                    const seleccion = itemsSeleccionados[prod.id]

                    // Se muestran únicamente los proveedores relacionados con el producto.
                    const opcionesProv = proveedores.filter((p: any) => {
                      const relacion = (p.producto_proveedores || []).find((r: any) => r.producto_id === prod.id)
                      return !!relacion
                    })

                    return (
                      <tr key={prod.id} className="hover:bg-gray-50">
                        <td className="p-4">
                          <p className="font-bold text-gonper-text">{prod.nombre}</p>
                          <p className="text-xs text-gonper-muted font-mono">{prod.sku}</p>
                        </td>

                        <td className="p-4 text-center font-bold text-red-600 bg-red-50 rounded-md my-2">
                          {prod.faltante}
                        </td>

                        <td className="p-4">
                          <select
                            className="w-full px-2 py-1 border rounded text-sm bg-white"
                            onChange={(e) => handleSelectProveedor(prod.id, e.target.value, Number(prod.faltante))}
                            value={seleccion?.proveedorId || ''}
                          >
                            <option value="">Selecciona proveedor...</option>

                            {opcionesProv.map((p: any) => {
                              const relacion = (p.producto_proveedores || []).find((r: any) => r.producto_id === prod.id)
                              const precio = relacion ? relacion.precio_unitario : 0

                              return (
                                <option key={p.id} value={p.id}>
                                  {p.nombre} (${precio})
                                </option>
                              )
                            })}
                          </select>
                        </td>

                        <td className="p-4 text-center">
                          <input
                            type="number"
                            min="1"
                            value={seleccion?.cantidad ?? Number(prod.faltante)}
                            onChange={(e) => handleCantidad(prod.id, Number(e.target.value))}
                            className="w-20 px-2 py-1 border rounded text-center"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-gonper-muted">
              No hay faltantes de inventario en este momento.
            </p>
          )}

          {/* Botones para generar órdenes por proveedor. */}
          {Object.keys(itemsSeleccionados).length > 0 && (
            <div className="p-4 bg-gray-50 border-t border-gonper-border flex flex-wrap gap-4 justify-end">
              {Array.from(new Set(Object.values(itemsSeleccionados).map(i => i.proveedorId))).map(provId => {
                const prov = proveedores.find((p: any) => p.id === provId)

                return (
                  <button
                    key={provId}
                    onClick={() => handleGenerar(provId)}
                    disabled={isGenerating}
                    className="bg-gonper-primary text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-gonper-primary-hover"
                  >
                    Generar Orden para {prov?.nombre}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Contenido de órdenes de compra generadas. */}
      {tab === 'ordenes' && (
        <div className="bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
          <div className="divide-y divide-gonper-border">
            {ordenesCompra.map((oc: any) => (
              <div key={oc.id} className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-gonper-text">{oc.proveedores?.nombre}</p>
                  <p className="text-xs text-gonper-muted font-mono">{oc.folio}</p>
                  <p className="text-xs text-gonper-muted mt-1">Total: ${oc.total_estimado}</p>
                </div>

                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${oc.estado === 'RECIBIDA' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {oc.estado}
                  </span>

                  {oc.estado === 'PENDIENTE' && (
                    <button
                      onClick={() => {
                        setOrdenActiva(oc)
                        const init: Record<string, number> = {}
                        oc.orden_compra_items.forEach((i: any) => {
                          init[i.id] = i.cantidad_solicitada
                        })
                        setCantidadesRecibidas(init)
                      }}
                      className="bg-gonper-primary text-white px-4 py-2 rounded-lg text-sm font-bold"
                    >
                      Recibir Mercancía
                    </button>
                  )}
                </div>
              </div>
            ))}

            {ordenesCompra.length === 0 && (
              <p className="p-8 text-center text-gonper-muted">
                No hay órdenes de compra generadas.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal para recibir mercancía. */}
      {ordenActiva && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold mb-4">
              Recibir Mercancía - {ordenActiva.folio}
            </h2>

            <p className="text-sm text-gray-500 mb-4">
              Confirma las cantidades que llegaron para actualizar el inventario.
            </p>

            <div className="flex flex-col gap-3 max-h-60 overflow-y-auto mb-6">
              {ordenActiva.orden_compra_items.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                  <div>
                    <p className="font-semibold text-sm">{item.productos?.nombre}</p>
                    <p className="text-xs text-gray-500">
                      Solicitado: {item.cantidad_solicitada}
                    </p>
                  </div>

                  <input
                    type="number"
                    className="w-20 px-2 py-1 border rounded text-center font-bold"
                    value={cantidadesRecibidas[item.id] || 0}
                    onChange={(e) => setCantidadesRecibidas({
                      ...cantidadesRecibidas,
                      [item.id]: Number(e.target.value)
                    })}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOrdenActiva(null)}
                className="px-4 py-2 text-gray-600 font-medium"
              >
                Cancelar
              </button>

              <button
                onClick={handleRecibir}
                disabled={isReceiving}
                className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold disabled:bg-gray-400"
              >
                {isReceiving ? 'Guardando...' : 'Confirmar Recepción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
