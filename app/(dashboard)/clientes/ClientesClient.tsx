'use client'

import { useState } from 'react'
import { crearCliente, actualizarCliente, eliminarCliente } from './actions'

export default function ClientesClient({ clientesIniciales }: { clientesIniciales: any[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [clienteAEditar, setClienteAEditar] = useState<any | null>(null) // 👈 Estado para edición
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const clientesFiltrados = clientesIniciales.filter((c) =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.contacto_nombre && c.contacto_nombre.toLowerCase().includes(busqueda.toLowerCase()))
  )

  const handleOpenCreate = () => {
    setClienteAEditar(null)
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (cliente: any) => {
    setClienteAEditar(cliente)
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')
    
    const formData = new FormData(e.currentTarget)
    
    // Si hay un cliente en edición, actualizamos, si no, creamos.
    const result = clienteAEditar 
      ? await actualizarCliente(clienteAEditar.id, formData)
      : await crearCliente(formData)

    if (result?.error) {
      setErrorMsg(result.error)
      setIsSubmitting(false)
    } else {
      setIsModalOpen(false)
      setIsSubmitting(false)
    }
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) return
    const result = await eliminarCliente(id)
    if (result?.error) alert(result.error)
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0 relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gonper-text">Directorio de Clientes</h1>
          <p className="text-sm text-gonper-muted">Mercados, dependencias y entidades de gobierno</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <input 
            type="text" placeholder="Buscar cliente..." 
            className="w-full md:w-72 px-4 py-2 border border-gonper-border rounded-lg focus:outline-none focus:ring-2 focus:ring-gonper-primary" 
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} 
          />
          <button onClick={handleOpenCreate} className="hidden md:block bg-gonper-primary hover:bg-gonper-primary-hover text-white px-4 py-2 rounded-lg font-medium whitespace-nowrap">+ Nuevo Cliente</button>
        </div>
      </div>

      {/* VISTA MÓVIL */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {clientesFiltrados.map((c) => (
          <div key={c.id} className="bg-gonper-surface p-4 rounded-xl border border-gonper-border shadow-sm flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gonper-text">{c.nombre}</h3>
                {c.contacto_nombre && <p className="text-xs text-gonper-muted mt-1">👤 {c.contacto_nombre}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenEdit(c)} className="text-blue-500 hover:text-blue-700 p-1">✏️</button>
                <button onClick={() => handleEliminar(c.id)} className="text-red-400 hover:text-red-600 p-1">🗑️</button>
              </div>
            </div>
            {c.telefono && <p className="text-sm text-gonper-text">📞 {c.telefono}</p>}
            {c.direccion && <p className="text-sm text-gonper-muted">📍 {c.direccion}</p>}
          </div>
        ))}
      </div>

      {/* VISTA PC */}
      <div className="hidden md:block bg-gonper-surface rounded-xl border border-gonper-border shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gonper-bg border-b border-gonper-border text-sm text-gonper-muted">
              <th className="p-4 font-medium">Nombre / Dependencia</th>
              <th className="p-4 font-medium">Contacto</th>
              <th className="p-4 font-medium">Teléfono</th>
              <th className="p-4 font-medium">Dirección</th>
              <th className="p-4 font-medium text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gonper-border">
            {clientesFiltrados.map((c) => (
              <tr key={c.id} className="hover:bg-gonper-bg/50 transition-colors">
                <td className="p-4 font-bold text-gonper-text">{c.nombre}</td>
                <td className="p-4 text-sm text-gonper-muted">{c.contacto_nombre || '-'}</td>
                <td className="p-4 text-sm text-gonper-muted">{c.telefono || '-'}</td>
                <td className="p-4 text-sm text-gonper-muted">{c.direccion || '-'}</td>
                <td className="p-4 text-center flex justify-center gap-3">
                  <button onClick={() => handleOpenEdit(c)} className="text-blue-400 hover:text-blue-600 transition-colors p-1" title="Editar">✏️</button>
                  <button onClick={() => handleEliminar(c.id)} className="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* BOTÓN FLOTANTE MÓVIL */}
      <button onClick={handleOpenCreate} className="md:hidden fixed bottom-20 right-6 bg-gonper-primary text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl z-40">+</button>

      {/* MODAL (Crear / Editar) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-gonper-surface w-full max-w-md rounded-t-2xl md:rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gonper-text">
                {clienteAEditar ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gonper-muted hover:text-red-500 text-2xl leading-none">&times;</button>
            </div>
            
            {/* El key fuerza a que el formulario se reinicie si cambiamos de cliente */}
            <form key={clienteAEditar?.id || 'nuevo'} onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre de la Dependencia o Mercado *</label>
                <input name="nombre" required defaultValue={clienteAEditar?.nombre || ''} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre del Contacto</label>
                <input name="contacto_nombre" defaultValue={clienteAEditar?.contacto_nombre || ''} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Teléfono</label>
                <input name="telefono" defaultValue={clienteAEditar?.telefono || ''} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dirección</label>
                <input name="direccion" defaultValue={clienteAEditar?.direccion || ''} className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" />
              </div>
              
              {errorMsg && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{errorMsg}</p>}
              
              <button type="submit" disabled={isSubmitting} className="mt-4 w-full bg-gonper-primary text-white font-semibold py-3 rounded-lg hover:bg-gonper-primary-hover disabled:bg-gray-400">
                {isSubmitting ? 'Guardando...' : (clienteAEditar ? 'Actualizar Cliente' : 'Guardar Cliente')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}