'use client'

import { useState } from 'react'
import { editarOrden, eliminarOrden } from './actions'
import { useRouter } from 'next/navigation'

export default function AccionesOrden({ 
  orden, 
  clientes 
}: { 
  orden: any, 
  clientes: { id: string, nombre: string }[] 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const handleEditar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsEditing(true)
    setErrorMsg('')
    
    const formData = new FormData(e.currentTarget)
    const cliente_id = formData.get('cliente_id') as string
    const estado = formData.get('estado') as string

    try {
      await editarOrden(orden.id, cliente_id, estado)
      setIsOpen(false)
      setIsEditing(false)
      router.refresh()
    } catch (error: any) {
      setErrorMsg(error.message)
      setIsEditing(false)
    }
  }

  const handleEliminar = async () => {
    if (!confirm('⚠️ ¿Estás seguro de eliminar esta orden permanentemente? Se borrarán los productos y el PDF.')) return
    
    setIsDeleting(true)
    try {
      await eliminarOrden(orden.id, orden.pdf_path)
      setIsOpen(false)
      router.refresh()
    } catch (error: any) {
      alert('Error al eliminar: ' + error.message)
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="p-2 text-gray-400 hover:text-gonper-primary hover:bg-gonper-primary/10 rounded-full transition-colors"
        title="Acciones de la orden"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gonper-text">Gestionar Orden</h2>
              <button onClick={() => setIsOpen(false)} className="text-2xl text-gray-400 hover:text-red-500">&times;</button>
            </div>

            <form onSubmit={handleEditar} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Cliente / Mercado</label>
                <select 
                  name="cliente_id" 
                  defaultValue={orden.cliente_id} 
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-gonper-primary focus:outline-none"
                >
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Estado de la Orden</label>
                <select 
                  name="estado" 
                  defaultValue={orden.estado} 
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-gonper-primary focus:outline-none"
                >
                  <option value="BORRADOR">BORRADOR</option>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="PARCIAL">PARCIAL</option>
                  <option value="ENTREGADA">ENTREGADA</option>
                  <option value="CANCELADA">CANCELADA</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Cambiar a CANCELADA no devuelve el stock automáticamente.</p>
              </div>

              {errorMsg && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{errorMsg}</p>}

              <div className="flex gap-3 mt-4">
                <button 
                  type="button" 
                  onClick={handleEliminar}
                  disabled={isDeleting || isEditing}
                  className="w-1/3 py-3 bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDeleting ? '...' : 'Eliminar'}
                </button>
                <button 
                  type="submit" 
                  disabled={isDeleting || isEditing}
                  className="w-2/3 py-3 bg-gonper-primary text-white font-bold rounded-lg hover:bg-gonper-primary-hover transition-colors disabled:opacity-50"
                >
                  {isEditing ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}