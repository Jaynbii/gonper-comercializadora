'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, MoreHorizontal, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { mostrarToast } from '@/components/ui/Toast'
import { editarOrden, eliminarOrden } from './actions'
import { esRequisicionProtegida } from '@/utils/requisicionesCompletas'

const ESTADOS = [
  { valor: 'BORRADOR', etiqueta: 'Borrador' },
  { valor: 'PENDIENTE', etiqueta: 'Pendiente' },
  { valor: 'PARCIAL', etiqueta: 'Parcial' },
  { valor: 'ENTREGADA', etiqueta: 'Entregada' },
  { valor: 'CANCELADA', etiqueta: 'Cancelada' },
]

export default function AccionesOrden({
  orden,
  clientes,
}: {
  orden: {
    id: string
    folio: string
    cliente_id: string
    estado: string
    pdf_path: string | null
    factura_firmada_path: string | null
  }
  clientes: { id: string; nombre: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [eliminarOpen, setEliminarOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')

  // Candado: con foto firmada y sellada la requisición es evidencia de
  // entrega y no se puede borrar desde la app (el servidor lo vuelve a
  // verificar antes de borrar).
  const protegida = esRequisicionProtegida({
    facturaFirmadaPath: orden.factura_firmada_path,
  })

  const router = useRouter()
  // Cada orden monta su propio modal en la misma página: el id del formulario
  // debe ser único o el botón "Guardar" termina enviando el formulario de otra requisición.
  const formId = `orden-form-${orden.id}`

  const cerrar = () => {
    if (isEditing || isDeleting) return
    setIsOpen(false)
    setErrorMsg('')
  }

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
      mostrarToast('Requisición actualizada.')
      router.refresh()
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'No se pudo guardar la requisición.',
      )
    } finally {
      setIsEditing(false)
    }
  }

  const handleEliminar = async () => {
    setIsDeleting(true)
    setErrorEliminar('')

    try {
      await eliminarOrden(orden.id, orden.pdf_path)
      setEliminarOpen(false)
      setIsOpen(false)
      mostrarToast('Requisición eliminada.')
      router.refresh()
    } catch (error) {
      setErrorEliminar(
        error instanceof Error ? error.message : 'No se pudo eliminar la requisición.',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn-icon"
        title="Gestionar requisición"
        aria-label={`Gestionar requisición ${orden.folio}`}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <Modal
        open={isOpen}
        onClose={cerrar}
        title="Gestionar requisición"
        description={`${orden.folio} · ${orden.estado.toLowerCase()}`}
        footer={
          <>
            {protegida ? (
              <button
                type="button"
                disabled
                title="Entregada y firmada: no se puede eliminar"
                className="btn mr-auto border border-gonper-border bg-gonper-surface-muted text-gonper-muted"
              >
                <Lock className="h-4 w-4" strokeWidth={1.75} />
                Protegida
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setErrorEliminar('')
                  setEliminarOpen(true)
                }}
                disabled={isEditing}
                className="btn mr-auto border border-gonper-danger-border bg-gonper-danger-bg text-gonper-danger hover:bg-gonper-danger-bg/70"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={cerrar}
              disabled={isEditing}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={formId}
              disabled={isEditing}
              className="btn btn-primary flex-1 sm:flex-none"
            >
              {isEditing ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        }
      >
        <form
          id={formId}
          key={`${orden.id}-${isOpen ? 'abierto' : 'cerrado'}`}
          onSubmit={handleEditar}
          className="px-5 py-5"
        >
          <div>
            <label className="field-label" htmlFor={`orden-cliente-${orden.id}`}>
              Cliente / mercado
            </label>
            <select
              id={`orden-cliente-${orden.id}`}
              name="cliente_id"
              defaultValue={orden.cliente_id}
              className="field"
            >
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor={`orden-estado-${orden.id}`}>
              Estado de la requisición
            </label>
            <select
              id={`orden-estado-${orden.id}`}
              name="estado"
              defaultValue={orden.estado}
              className="field"
            >
              {ESTADOS.map((estado) => (
                <option key={estado.valor} value={estado.valor}>
                  {estado.etiqueta}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] leading-relaxed text-gonper-muted">
              Cambiar a cancelada no devuelve el stock automáticamente.
            </p>
          </div>

          {protegida && (
            <p className="mt-4 flex items-start gap-2 rounded-[6px] border border-gonper-success-border bg-gonper-success-bg px-3 py-2 text-[12.5px] leading-relaxed text-gonper-success">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              Esta requisición está entregada y firmada. No se puede eliminar
              desde la app: es la evidencia de entrega.
            </p>
          )}

          {errorMsg && (
            <p className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
              {errorMsg}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={eliminarOpen}
        title="Eliminar requisición"
        description="Esta acción no se puede deshacer."
        pending={isDeleting}
        error={errorEliminar}
        onConfirm={handleEliminar}
        onClose={() => {
          if (isDeleting) return
          setEliminarOpen(false)
          setErrorEliminar('')
        }}
      >
        Se borrará la requisición{' '}
        <strong className="font-semibold">{orden.folio}</strong>, sus artículos y
        el PDF original.
      </ConfirmDialog>
    </>
  )
}
