'use client'

import { useState } from 'react'
import { 
  crearProveedor, actualizarProveedor, eliminarProveedor, 
  asignarPrecioAProducto, actualizarPrecioProducto, quitarProductoAProveedor 
} from './actions'

export default function ProveedoresClient({ 
  proveedoresIniciales, 
  catalogoProductos 
}: { 
  proveedoresIniciales: any[], 
  catalogoProductos: any[] 
}) {
  // 🧠 ESTADO LOCAL para evitar recargar la página
  const [listaProveedores, setListaProveedores] = useState(proveedoresIniciales)

  const [busqueda, setBusqueda] = useState('')
  
  // Estados del modal de Proveedor (Alta/Edición)
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false)
  const [proveedorAEditar, setProveedorAEditar] = useState<any | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Estados del modal de Catálogo (Precios)
  const [proveedorActivo, setProveedorActivo] = useState<any | null>(null)
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [errorMsgProducto, setErrorMsgProducto] = useState('')

  // Estados para el buscador de productos
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productoSeleccionado, setProductoSeleccionado] = useState<{id: string, nombre: string, sku: string} | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const proveedoresFiltrados = listaProveedores.filter(p => 
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  // --- LÓGICA MODAL PROVEEDOR ---
  const handleOpenCreateProveedor = () => {
    setProveedorAEditar(null)
    setErrorMsg('')
    setIsProveedorModalOpen(true)
  }

  const handleOpenEditProveedor = (prov: any) => {
    setProveedorAEditar(prov)
    setErrorMsg('')
    setIsProveedorModalOpen(true)
  }

  const handleSubmitProveedor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')
    
    const formData = new FormData(e.currentTarget)
    const result = proveedorAEditar 
      ? await actualizarProveedor(proveedorAEditar.id, formData)
      : await crearProveedor(formData)

    if (result?.error) {
      setErrorMsg(result.error)
      setIsSubmitting(false)
    } else {
      setIsProveedorModalOpen(false)
      setIsSubmitting(false)
      // Si se creó, recargamos para verlo (o podríamos actualizar el estado, pero para el proveedor está bien recargar)
      window.location.reload()
    }
  }

  const handleEliminarProveedor = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este proveedor?')) return
    const result = await eliminarProveedor(id)
    if (result?.error) alert(result.error)
    else window.location.reload()
  }

  // --- LÓGICA BUSCADOR DE PRODUCTOS ---
  const productosDisponibles = catalogoProductos.filter(prod => 
    !proveedorActivo?.producto_proveedores?.some((rel: any) => rel.productos?.id === prod.id)
  )

  const productosFiltradosBusqueda = productosDisponibles.filter(prod => 
    prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
    prod.sku.toLowerCase().includes(busquedaProducto.toLowerCase())
  )

  const handleSelectProducto = (prod: any) => {
    setProductoSeleccionado(prod)
    setBusquedaProducto('')
    setIsDropdownOpen(false)
  }

  // 🧠 LÓGICA PARA AGREGAR PRODUCTO SIN CERRAR MODAL
  const handleAddProducto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productoSeleccionado || !nuevoPrecio) return

    setIsAddingProduct(true)
    setErrorMsgProducto('')

    const result = await asignarPrecioAProducto(proveedorActivo.id, productoSeleccionado.id, parseFloat(nuevoPrecio))
    
    if (result?.error) {
      setErrorMsgProducto(result.error)
    } else if (result?.success && result.id) {
      // 1. Actualizamos la tabla del modal abierto (proveedorActivo)
      const nuevaRelacion = {
        id: result.id,
        precio_unitario: parseFloat(nuevoPrecio),
        productos: productoSeleccionado
      }
      
      const nuevoProveedorActivo = {
        ...proveedorActivo,
        producto_proveedores: [...(proveedorActivo.producto_proveedores || []), nuevaRelacion]
      }
      setProveedorActivo(nuevoProveedorActivo)

      // 2. Actualizamos la lista principal para que el contador suba
      setListaProveedores(prev => prev.map(p => p.id === nuevoProveedorActivo.id ? nuevoProveedorActivo : p))

      // 3. Limpiamos los inputs para el siguiente producto
      setNuevoPrecio('')
      setProductoSeleccionado(null)
    }
    setIsAddingProduct(false)
  }

  const handleUpdatePrecio = async (idRelacion: string, precioActual: number) => {
    const nuevoPrecioStr = prompt('Ingresa el nuevo precio:', precioActual.toString())
    if (nuevoPrecioStr === null) return
    const nuevoPrecioNum = parseFloat(nuevoPrecioStr)
    
    if (isNaN(nuevoPrecioNum)) {
      alert('Por favor, ingresa un número válido.')
      return
    }

    const result = await actualizarPrecioProducto(idRelacion, nuevoPrecioNum)
    
    if (result?.error) {
      alert(result.error)
    } else {
      // Actualizamos la tabla en vivo
      const nuevosProductos = proveedorActivo.producto_proveedores.map((rel: any) => 
        rel.id === idRelacion ? { ...rel, precio_unitario: nuevoPrecioNum } : rel
      )
      const nuevoProveedorActivo = { ...proveedorActivo, producto_proveedores: nuevosProductos }
      setProveedorActivo(nuevoProveedorActivo)
      setListaProveedores(prev => prev.map(p => p.id === nuevoProveedorActivo.id ? nuevoProveedorActivo : p))
    }
  }

  const handleRemoveProducto = async (idRelacion: string) => {
    if (!confirm('¿Quitar este producto del catálogo del proveedor?')) return
    const result = await quitarProductoAProveedor(idRelacion)
    
    if (result?.error) {
      alert(result.error)
    } else {
      // Actualizamos la tabla en vivo
      const nuevosProductos = proveedorActivo.producto_proveedores.filter((rel: any) => rel.id !== idRelacion)
      const nuevoProveedorActivo = { ...proveedorActivo, producto_proveedores: nuevosProductos }
      setProveedorActivo(nuevoProveedorActivo)
      setListaProveedores(prev => prev.map(p => p.id === nuevoProveedorActivo.id ? nuevoProveedorActivo : p))
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0 relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gonper-text">Proveedores</h1>
          <p className="text-sm text-gonper-muted">Directorio y catálogo de precios por proveedor</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <input 
            type="text" placeholder="Buscar proveedor..." 
            className="w-full md:w-72 px-4 py-2 border border-gonper-border rounded-lg focus:outline-none focus:ring-2 focus:ring-gonper-primary" 
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} 
          />
          <button onClick={handleOpenCreateProveedor} className="hidden md:block bg-gonper-primary hover:bg-gonper-primary-hover text-white px-4 py-2 rounded-lg font-medium whitespace-nowrap">+ Nuevo Proveedor</button>
        </div>
      </div>

      {/* VISTA MÓVIL */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {proveedoresFiltrados.map((p) => (
          <div key={p.id} className="bg-gonper-surface p-4 rounded-xl border border-gonper-border shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-gonper-text text-lg">{p.nombre}</h3>
                {p.telefono && <p className="text-sm text-gonper-muted mt-1">📞 {p.telefono}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenEditProveedor(p)} className="text-blue-500 p-1">✏️</button>
                <button onClick={() => handleEliminarProveedor(p.id)} className="text-red-400 p-1">🗑️</button>
              </div>
            </div>
            
            <button 
              onClick={() => setProveedorActivo(p)}
              className="mt-2 w-full py-2 bg-blue-50 text-blue-700 font-medium rounded-lg border border-blue-100 text-sm flex justify-center items-center gap-2"
            >
              📦 Ver Catálogo y Precios ({p.producto_proveedores?.length || 0})
            </button>
          </div>
        ))}
      </div>

      {/* VISTA PC */}
      <div className="hidden md:block bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gonper-bg border-b border-gonper-border text-sm text-gonper-muted">
              <th className="p-4 font-medium">Proveedor</th>
              <th className="p-4 font-medium">Contacto</th>
              <th className="p-4 font-medium text-center">Catálogo</th>
              <th className="p-4 font-medium text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gonper-border">
            {proveedoresFiltrados.map((p) => (
              <tr key={p.id} className="hover:bg-gonper-bg/50 transition-colors">
                <td className="p-4 font-bold text-gonper-text">{p.nombre}</td>
                <td className="p-4 text-sm text-gonper-muted">{p.telefono || '-'}</td>
                <td className="p-4 text-center">
                  <button 
                    onClick={() => setProveedorActivo(p)}
                    className="bg-blue-50 text-blue-700 px-4 py-1 rounded-full text-sm font-bold border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    {p.producto_proveedores?.length || 0} Productos
                  </button>
                </td>
                <td className="p-4 text-center flex justify-center gap-3">
                  <button onClick={() => handleOpenEditProveedor(p)} className="text-blue-400 hover:text-blue-600 p-1" title="Editar Proveedor">✏️</button>
                  <button onClick={() => handleEliminarProveedor(p.id)} className="text-red-400 hover:text-red-600 p-1" title="Eliminar Proveedor">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={handleOpenCreateProveedor} className="md:hidden fixed bottom-20 right-6 bg-gonper-primary text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl z-40">+</button>

      {/* MODAL 1: CREAR / EDITAR PROVEEDOR */}
      {isProveedorModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-gonper-surface w-full max-w-md rounded-t-2xl md:rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gonper-text">{proveedorAEditar ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
              <button onClick={() => setIsProveedorModalOpen(false)} className="text-2xl text-gray-400">&times;</button>
            </div>
            <form key={proveedorAEditar?.id || 'nuevo'} onSubmit={handleSubmitProveedor} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre de la Empresa *</label>
                <input name="nombre" required defaultValue={proveedorAEditar?.nombre || ''} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" placeholder="Ej. Distribuidora Culiacán" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Teléfono</label>
                <input name="telefono" defaultValue={proveedorAEditar?.telefono || ''} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Correo Electrónico</label>
                <input name="correo" type="email" defaultValue={proveedorAEditar?.correo || ''} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
              </div>
              {errorMsg && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{errorMsg}</p>}
              <button type="submit" disabled={isSubmitting} className="mt-4 w-full bg-gonper-primary text-white font-bold py-3 rounded-lg disabled:bg-gray-400">
                {isSubmitting ? 'Guardando...' : 'Guardar Proveedor'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: GESTIONAR CATÁLOGO (PRECIOS) */}
      {proveedorActivo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
          <div className="bg-gonper-surface w-full max-w-2xl rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gonper-text">Catálogo y Precios</h2>
                <p className="text-sm text-gonper-primary font-medium">{proveedorActivo.nombre}</p>
              </div>
              <button onClick={() => setProveedorActivo(null)} className="text-3xl text-gray-400 hover:text-red-500">&times;</button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              
              {/* FORMULARIO CON BUSCADOR INTELIGENTE */}
              <form onSubmit={handleAddProducto} className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 flex flex-col md:flex-row gap-3 items-start">
                
                {/* BUSCADOR */}
                <div className="flex-1 w-full relative">
                  <label className="block text-xs font-medium mb-1">Buscar Producto del Inventario</label>
                  
                  {productoSeleccionado ? (
                    <div className="flex items-center justify-between w-full px-3 py-2 border rounded-lg bg-emerald-50 border-emerald-200">
                      <div>
                        <p className="text-sm font-bold text-emerald-800">{productoSeleccionado.nombre}</p>
                        <p className="text-xs text-emerald-600 font-mono">{productoSeleccionado.sku}</p>
                      </div>
                      <button type="button" onClick={() => setProductoSeleccionado(null)} className="text-red-500 font-bold text-xl">&times;</button>
                    </div>
                  ) : (
                    <>
                      <input 
                        type="text"
                        placeholder="Escribe el nombre o SKU..."
                        value={busquedaProducto}
                        onChange={(e) => { setBusquedaProducto(e.target.value); setIsDropdownOpen(true); }}
                        onFocus={() => setIsDropdownOpen(true)}
                        className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-gonper-primary focus:outline-none"
                      />
                      {/* LISTA DESPLEGABLE DE RESULTADOS */}
                      {isDropdownOpen && busquedaProducto.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {productosFiltradosBusqueda.length > 0 ? (
                            productosFiltradosBusqueda.map(prod => (
                              <div 
                                key={prod.id} 
                                onClick={() => handleSelectProducto(prod)}
                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0"
                              >
                                <p className="text-sm font-medium text-gray-800">{prod.nombre}</p>
                                <p className="text-xs text-gray-500 font-mono">{prod.sku}</p>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-center text-sm text-gray-500">
                              No se encontraron productos.
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  
                  {productosDisponibles.length === 0 && <p className="text-xs text-amber-600 mt-1">Todos los productos del inventario ya están asignados a este proveedor.</p>}
                </div>

                {/* PRECIO Y BOTÓN */}
                <div className="w-full md:w-32">
                  <label className="block text-xs font-medium mb-1">Precio ($)</label>
                  <input type="number" step="0.01" required value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" />
                </div>
                {/* 👇 CAMBIO DE TEXTO AQUÍ 👇 */}
                <button type="submit" disabled={isAddingProduct || !productoSeleccionado} className="w-full md:w-auto bg-gonper-primary text-white px-4 h-10 mt-5 rounded-lg font-bold text-sm disabled:bg-gray-400">
                  {isAddingProduct ? '...' : 'Agregar Producto'}
                </button>
              </form>
              
              {errorMsgProducto && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-4">{errorMsgProducto}</p>}

              {/* Tabla de productos del proveedor */}
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-right">Precio Unitario</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {proveedorActivo.producto_proveedores?.map((rel: any) => (
                    <tr key={rel.id}>
                      <td className="p-3">
                        <p className="font-semibold text-gonper-text">{rel.productos?.nombre}</p>
                        <p className="text-xs text-gray-500 font-mono">{rel.productos?.sku}</p>
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-600">${rel.precio_unitario}</td>
                      <td className="p-3 text-center flex justify-center gap-2">
                        <button onClick={() => handleUpdatePrecio(rel.id, rel.precio_unitario)} className="text-blue-400 hover:text-blue-600 p-1" title="Editar Precio">✏️</button>
                        <button onClick={() => handleRemoveProducto(rel.id)} className="text-red-400 hover:text-red-600 p-1" title="Quitar Producto">🗑️</button>
                      </td>
                    </tr>
                  ))}
                  {(!proveedorActivo.producto_proveedores || proveedorActivo.producto_proveedores.length === 0) && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-gray-500">Este proveedor aún no tiene productos asignados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t bg-gray-50 rounded-b-2xl text-right">
              <button onClick={() => setProveedorActivo(null)} className="px-6 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}