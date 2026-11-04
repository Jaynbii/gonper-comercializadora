'use client'

import type { ReactNode } from 'react'
import Modal from '@/components/ui/Modal'

export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Eliminar',
  pendingLabel = 'Eliminando…',
  tono = 'danger',
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  children?: ReactNode
  confirmLabel?: string
  pendingLabel?: string
  tono?: 'danger' | 'primary'
  pending?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn btn-quiet flex-1 sm:flex-none"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`btn flex-1 border text-white sm:flex-none ${
              tono === 'primary'
                ? 'border-gonper-primary bg-gonper-primary hover:bg-gonper-primary-hover'
                : 'border-gonper-danger bg-gonper-danger hover:bg-gonper-danger/90'
            }`}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="px-5 py-5">
        {children && (
          <div className="text-[13.5px] leading-relaxed">{children}</div>
        )}
        {error && (
          <p className="mt-3 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
