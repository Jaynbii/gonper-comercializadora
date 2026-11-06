'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  ChevronLeft,
  FileText,
  Loader2,
  Upload,
  UserPlus,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import { subirYProcesarPDF } from './actions'
import { crearCliente } from '@/app/(dashboard)/clientes/actions'

type Cliente = { id: string; nombre: string }

export default function UploadClient({ clientes }: { clientes: Cliente[] }) {
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

  const seleccionarArchivo = (archivo: File) => {
    if (isValidFile(archivo)) {
      setFile(archivo)
      setErrorMsg('')
    } else {
      setErrorMsg('Sube únicamente archivos PDF o imágenes (JPG, PNG).')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      seleccionarArchivo(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file) {
      setErrorMsg('Debes seleccionar un archivo primero.')
      return
    }

    setIsUploading(true)
    setErrorMsg('')

    const formData = new FormData(e.currentTarget)
    formData.append('pdf', file)
    const result = await subirYProcesarPDF(formData)

    if (result?.error) {
      setErrorMsg(result.error)
      setIsUploading(false)
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
      return
    }

    if (result?.success && result.cliente) {
      const nuevosClientes = [...listaClientes, result.cliente as Cliente].sort(
        (a, b) => a.nombre.localeCompare(b.nombre),
      )
      setListaClientes(nuevosClientes)
      setClienteSeleccionado(result.cliente.id)
      setIsClienteModalOpen(false)
    }

    setIsCreatingCliente(false)
  }

  return (
    <div className="mx-auto max-w-[760px] pb-6">
      <Link
        href="/ordenes"
        className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gonper-muted transition-colors duration-[120ms] hover:text-gonper-primary"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        Volver a requisiciones
      </Link>

      <PageHeader
        eyebrow="Requisición"
        title="Nueva requisición"
      />

      <form onSubmit={handleSubmit} className="card mt-5 overflow-hidden">
        <div className="border-b border-gonper-border p-5 sm:p-6">
          <label className="field-label" htmlFor="cliente_id">
            ¿De qué mercado es esta requisición?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="cliente_id"
              name="cliente_id"
              required
              value={clienteSeleccionado}
              onChange={(e) => setClienteSeleccionado(e.target.value)}
              className="field flex-1"
            >
              <option value="">Selecciona un cliente…</option>
              {listaClientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setErrorMsgCliente('')
                setIsClienteModalOpen(true)
              }}
              className="btn btn-quiet shrink-0"
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.75} />
              Nuevo cliente
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <label
            htmlFor="archivo-requerimiento"
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setIsDragging(false)
            }}
            onDrop={handleDrop}
            className={`flex min-h-[15rem] cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed px-5 py-10 text-center transition-colors duration-[140ms] focus-within:border-gonper-primary ${
              isDragging
                ? 'border-gonper-primary bg-gonper-primary/[0.04]'
                : file
                  ? 'border-gonper-success-border bg-gonper-success-bg/60'
                  : 'border-gonper-border hover:border-gonper-muted/50 hover:bg-gonper-bg/60'
            }`}
          >
            <input
              id="archivo-requerimiento"
              type="file"
              accept=".pdf, image/*"
              className="sr-only"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  seleccionarArchivo(e.target.files[0])
                }
              }}
            />

            {file ? (
              <>
                <span className="grid h-14 w-14 place-items-center rounded-full bg-gonper-success-bg text-gonper-success">
                  <CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <p className="mt-4 flex max-w-full items-center gap-2 text-[14px] font-semibold">
                  <FileText
                    className="h-4 w-4 shrink-0 text-gonper-success"
                    strokeWidth={1.75}
                  />
                  <span className="truncate">{file.name}</span>
                </p>
                <p className="mt-1 text-[12.5px] text-gonper-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="mt-4 text-[12.5px] font-medium text-gonper-primary">
                  Haz clic para cambiar el archivo
                </p>
              </>
            ) : (
              <>
                <span className="grid h-14 w-14 place-items-center rounded-full bg-gonper-surface-muted text-gonper-muted">
                  <Upload className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <p className="mt-4 text-[14px] font-semibold">
                  Arrastra el PDF o la foto aquí
                </p>
                <p className="mt-1 text-[12.5px] text-gonper-muted">
                  o haz clic para buscar en tu dispositivo
                </p>
                <p className="mt-4 text-[11.5px] text-gonper-muted">
                  PDF, JPG o PNG
                </p>
              </>
            )}
          </label>

          {errorMsg && (
            <p
              role="alert"
              className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger"
            >
              {errorMsg}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gonper-border bg-gonper-bg/60 p-5 sm:flex-row sm:justify-end sm:p-6">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isUploading}
            className="btn btn-quiet w-full sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!file || isUploading}
            className="btn btn-primary w-full sm:w-auto"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                Subiendo…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" strokeWidth={1.75} />
                Subir archivo
              </>
            )}
          </button>
        </div>
      </form>

      <Modal
        open={isClienteModalOpen}
        onClose={() => {
          if (isCreatingCliente) return
          setIsClienteModalOpen(false)
          setErrorMsgCliente('')
        }}
        title="Nuevo cliente"
        description="Regístralo una sola vez y quedará disponible en todas las requisiciones."
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                if (isCreatingCliente) return
                setIsClienteModalOpen(false)
                setErrorMsgCliente('')
              }}
              disabled={isCreatingCliente}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="cliente-rapido-form"
              disabled={isCreatingCliente}
              className="btn btn-primary flex-1 sm:flex-none"
            >
              {isCreatingCliente ? 'Guardando…' : 'Guardar cliente'}
            </button>
          </>
        }
      >
        <form
          id="cliente-rapido-form"
          key={isClienteModalOpen ? 'abierto' : 'cerrado'}
          onSubmit={handleCrearCliente}
          className="px-5 py-5"
        >
          <div>
            <label className="field-label" htmlFor="nuevo-cliente-nombre">
              Nombre de la dependencia o mercado
            </label>
            <input
              id="nuevo-cliente-nombre"
              name="nombre"
              required
              className="field"
              placeholder="Mercado Municipal"
            />
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor="nuevo-cliente-contacto">
              Nombre del contacto
            </label>
            <input
              id="nuevo-cliente-contacto"
              name="contacto_nombre"
              className="field"
              placeholder="Juan Pérez"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="nuevo-cliente-telefono">
                Teléfono
              </label>
              <input
                id="nuevo-cliente-telefono"
                name="telefono"
                className="field"
                placeholder="669 123 4567"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="nuevo-cliente-direccion">
                Dirección
              </label>
              <input
                id="nuevo-cliente-direccion"
                name="direccion"
                className="field"
                placeholder="Calle Juárez 123"
              />
            </div>
          </div>

          {errorMsgCliente && (
            <p className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
              {errorMsgCliente}
            </p>
          )}
        </form>
      </Modal>
    </div>
  )
}
