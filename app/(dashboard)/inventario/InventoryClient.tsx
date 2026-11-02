'use client'

import { useState } from 'react'
import { crearProducto, actualizarProducto, eliminarProducto } from './actions'

export default function InventoryClient({ 
  productosIniciales, 
  categorias 
}: { 
  productosIniciales: any[], 
  categorias: { id: string, nombre: string }[] 
}) {
  const [busqueda, setBusqueda] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [productoAEditar, setProductoAEditar] = useState<any | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const productosFiltrados = productosIniciales.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.sku.toLowerCase().includes(busqueda.toLowerCase())
  )

  const handleOpenCreate = () => {
    setProductoAEditar(null)
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (prod: any) => {
    setProductoAEditar(prod)
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')
    
    const formData = new FormData(e.currentTarget)
    const result = productoAEditar 
      ? await actualizarProducto(productoAEditar.id, formData)
      : await crearProducto(formData)

    if (result?.error) {
      setErrorMsg(result.error)
      setIsSubmitting(false)
    } else {
      setIsModalOpen(false)
      setIsSubmitting(false)
    }
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return
    const result = await eliminarProducto(id)
    if (result?.error) alert(result.error)
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0 relative">
      
      {/* Header y Buscador */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gonper-text">Inventario</h1>
          <p className="text-sm text-gonper-muted">Catálogo de productos y existencias</p>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <input
            type="text" placeholder="Buscar por nombre o SKU..."
            className="w-full md:w-72 px-4 py-2 border border-gonper-border rounded-lg focus:outline-none focus:ring-2 focus:ring-gonper-primary"
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          />
          <button onClick={handleOpenCreate} className="hidden md:block bg-gonper-primary hover:bg-gonper-primary-hover text-white px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap">
            + Nuevo Producto
          </button>
        </div>
      </div>

      {/* VISTA MÓVIL */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {productosFiltrados.map((producto) => (
          <div key={producto.id} className="bg-gonper-surface p-4 rounded-xl border border-gonper-border shadow-sm flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gonper-text">{producto.nombre}</h3>
                <p className="text-xs text-gonper-muted font-mono">{producto.sku}</p>
                <p className="text-xs text-gonper-primary font-medium mt-1">{producto.categorias?.nombre || 'Sin categoría'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenEdit(producto)} className="text-blue-500 p-1">✏️</button>
                <button onClick={() => handleEliminar(producto.id)} className="text-red-400 p-1">🗑️</button>
              </div>
            </div>
            <div className="flex justify-between items-end mt-2">
              <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                producto.stock_actual <= 0 ? 'bg-red-100 text-red-700' : 
                producto.stock_actual <= producto.stock_minimo ? 'bg-amber-100 text-amber-700' : 
                'bg-emerald-100 text-emerald-700'
              }`}>
                Stock: {producto.stock_actual}
              </span>
              <span className="font-bold text-lg text-gonper-text">${producto.precio_unitario}</span>
            </div>
          </div>
        ))}
      </div>

      {/* VISTA ESCRITORIO */}
      <div className="hidden md:block bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gonper-bg border-b border-gonper-border text-sm text-gonper-muted">
              <th className="p-4 font-medium">SKU</th>
              <th className="p-4 font-medium">Producto</th>
              <th className="p-4 font-medium">Categoría</th>
              <th className="p-4 font-medium text-right">Precio</th>
              <th className="p-4 font-medium text-center">Stock</th>
              <th className="p-4 font-medium text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gonper-border">
            {productosFiltrados.map((producto) => (
              <tr key={producto.id} className="hover:bg-gonper-bg/50 transition-colors">
                <td className="p-4 text-sm font-mono text-gonper-muted">{producto.sku}</td>
                <td className="p-4 font-medium text-gonper-text">{producto.nombre}</td>
                <td className="p-4 text-sm text-gonper-muted">{producto.categorias?.nombre || '-'}</td>
                <td className="p-4 text-right font-semibold">${producto.precio_unitario}</td>
                <td className="p-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    producto.stock_actual <= 0 ? 'bg-red-100 text-red-700' : 
                    producto.stock_actual <= producto.stock_minimo ? 'bg-amber-100 text-amber-700' : 
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {producto.stock_actual}
                  </span>
                </td>
                <td className="p-4 text-center flex justify-center gap-3">
                  <button onClick={() => handleOpenEdit(producto)} className="text-blue-400 hover:text-blue-600 p-1 transition-colors" title="Editar">✏️</button>
                  <button onClick={() => handleEliminar(producto.id)} className="text-red-400 hover:text-red-600 p-1 transition-colors" title="Eliminar">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {productosFiltrados.length === 0 && (
          <p className="text-center text-gonper-muted py-8">No se encontraron productos.</p>
        )}
      </div>

      <button onClick={handleOpenCreate} className="md:hidden fixed bottom-20 right-6 bg-gonper-primary text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl z-40">+</button>

      {/* MODAL DE CREACIÓN / EDICIÓN */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-gonper-surface w-full max-w-md rounded-t-2xl md:rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gonper-text">
                {productoAEditar ? 'Editar Producto' : 'Nuevo Producto'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gonper-muted hover:text-red-500 text-2xl leading-none">&times;</button>
            </div>

            <form key={productoAEditar?.id || 'nuevo'} onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gonper-text mb-1">SKU</label>
                  <input name="sku" required defaultValue={productoAEditar?.sku || ''} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" placeholder="ART-00X" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gonper-text mb-1">Stock Actual</label>
                  <input name="stock_actual" type="number" step="0.01" required defaultValue={productoAEditar?.stock_actual || '0'} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gonper-text mb-1">Nombre del Producto</label>
                <input name="nombre" required defaultValue={productoAEditar?.nombre || ''} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gonper-text mb-1">Precio Unitario</label>
                  <input name="precio_unitario" type="number" step="0.01" required defaultValue={productoAEditar?.precio_unitario || '0'} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gonper-text mb-1">Stock Mínimo</label>
                  <input name="stock_minimo" type="number" step="0.01" required defaultValue={productoAEditar?.stock_minimo || '0'} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
                </div>
              </div>

              {/* 👇 AQUÍ ESTÁ EL CAMBIO: SELECT DE CATEGORÍAS 👇 */}
              <div>
                <label className="block text-sm font-medium text-gonper-text mb-1">Categoría (Opcional)</label>
                <select 
                  name="categoria_id" 
                  defaultValue={productoAEditar?.categoria_id || ''} 
                  className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none bg-white"
                >
                  <option value="">Sin categoría</option>
                  {categorias.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>

              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{errorMsg}</p>
              )}

              <button type="submit" disabled={isSubmitting} className="mt-4 w-full bg-gonper-primary hover:bg-gonper-primary-hover disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors">
                {isSubmitting ? 'Guardando...' : (productoAEditar ? 'Actualizar Producto' : 'Guardar Producto')}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}