'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  variant?: 'dialog' | 'sheet'
}

/**
 * Diálogo nativo: el navegador se encarga del foco atrapado, Escape,
 * backdrop, capa superior e inercia del resto de la página.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'dialog',
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const cerrandoPorCodigo = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
      const overflowAnterior = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      return () => {
        document.documentElement.style.overflow = overflowAnterior
      }
    }

    if (dialog.open) {
      cerrandoPorCodigo.current = true
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={variant === 'sheet' ? 'sheet-panel' : 'modal-panel'}
      aria-labelledby={titleId}
      onClose={() => {
        if (cerrandoPorCodigo.current) {
          cerrandoPorCodigo.current = false
          return
        }
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-start justify-between gap-6 border-b border-gonper-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[15px] font-semibold tracking-[-0.01em]"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[12.5px] text-gonper-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="btn-icon -mr-1 -mt-1 shrink-0"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gonper-border bg-gonper-bg/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}
