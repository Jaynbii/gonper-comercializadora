// Modal para editar los artículos de una requisición (Alex,
// 2026-11-25): cambiar cantidades, quitar artículos y agregar nuevos
// del catálogo. Los candados se muestran en la fila y también los
// vuelve a verificar el servidor al guardar: lo que aquí se ve
// bloqueado no se puede guardar aunque se toque el código.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Plus, Search, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { buscarCandidatos, type ProductoCatalogo } from '@/utils/vincularProductos'
import { normalizarTexto } from '@/utils/filtroCotejo'
import {
  type FilaEdicion,
  type ItemEditado,
} from '@/utils/editarItemsOrden'
import { editarItemsOrden } from '../actions'

type FilaEstado = {
  key: string
  itemId: string | null
  productoId: string | null
  nombre: string
  sku: string
  unidad: string
  cantidad: string
  busqueda: string
  mostrandoCandidatos: boolean
  bloqueo: 'surtido' | 'compra' | null
  surtido: number
  sinSurtir: boolean
}

function aEstado(fila: FilaEdicion): FilaEstado {
  return {
    key: fila.itemId,
    itemId: fila.itemId,
    productoId: fila.productoId,
    nombre: fila.nombre,
    sku: fila.sku,
    unidad: fila.unidad,
    cantidad: String(fila.solicitado),
    busqueda: fila.nombre,
    mostrandoCandidatos: false,
    bloqueo: fila.bloqueo,
    surtido: fila.surtido,
    sinSurtir: fila.sinSurtir ?? false,
  }
}

// Lo mínimo que necesita el modal para elegir un producto: lo
// cumplen tanto un candidato de la búsqueda como un producto del
// catálogo.
type ProductoElegible = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
}

function nuevaFila(key: string): FilaEstado {
  return {
    key,
    itemId: null,
    productoId: null,
    nombre: '',
    sku: '',
    unidad: '',
    cantidad: '',
    busqueda: '',
    mostrandoCandidatos: false,
    bloqueo: null,
    surtido: 0,
    sinSurtir: false,
  }
}

export default function EditarArticulosModal({
  open,
  onClose,
  onGuardado,
  ordenId,
  filas,
  catalogo,
}: {
  open: boolean
  onClose: () => void
  onGuardado: () => void
  ordenId: string
  filas: FilaEdicion[]
  catalogo: ProductoCatalogo[]
}) {
  const [filasEstado, setFilasEstado] = useState<FilaEstado[]>([])
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const keyRef = useRef(0)

  // Cada vez que se abre, se parte de lo que tiene la requisición.
  // El setState va dentro de requestAnimationFrame: el lint del repo
  // (react-hooks/set-state-in-effect) prohíbe el setState directo
  // en el cuerpo del efecto, mismo patrón que el Modal.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      setFilasEstado(filas.map(aEstado))
      setErrorMsg('')
      setGuardando(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [open, filas])

  const firma = useMemo(
    () =>
      filasEstado
        .map(
          (f) =>
            `${f.itemId ?? 'nuevo'}:${f.productoId}:${f.cantidad}:${f.sinSurtir ? '1' : '0'}`,
        )
        .join('|'),
    [filasEstado],
  )
  const firmaOriginal = useMemo(
    () =>
      filas
        .map(
          (f) =>
            `${f.itemId}:${f.productoId}:${f.solicitado}:${f.sinSurtir ? '1' : '0'}`,
        )
        .join('|'),
    [filas],
  )
  const hayCambios = firma !== firmaOriginal

  const actualizar = (key: string, cambio: Partial<FilaEstado>) => {
    setFilasEstado((anteriores) =>
      anteriores.map((f) => (f.key === key ? { ...f, ...cambio } : f)),
    )
  }

  const elegirProducto = (key: string, producto: ProductoElegible) => {
    actualizar(key, {
      productoId: producto.id,
      nombre: producto.nombre,
      sku: producto.sku,
      unidad: producto.unidad_medida || '',
      busqueda: producto.nombre,
      mostrandoCandidatos: false,
    })
  }

  // Al salir del buscador, si lo escrito es exactamente un producto
  // del catálogo se toma; si no, vuelve a mostrar el producto que la
  // fila ya tenía (para no dejar una fila a medias).
  const alSalirBuscador = (fila: FilaEstado) => {
    const escrito = normalizarTexto(fila.busqueda)
    const exacto = catalogo.find(
      (p) => normalizarTexto(p.nombre) === escrito,
    )
    if (exacto) {
      elegirProducto(fila.key, exacto)
      return
    }
    actualizar(fila.key, {
      busqueda: fila.nombre,
      mostrandoCandidatos: false,
    })
  }

  const quitarFila = (key: string) => {
    setFilasEstado((anteriores) => anteriores.filter((f) => f.key !== key))
  }

  const agregarFila = () => {
    keyRef.current += 1
    setFilasEstado((anteriores) => [
      ...anteriores,
      nuevaFila(`nueva-${keyRef.current}`),
    ])
  }

  const guardar = async () => {
    setErrorMsg('')
    const items: ItemEditado[] = []
    for (const fila of filasEstado) {
      if (!fila.productoId) {
        setErrorMsg('Hay una fila sin producto: elige uno del catálogo.')
        return
      }
      const cantidad = Number(fila.cantidad)
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        setErrorMsg(
          `Cantidad inválida para ${fila.nombre || 'un artículo'}.`,
        )
        return
      }
      items.push({
        itemId: fila.itemId,
        productoId: fila.productoId,
        nombre: fila.nombre,
        cantidad,
        unidad: fila.unidad,
        sinSurtir: fila.sinSurtir,
      })
    }
    setGuardando(true)
    const resultado = await editarItemsOrden(ordenId, items)
    setGuardando(false)
    if (!resultado.success) {
      setErrorMsg(resultado.error || 'No se pudieron guardar los cambios.')
      return
    }
    onGuardado()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar artículos"
      description="Cambia cantidades, quita artículos o agrega nuevos del catálogo. Lo surtido y lo comprado no se puede tocar."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="btn btn-quiet"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !hayCambios}
            className="btn btn-primary"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {errorMsg && (
          <p className="rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3.5 py-3 text-[12.5px] text-gonper-danger">
            {errorMsg}
          </p>
        )}

        {filasEstado.map((fila) => {
          const candidatos =
            fila.bloqueo === null && fila.mostrandoCandidatos
              ? buscarCandidatos(fila.busqueda, catalogo, 5)
              : []
          return (
            <div
              key={fila.key}
              className="rounded-[6px] border border-gonper-border bg-gonper-surface p-3.5"
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gonper-muted"
                  strokeWidth={1.75}
                />
                <input
                  type="text"
                  placeholder="Buscar producto"
                  className="field pl-9"
                  value={fila.busqueda}
                  disabled={fila.bloqueo !== null}
                  onChange={(e) =>
                    actualizar(fila.key, {
                      busqueda: e.target.value,
                      mostrandoCandidatos: true,
                    })
                  }
                  onFocus={() =>
                    actualizar(fila.key, { mostrandoCandidatos: true })
                  }
                  onBlur={() => alSalirBuscador(fila)}
                  aria-label="Producto"
                />
                {candidatos.length > 0 && (
                  <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[6px] border border-gonper-border bg-gonper-surface shadow-lg">
                    {candidatos.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => elegirProducto(fila.key, c)}
                        className="block w-full px-3.5 py-2.5 text-left hover:bg-gonper-hover"
                      >
                        <span className="block text-[13px] font-medium">
                          {c.nombre}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] text-gonper-muted">
                          {c.sku}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {fila.mostrandoCandidatos &&
                  fila.busqueda.trim().length >= 2 &&
                  candidatos.length === 0 && (
                    <p className="mt-1.5 text-[12px] text-gonper-muted">
                      Sin coincidencias en el catálogo.
                    </p>
                  )}
              </div>

              <div className="mt-3 flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`cantidad-${fila.key}`}
                    className="text-[10px] font-medium uppercase tracking-[0.08em] text-gonper-muted"
                  >
                    Cantidad{fila.unidad ? ` (${fila.unidad})` : ''}
                  </label>
                  <input
                    id={`cantidad-${fila.key}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={fila.surtido > 0 ? fila.surtido : 0}
                    className="field mt-1"
                    value={fila.cantidad}
                    disabled={fila.bloqueo === 'compra'}
                    onChange={(e) =>
                      actualizar(fila.key, { cantidad: e.target.value })
                    }
                    aria-label="Cantidad solicitada"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => quitarFila(fila.key)}
                  disabled={fila.bloqueo !== null}
                  aria-label={`Quitar ${fila.nombre || 'artículo'}`}
                  className="btn-icon shrink-0"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>

              {fila.surtido > 0 && (
                <p className="mt-2 text-[12px] text-gonper-muted">
                  Surtido: {fila.surtido} {fila.unidad}
                </p>
              )}
              {/* Sin surtir (Alex, 2026-11-25): solo en filas sin
                  candado — lo surtido y lo comprado no se puede
                  marcar, y el servidor lo vuelve a verificar. */}
              {fila.bloqueo === null && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px] leading-snug">
                  <input
                    type="checkbox"
                    checked={fila.sinSurtir}
                    onChange={(e) =>
                      actualizar(fila.key, { sinSurtir: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-gonper-primary"
                  />
                  <span>
                    Sin surtir
                    <span className="text-gonper-muted">
                      {' '}
                      — solo queda en el registro, no se surte ni se
                      compra.
                    </span>
                  </span>
                </label>
              )}
              {fila.bloqueo === 'surtido' && (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-gonper-muted">
                  <Lock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={1.75}
                  />
                  Ya se surtió una parte: la cantidad no puede bajar de{' '}
                  {fila.surtido} ni cambiar de producto.
                </p>
              )}
              {fila.bloqueo === 'compra' && (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-gonper-muted">
                  <Lock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={1.75}
                  />
                  Ya tiene orden de compra: no se puede modificar ni quitar.
                </p>
              )}
            </div>
          )
        })}

        <button
          type="button"
          onClick={agregarFila}
          className="btn btn-quiet w-full justify-center"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Agregar artículo
        </button>
      </div>
    </Modal>
  )
}
