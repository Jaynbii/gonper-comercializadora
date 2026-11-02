'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { subirYProcesarPDF } from './actions'
import { crearCliente } from '@/app/(dashboard)/clientes/actions'

export default function UploadClient({ clientes }: { clientes: { id: string, nombre: string }[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  
  // Estados para manejar la lista de clientes en vivo y el seleccionado
  const [listaClientes, setListaClientes] = useState(clientes)
  const [clienteSeleccionado, setClienteSeleccionado] = useState('')

  // Estados para el modal de nuevo cliente
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false)
  const [isCreatingCliente, setIsCreatingCliente] = useState(false)
  const [errorMsgCliente, setErrorMsgCliente] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const isValidFile = (file: File) => {
    return file.type === 'application/pdf' || file.type.startsWith('image/')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0]
      if (isValidFile(droppedFile)) {
        setFile(droppedFile); setErrorMsg('')
      } else {
        setErrorMsg('Por favor, sube únicamente archivos PDF o imágenes (JPG, PNG).')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file) { setErrorMsg('Debes seleccionar un archivo primero.'); return }
    setIsUploading(true); setErrorMsg('')
    
    const formData = new FormData(e.currentTarget)
    formData.append('pdf', file) 
    const result = await subirYProcesarPDF(formData)
    
    if (result?.error) {
      setErrorMsg(result.error); setIsUploading(false)
    } else {
      router.push('/ordenes')
    }
  }

  // Lógica para crear el cliente desde el modal
  const handleCrearCliente = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsCreatingCliente(true)
    setErrorMsgCliente('')

    const result = await crearCliente(new FormData(e.currentTarget))
    
    if (result?.error) {
      setErrorMsgCliente(result.error)
      setIsCreatingCliente(false)
    } else if (result?.success && result.cliente) {
      // Agregamos el nuevo cliente a la lista local ordenada alfabéticamente
      const nuevosClientes = [...listaClientes, result.cliente].sort((a, b) => a.nombre.localeCompare(b.nombre))
      setListaClientes(nuevosClientes)
      
      // Seleccionamos automáticamente el cliente recién creado en el combobox
      setClienteSeleccionado(result.cliente.id)
      
      // Cerramos el modal y limpiamos
      setIsClienteModalOpen(false)
      setIsCreatingCliente(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-20 md:pb-0">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gonper-text">Subir Requerimiento</h1>
        <p className="text-sm text-gonper-muted mt-1">Sube el PDF o la foto del requerimiento recibido por WhatsApp.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="bg-gonper-surface p-6 md:p-8 rounded-xl border border-gonper-border shadow-sm">
        
        {/* SELECTOR DE CLIENTE + BOTÓN NUEVO */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gonper-text mb-2">¿De qué mercado es este requerimiento?</label>
          <div className="flex gap-2 flex-col sm:flex-row">
            <select 
              name="cliente_id" 
              required 
              value={clienteSeleccionado}
              onChange={(e) => setClienteSeleccionado(e.target.value)}
              className="flex-1 px-4 py-3 border border-gonper-border rounded-lg focus:outline-none focus:ring-2 focus:ring-gonper-primary bg-white"
            >
              <option value="">Selecciona un cliente...</option>
              {listaClientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            
            <button
              type="button"
              onClick={() => setIsClienteModalOpen(true)}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gonper-text border border-gonper-border rounded-lg font-medium whitespace-nowrap transition-colors flex items-center justify-center gap-1"
            >
              <span className="text-lg">+</span> Nuevo Cliente
            </button>
          </div>
        </div>

        {/* DRAG & DROP ZONE */}
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }} 
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }} 
          onDrop={handleDrop} 
          onClick={() => fileInputRef.current?.click()} 
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-62.5 ${
            isDragging ? 'border-gonper-primary bg-gonper-primary/5' : 
            file ? 'border-emerald-500 bg-emerald-50' : 
            'border-gonper-border hover:border-gonper-primary/50 hover:bg-gonper-bg'
          }`}
        >
          <input 
            type="file" 
            accept=".pdf, image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                if (isValidFile(e.target.files[0])) { setFile(e.target.files[0]); setErrorMsg('') }
                else { setErrorMsg('Por favor, sube únicamente archivos PDF o imágenes.') }
              }
            }} 
          />
          
          {file ? (
            <>
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mb-4">✓</div>
              <p className="font-bold text-gonper-text text-lg">{file.name}</p>
              <p className="text-sm text-gonper-muted mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              <p className="text-sm text-gonper-primary mt-4 font-medium">Haz clic para cambiar el archivo</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-gonper-bg text-gonper-muted rounded-full flex items-center justify-center text-3xl mb-4">📸</div>
              <p className="font-bold text-gonper-text text-lg">Arrastra y suelta tu PDF o Foto aquí</p>
              <p className="text-sm text-gonper-muted mt-1">o haz clic para buscar en tu dispositivo</p>
            </>
          )}
        </div>

        {errorMsg && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">{errorMsg}</p>}
        
        <div className="mt-8 flex flex-col md:flex-row justify-end gap-4">
          <button type="button" onClick={() => router.back()} className="px-6 py-3 text-gonper-muted font-medium hover:bg-gonper-bg rounded-lg w-full md:w-auto order-2 md:order-1">Cancelar</button>
          <button type="submit" disabled={!file || isUploading} className="bg-gonper-primary hover:bg-gonper-primary-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-lg w-full md:w-auto order-1 md:order-2 flex justify-center items-center gap-2">
            {isUploading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Subiendo archivo...</> : 'Subir Archivo'}
          </button>
        </div>
      </form>

      {/* MODAL PARA NUEVO CLIENTE */}
      {isClienteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-gonper-surface w-full max-w-md rounded-t-2xl md:rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gonper-text">Agregar Nuevo Cliente</h2>
              <button type="button" onClick={() => setIsClienteModalOpen(false)} className="text-gonper-muted hover:text-red-500 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleCrearCliente} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre de la Dependencia o Mercado *</label>
                <input name="nombre" required className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" placeholder="Ej. Mercado Municipal..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre del Contacto</label>
                <input name="contacto_nombre" className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" placeholder="Ej. Juan Pérez" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Teléfono</label>
                <input name="telefono" className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" placeholder="Ej. 6691234567" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dirección</label>
                <input name="direccion" className="w-full px-3 py-2 border border-gonper-border rounded-lg focus:ring-2 focus:ring-gonper-primary focus:outline-none" placeholder="Ej. Calle Juárez #123" />
              </div>
              
              {errorMsgCliente && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{errorMsgCliente}</p>}
              
              <button type="submit" disabled={isCreatingCliente} className="mt-4 w-full bg-gonper-primary text-white font-semibold py-3 rounded-lg hover:bg-gonper-primary-hover disabled:bg-gray-400">
                {isCreatingCliente ? 'Guardando...' : 'Guardar Cliente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}