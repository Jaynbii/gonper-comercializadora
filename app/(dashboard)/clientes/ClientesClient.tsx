'use client'

import { useState } from 'react'
import {
  Building2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import Fab from '@/components/ui/Fab'
import PageHeader from '@/components/ui/PageHeader'
import { crearCliente, actualizarCliente, eliminarCliente } from './actions'

type Cliente = {
  id: string
  nombre: string
  contacto_nombre: string | null
  telefono: string | null
  direccion: string | null
}

const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export default function ClientesClient({
  clientesIniciales,
}: {
  clientesIniciales: Cliente[]
}) {
  const [listaClientes, setListaClientes] = useState(clientesIniciales)
  const [busqueda, setBusqueda] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [clienteAEditar, setClienteAEditar] = useState<Cliente | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [clienteAEliminar, setClienteAEliminar] = useState<Cliente | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')

  const termino = normalizar(busqueda.trim())

  const clientesFiltrados = listaClientes.filter(
    (cliente) =>
      normalizar(cliente.nombre).includes(termino) ||
      normalizar(cliente.contacto_nombre || '').includes(termino),
  )

  const abrirCrear = () => {
    setClienteAEditar(null)
    setErrorMsg('')
    setIsSubmitting(false)
    setIsModalOpen(true)
  }

  const abrirEditar = (cliente: Cliente) => {
    setClienteAEditar(cliente)
    setErrorMsg('')
    setIsSubmitting(false)
    setIsModalOpen(true)
  }

  const cerrarModal = () => {
    if (isSubmitting) return
    setIsModalOpen(false)
    setErrorMsg('')
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')

    const formData = new FormData(e.currentTarget)
    const nombre = String(formData.get('nombre') || '').trim()
    const contacto_nombre =
      String(formData.get('contacto_nombre') || '').trim() || null
    const telefono = String(formData.get('telefono') || '').trim() || null
    const direccion = String(formData.get('direccion') || '').trim() || null

    const result = clienteAEditar
      ? await actualizarCliente(clienteAEditar.id, formData)
      : await crearCliente(formData)

    if (result?.error) {
      setErrorMsg(result.error)
      setIsSubmitting(false)
      return
    }

    if (clienteAEditar) {
      setListaClientes((prev) =>
        prev
          .map((cliente) =>
            cliente.id === clienteAEditar.id
              ? { ...cliente, nombre, contacto_nombre, telefono, direccion }
              : cliente,
          )
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      )
    } else if (result && result.success && 'cliente' in result && result.cliente) {
      setListaClientes((prev) =>
        [...prev, result.cliente as Cliente].sort((a, b) =>
          a.nombre.localeCompare(b.nombre),
        ),
      )
    }

    setIsModalOpen(false)
    setIsSubmitting(false)
  }

  const handleEliminar = async () => {
    if (!clienteAEliminar) return

    setIsDeleting(true)
    setErrorEliminar('')

    const result = await eliminarCliente(clienteAEliminar.id)

    if (result?.error) {
      setErrorEliminar(result.error)
      setIsDeleting(false)
      return
    }

    setListaClientes((prev) =>
      prev.filter((cliente) => cliente.id !== clienteAEliminar.id),
    )
    setClienteAEliminar(null)
    setIsDeleting(false)
  }

  return (
    <div className="mx-auto max-w-[1180px] pb-6">
      <PageHeader
        eyebrow={`${listaClientes.length} ${
          listaClientes.length === 1 ? 'cliente' : 'clientes'
        } en el directorio`}
        title="Clientes"
        action={
          <button
            type="button"
            onClick={abrirCrear}
            className="btn btn-primary hidden sm:inline-flex"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo cliente
          </button>
        }
      />

      <div className="relative mt-5 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gonper-muted"
          strokeWidth={1.75}
        />
        <input
          type="search"
          placeholder="Buscar cliente o contacto"
          className="field pl-9"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar cliente"
        />
      </div>

      <div className="stagger mt-4 grid grid-cols-1 gap-3 md:hidden">
        {clientesFiltrados.map((cliente) => (
          <article key={cliente.id} className="card min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[14.5px] font-semibold leading-snug tracking-[-0.01em]">
                  {cliente.nombre}
                </h2>

                <div className="mt-2 space-y-1">
                  {cliente.contacto_nombre ? (
                    <p className="flex items-center gap-1.5 text-[12px] text-gonper-muted">
                      <UserRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {cliente.contacto_nombre}
                    </p>
                  ) : null}
                  {cliente.telefono ? (
                    <p className="flex items-center gap-1.5 text-[12px] text-gonper-muted">
                      <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {cliente.telefono}
                    </p>
                  ) : null}
                  {cliente.direccion ? (
                    <p className="flex items-start gap-1.5 text-[12px] text-gonper-muted">
                      <MapPin
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span className="line-clamp-2">{cliente.direccion}</span>
                    </p>
                  ) : null}
                  {!cliente.contacto_nombre &&
                    !cliente.telefono &&
                    !cliente.direccion && (
                      <p className="text-[12px] text-gonper-muted">
                        Sin datos de contacto
                      </p>
                    )}
                </div>
              </div>

              <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => abrirEditar(cliente)}
                  className="btn-icon"
                  aria-label={`Editar ${cliente.nombre}`}
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorEliminar('')
                    setClienteAEliminar(cliente)
                  }}
                  className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                  aria-label={`Eliminar ${cliente.nombre}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </article>
        ))}

        {clientesFiltrados.length === 0 && (
          <div className="card">
            <EmptyState
              icon={<Building2 className="h-6 w-6" strokeWidth={1.5} />}
              title="Sin clientes"
              description={
                busqueda
                  ? 'Prueba con otro nombre o contacto.'
                  : 'Agrega el primer mercado o dependencia.'
              }
            />
          </div>
        )}
      </div>

      <div className="mt-5 hidden overflow-hidden rounded-[8px] border border-gonper-border bg-gonper-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gonper-border bg-gonper-bg/60 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
              <th className="px-5 py-3 font-medium">Nombre / Dependencia</th>
              <th className="px-5 py-3 font-medium">Contacto</th>
              <th className="px-5 py-3 font-medium">Teléfono</th>
              <th className="px-5 py-3 font-medium">Dirección</th>
              <th className="px-5 py-3 text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gonper-border">
            {clientesFiltrados.map((cliente) => (
              <tr
                key={cliente.id}
                className="transition-colors duration-[120ms] hover:bg-gonper-hover"
              >
                <td className="px-5 py-3.5 text-[13.5px] font-medium">
                  {cliente.nombre}
                </td>
                <td className="px-5 py-3.5 text-[12.5px] text-gonper-muted">
                  {cliente.contacto_nombre || '—'}
                </td>
                <td className="px-5 py-3.5 text-[12.5px] text-gonper-muted">
                  {cliente.telefono || '—'}
                </td>
                <td className="max-w-[22rem] px-5 py-3.5 text-[12.5px] text-gonper-muted">
                  <span className="line-clamp-1">{cliente.direccion || '—'}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => abrirEditar(cliente)}
                      className="btn-icon"
                      title="Editar cliente"
                      aria-label={`Editar ${cliente.nombre}`}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorEliminar('')
                        setClienteAEliminar(cliente)
                      }}
                      className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                      title="Eliminar cliente"
                      aria-label={`Eliminar ${cliente.nombre}`}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {clientesFiltrados.length === 0 && (
          <EmptyState
            icon={<Building2 className="h-6 w-6" strokeWidth={1.5} />}
            title="Sin clientes"
            description={
              busqueda
                ? 'Prueba con otro nombre o contacto.'
                : 'Agrega el primer mercado o dependencia.'
            }
          />
        )}
      </div>

      <Fab
        label="Nuevo cliente"
        onClick={abrirCrear}
        icon={<Plus className="h-6 w-6" strokeWidth={2} />}
      />

      <Modal
        open={isModalOpen}
        onClose={cerrarModal}
        title={clienteAEditar ? 'Editar cliente' : 'Nuevo cliente'}
        description={
          clienteAEditar
            ? 'Actualiza los datos de contacto.'
            : 'Registra un mercado o dependencia.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={cerrarModal}
              disabled={isSubmitting}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="cliente-form"
              disabled={isSubmitting}
              className="btn btn-primary flex-1 sm:flex-none"
            >
              {isSubmitting
                ? 'Guardando…'
                : clienteAEditar
                  ? 'Guardar cambios'
                  : 'Crear cliente'}
            </button>
          </>
        }
      >
        <form
          id="cliente-form"
          key={`${clienteAEditar?.id ?? 'nuevo'}-${
            isModalOpen ? 'abierto' : 'cerrado'
          }`}
          onSubmit={handleSubmit}
          className="px-5 py-5"
        >
          <div>
            <label className="field-label" htmlFor="cliente-nombre">
              Nombre de la dependencia o mercado
            </label>
            <input
              id="cliente-nombre"
              name="nombre"
              required
              defaultValue={clienteAEditar?.nombre || ''}
              className="field"
              placeholder="Mercado Municipal"
            />
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor="cliente-contacto">
              Nombre del contacto
            </label>
            <input
              id="cliente-contacto"
              name="contacto_nombre"
              defaultValue={clienteAEditar?.contacto_nombre || ''}
              className="field"
              placeholder="Juan Pérez"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="cliente-telefono">
                Teléfono
              </label>
              <input
                id="cliente-telefono"
                name="telefono"
                defaultValue={clienteAEditar?.telefono || ''}
                className="field"
                placeholder="669 123 4567"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="cliente-direccion">
                Dirección
              </label>
              <input
                id="cliente-direccion"
                name="direccion"
                defaultValue={clienteAEditar?.direccion || ''}
                className="field"
                placeholder="Calle Juárez 123"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
              {errorMsg}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!clienteAEliminar}
        title="Eliminar cliente"
        description="Esta acción no se puede deshacer."
        pending={isDeleting}
        error={errorEliminar}
        onConfirm={handleEliminar}
        onClose={() => {
          if (isDeleting) return
          setClienteAEliminar(null)
          setErrorEliminar('')
        }}
      >
        ¿Eliminar{' '}
        <strong className="font-semibold">{clienteAEliminar?.nombre}</strong>? Se
        quitará del directorio.
      </ConfirmDialog>
    </div>
  )
}
