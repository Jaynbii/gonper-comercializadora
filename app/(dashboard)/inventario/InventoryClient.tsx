'use client'

import { useState } from 'react'
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { crearProducto, actualizarProducto, eliminarProducto } from './actions'
import { UNIDADES_COMUNES } from '@/utils/unidades'

type Producto = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
  precio_unitario: number | string
  stock_actual: number | string
  stock_minimo: number | string
  categoria_id: string | null
  categorias?: { nombre?: string } | { nombre?: string }[] | null
}

const numero = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 2,
})

const moneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

function nombreCategoria(producto: Producto) {
  const categoria = Array.isArray(producto.categorias)
    ? producto.categorias[0]
    : producto.categorias

  return categoria?.nombre || 'Sin categoría'
}

function estadoStock(actual: number, minimo: number) {
  if (actual <= 0) {
    return {
      etiqueta: 'Agotado',
      badge: 'border-gonper-danger-border bg-gonper-danger-bg text-gonper-danger',
    }
  }

  if (actual <= minimo) {
    return {
      etiqueta: 'Bajo mínimo',
      badge:
        'border-gonper-warning-border bg-gonper-warning-bg text-gonper-warning',
    }
  }

  return {
    etiqueta: 'Disponible',
    badge:
      'border-gonper-success-border bg-gonper-success-bg text-gonper-success',
  }
}

export default function InventoryClient({
  productosIniciales,
  categorias,
}: {
  productosIniciales: Producto[]
  categorias: { id: string; nombre: string }[]
}) {
  const [busqueda, setBusqueda] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [productoAEditar, setProductoAEditar] = useState<Producto | null>(null)
  const [productoAEliminar, setProductoAEliminar] = useState<Producto | null>(
    null,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [errorEliminar, setErrorEliminar] = useState('')

  const termino = normalizar(busqueda.trim())

  const productosFiltrados = productosIniciales.filter(
    (producto) =>
      normalizar(producto.nombre).includes(termino) ||
      normalizar(producto.sku).includes(termino),
  )

  const abrirCrear = () => {
    setProductoAEditar(null)
    setErrorMsg('')
    setIsSubmitting(false)
    setIsModalOpen(true)
  }

  const abrirEditar = (producto: Producto) => {
    setProductoAEditar(producto)
    setErrorMsg('')
    setIsSubmitting(false)
    setIsModalOpen(true)
  }

  const cerrarEdicion = () => {
    if (isSubmitting) return
    setIsModalOpen(false)
    setErrorMsg('')
  }

  const cerrarEliminar = () => {
    if (isDeleting) return
    setProductoAEliminar(null)
    setErrorEliminar('')
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')

    const formData = new FormData(e.currentTarget)
    const result = productoAEditar
      ? await actualizarProducto(productoAEditar.id, formData)
      : await crearProducto(formData)

    if (result?.error) {
      setErrorMsg(result.error)
      setIsSubmitting(false)
      return
    }

    setIsModalOpen(false)
    setIsSubmitting(false)
  }

  const handleEliminar = async () => {
    if (!productoAEliminar) return

    setIsDeleting(true)
    setErrorEliminar('')

    const result = await eliminarProducto(productoAEliminar.id)

    if (result?.error) {
      setErrorEliminar(result.error)
      setIsDeleting(false)
      return
    }

    setProductoAEliminar(null)
    setIsDeleting(false)
  }

  return (
    <div className="mx-auto max-w-[1180px] pb-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-medium text-gonper-muted">
            {productosIniciales.length}{' '}
            {productosIniciales.length === 1 ? 'producto' : 'productos'} en
            catálogo
          </p>
          <h1 className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[30px]">
            Inventario
          </h1>
        </div>

        <button
          type="button"
          onClick={abrirCrear}
          className="btn btn-primary w-11 px-0 sm:w-auto sm:px-3.5"
          aria-label="Nuevo producto"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          <span className="hidden sm:inline">Nuevo producto</span>
        </button>
      </header>

      <div className="relative mt-5 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gonper-muted"
          strokeWidth={1.75}
        />
        <input
          type="search"
          placeholder="Buscar por nombre o SKU"
          className="field pl-9"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar producto"
        />
      </div>

      {/* Vista móvil */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:hidden">
        {productosFiltrados.map((producto) => {
          const actual = Number(producto.stock_actual)
          const minimo = Number(producto.stock_minimo)
          const estado = estadoStock(actual, minimo)

          return (
            <article key={producto.id} className="card min-w-0 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-gonper-text">
                    {producto.nombre}
                  </h2>
                  <p className="mt-1 font-mono text-[11.5px] text-gonper-muted">
                    {producto.sku}
                  </p>
                  <p className="mt-1 text-[11.5px] font-medium text-gonper-primary">
                    {nombreCategoria(producto)}
                  </p>
                </div>

                <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => abrirEditar(producto)}
                    className="btn-icon"
                    aria-label={`Editar ${producto.nombre}`}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorEliminar('')
                      setProductoAEliminar(producto)
                    }}
                    className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                    aria-label={`Eliminar ${producto.nombre}`}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-end justify-between gap-4 border-t border-gonper-border pt-3">
                <div>
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
                    Stock
                  </p>
                  <p className="mt-1 text-[18px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-gonper-text">
                    {numero.format(actual)}
                    {producto.unidad_medida && (
                      <span className="ml-1.5 text-[11.5px] font-medium tracking-normal text-gonper-muted">
                        {producto.unidad_medida}
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
                    Precio
                  </p>
                  <p className="mt-1 text-[14px] font-semibold tabular-nums text-gonper-text">
                    {moneda.format(Number(producto.precio_unitario))}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`badge ${estado.badge}`}>
                  {estado.etiqueta}
                </span>
                <span className="text-[11px] text-gonper-muted">
                  Mínimo {numero.format(minimo)}
                </span>
              </div>
            </article>
          )
        })}

        {productosFiltrados.length === 0 && (
          <div className="card px-6 py-12 text-center">
            <Package className="mx-auto h-6 w-6 text-gonper-muted" strokeWidth={1.5} />
            <p className="mt-3 text-[14px] font-medium">Sin resultados</p>
            <p className="mt-1 text-[12.5px] text-gonper-muted">
              {busqueda
                ? 'Prueba con otro nombre o SKU.'
                : 'Agrega tu primer producto al catálogo.'}
            </p>
          </div>
        )}
      </div>

      {/* Vista escritorio */}
      <div className="mt-5 hidden overflow-hidden rounded-[8px] border border-gonper-border bg-gonper-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gonper-border bg-gonper-bg/60 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
              <th className="px-5 py-3 font-medium">SKU</th>
              <th className="px-5 py-3 font-medium">Producto</th>
              <th className="px-5 py-3 font-medium">Unidad</th>
              <th className="px-5 py-3 font-medium">Categoría</th>
              <th className="px-5 py-3 text-right font-medium">Precio</th>
              <th className="px-5 py-3 text-center font-medium">Stock</th>
              <th className="px-5 py-3 text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gonper-border">
            {productosFiltrados.map((producto) => {
              const actual = Number(producto.stock_actual)
              const minimo = Number(producto.stock_minimo)
              const estado = estadoStock(actual, minimo)

              return (
                <tr
                  key={producto.id}
                  className="transition-colors duration-[120ms] hover:bg-gonper-hover"
                >
                  <td className="px-5 py-3 font-mono text-[11.5px] text-gonper-muted">
                    {producto.sku}
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-[13.5px] font-medium text-gonper-text">
                      {producto.nombre}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-[12.5px] text-gonper-muted">
                    {producto.unidad_medida || '—'}
                  </td>
                  <td className="px-5 py-3 text-[12.5px] text-gonper-muted">
                    {nombreCategoria(producto)}
                  </td>
                  <td className="px-5 py-3 text-right text-[13px] font-semibold tabular-nums text-gonper-text">
                    {moneda.format(Number(producto.precio_unitario))}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[14px] font-semibold leading-none tabular-nums text-gonper-text">
                        {numero.format(actual)}
                      </span>
                      <span className={`badge ${estado.badge}`}>
                        {estado.etiqueta}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => abrirEditar(producto)}
                        className="btn-icon"
                        title="Editar"
                        aria-label={`Editar ${producto.nombre}`}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorEliminar('')
                          setProductoAEliminar(producto)
                        }}
                        className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                        title="Eliminar"
                        aria-label={`Eliminar ${producto.nombre}`}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {productosFiltrados.length === 0 && (
          <div className="border-t border-gonper-border px-6 py-12 text-center">
            <p className="text-[14px] font-medium">Sin resultados</p>
            <p className="mt-1 text-[12.5px] text-gonper-muted">
              {busqueda
                ? 'Prueba con otro nombre o SKU.'
                : 'Agrega tu primer producto al catálogo.'}
            </p>
          </div>
        )}
      </div>

      {/* Crear / editar */}
      <Modal
        open={isModalOpen}
        onClose={cerrarEdicion}
        title={productoAEditar ? 'Editar producto' : 'Nuevo producto'}
        description={
          productoAEditar
            ? 'Actualiza los datos y las existencias.'
            : 'Registra un producto en el catálogo.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={cerrarEdicion}
              disabled={isSubmitting}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="producto-form"
              disabled={isSubmitting}
              className="btn btn-primary flex-1 sm:flex-none"
            >
              {isSubmitting
                ? 'Guardando…'
                : productoAEditar
                  ? 'Guardar cambios'
                  : 'Crear producto'}
            </button>
          </>
        }
      >
        <form
          id="producto-form"
          key={`${productoAEditar?.id ?? 'nuevo'}-${isModalOpen ? 'abierto' : 'cerrado'}`}
          onSubmit={handleSubmit}
          className="px-5 py-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="sku">
                SKU
              </label>
              <input
                id="sku"
                name="sku"
                required
                defaultValue={productoAEditar?.sku || ''}
                className="field"
                placeholder="ART-001"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="stock_actual">
                Stock actual
              </label>
              <input
                id="stock_actual"
                name="stock_actual"
                type="number"
                step="0.01"
                required
                defaultValue={productoAEditar?.stock_actual ?? '0'}
                className="field"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor="nombre">
              Nombre del producto
            </label>
            <input
              id="nombre"
              name="nombre"
              required
              defaultValue={productoAEditar?.nombre || ''}
              className="field"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="precio_unitario">
                Precio unitario
              </label>
              <input
                id="precio_unitario"
                name="precio_unitario"
                type="number"
                step="0.01"
                required
                defaultValue={productoAEditar?.precio_unitario ?? '0'}
                className="field"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="stock_minimo">
                Stock mínimo
              </label>
              <input
                id="stock_minimo"
                name="stock_minimo"
                type="number"
                step="0.01"
                required
                defaultValue={productoAEditar?.stock_minimo ?? '0'}
                className="field"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="unidad_medida">
                Unidad de medida
              </label>
              <input
                id="unidad_medida"
                name="unidad_medida"
                list="unidades-comunes"
                defaultValue={productoAEditar?.unidad_medida || ''}
                className="field"
                placeholder="CAJA, LITRO, KILO"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="categoria_id">
                Categoría
              </label>
              <select
                id="categoria_id"
                name="categoria_id"
                defaultValue={productoAEditar?.categoria_id || ''}
                className="field"
              >
                <option value="">Sin categoría</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <datalist id="unidades-comunes">
            {UNIDADES_COMUNES.map((unidad) => (
              <option key={unidad} value={unidad} />
            ))}
          </datalist>

          {errorMsg && (
            <p className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
              {errorMsg}
            </p>
          )}
        </form>
      </Modal>

      {/* Confirmar eliminación */}
      <Modal
        open={!!productoAEliminar}
        onClose={cerrarEliminar}
        title="Eliminar producto"
        description="Esta acción no se puede deshacer."
        footer={
          <>
            <button
              type="button"
              onClick={cerrarEliminar}
              disabled={isDeleting}
              className="btn btn-quiet"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleEliminar}
              disabled={isDeleting}
              className="btn border border-gonper-danger bg-gonper-danger text-white hover:bg-gonper-danger/90"
            >
              {isDeleting ? 'Eliminando…' : 'Eliminar'}
            </button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="text-[13.5px] leading-relaxed">
            ¿Eliminar{' '}
            <strong className="font-semibold">{productoAEliminar?.nombre}</strong>
            ? Se quitará del catálogo y dejará de aparecer en nuevas
            requisiciones.
          </p>
          {errorEliminar && (
            <p className="mt-3 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
              {errorEliminar}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
