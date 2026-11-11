'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Factory,
  Mail,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import Fab from '@/components/ui/Fab'
import PageHeader from '@/components/ui/PageHeader'
import {
  crearProveedor,
  actualizarProveedor,
  eliminarProveedor,
  asignarPrecioAProducto,
  actualizarPrecioProducto,
  quitarProductoAProveedor,
} from './actions'
import {
  detectarHuecos,
  type HuecoProveedor,
} from '@/utils/huecosProveedor'

type Producto = { id: string; nombre: string; sku: string }

type Relacion = {
  id: string
  precio_unitario: number | string
  productos: Producto | null
}

type Proveedor = {
  id: string
  nombre: string
  telefono: string | null
  correo: string | null
  producto_proveedores?: Relacion[]
}

const moneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export default function ProveedoresClient({
  proveedoresIniciales,
  catalogoProductos,
}: {
  proveedoresIniciales: Proveedor[]
  catalogoProductos: Producto[]
}) {
  const [listaProveedores, setListaProveedores] = useState(proveedoresIniciales)
  const [busqueda, setBusqueda] = useState('')

  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false)
  const [proveedorAEditar, setProveedorAEditar] = useState<Proveedor | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [proveedorActivo, setProveedorActivo] = useState<Proveedor | null>(null)
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [errorMsgProducto, setErrorMsgProducto] = useState('')

  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productoSeleccionado, setProductoSeleccionado] =
    useState<Producto | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const [relacionEditando, setRelacionEditando] = useState<string | null>(null)
  const [precioEdicion, setPrecioEdicion] = useState('')
  const [isUpdatingPrecio, setIsUpdatingPrecio] = useState(false)
  const [errorPrecio, setErrorPrecio] = useState('')

  const [proveedorAEliminar, setProveedorAEliminar] = useState<Proveedor | null>(
    null,
  )
  const [isDeletingProveedor, setIsDeletingProveedor] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')

  const [relacionAEliminar, setRelacionAEliminar] = useState<Relacion | null>(null)
  const [isRemovingProduct, setIsRemovingProduct] = useState(false)
  const [errorQuitar, setErrorQuitar] = useState('')

  // Sección "Productos sin proveedor o sin precio": cada fila lleva
  // su propia elección de proveedor, precio, guardado y error.
  const [eleccionHueco, setEleccionHueco] = useState<Record<string, string>>({})
  const [precioHueco, setPrecioHueco] = useState<Record<string, string>>({})
  const [guardandoHueco, setGuardandoHueco] = useState<string | null>(null)
  const [errorHueco, setErrorHueco] = useState<Record<string, string>>({})

  const termino = normalizar(busqueda.trim())

  const proveedoresFiltrados = listaProveedores.filter((proveedor) =>
    normalizar(proveedor.nombre).includes(termino),
  )

  // Huecos: productos del catálogo sin vínculo con precio > 0.
  // Se deriva del estado local para que la fila desaparezca en
  // cuanto se guarda sin recargar la página.
  const vinculosCrudos = useMemo(
    () =>
      listaProveedores.flatMap((proveedor) =>
        (proveedor.producto_proveedores || []).map((relacion) => ({
          productoId: relacion.productos?.id ?? '',
          proveedorId: proveedor.id,
          proveedorNombre: proveedor.nombre,
          relacionId: relacion.id,
          precio: relacion.precio_unitario,
        })),
      ),
    [listaProveedores],
  )

  const huecos = useMemo(
    () => detectarHuecos(catalogoProductos, vinculosCrudos),
    [catalogoProductos, vinculosCrudos],
  )

  const abrirCrear = () => {
    setProveedorAEditar(null)
    setErrorMsg('')
    setIsSubmitting(false)
    setIsProveedorModalOpen(true)
  }

  const abrirEditar = (proveedor: Proveedor) => {
    setProveedorAEditar(proveedor)
    setErrorMsg('')
    setIsSubmitting(false)
    setIsProveedorModalOpen(true)
  }

  const cerrarProveedorModal = () => {
    if (isSubmitting) return
    setIsProveedorModalOpen(false)
    setErrorMsg('')
  }

  const handleSubmitProveedor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')

    const formData = new FormData(e.currentTarget)
    const nombre = String(formData.get('nombre') || '').trim()
    const telefono = String(formData.get('telefono') || '').trim() || null
    const correo = String(formData.get('correo') || '').trim() || null

    const result = proveedorAEditar
      ? await actualizarProveedor(proveedorAEditar.id, formData)
      : await crearProveedor(formData)

    if (result?.error) {
      setErrorMsg(result.error)
      setIsSubmitting(false)
      return
    }

    if (proveedorAEditar) {
      const actualizado = {
        ...proveedorAEditar,
        nombre,
        telefono,
        correo,
      }
      setListaProveedores((prev) =>
        prev
          .map((proveedor) =>
            proveedor.id === actualizado.id ? actualizado : proveedor,
          )
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      )
      setProveedorActivo((prev) =>
        prev?.id === actualizado.id ? { ...prev, nombre, telefono, correo } : prev,
      )
    } else if (
      result &&
      result.success &&
      'proveedor' in result &&
      result.proveedor
    ) {
      const nuevo: Proveedor = {
        ...(result.proveedor as Proveedor),
        producto_proveedores: [],
      }
      setListaProveedores((prev) =>
        [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      )
    }

    setIsProveedorModalOpen(false)
    setIsSubmitting(false)
  }

  const handleEliminarProveedor = async () => {
    if (!proveedorAEliminar) return

    setIsDeletingProveedor(true)
    setErrorEliminar('')

    const result = await eliminarProveedor(proveedorAEliminar.id)

    if (result?.error) {
      setErrorEliminar(result.error)
      setIsDeletingProveedor(false)
      return
    }

    setListaProveedores((prev) =>
      prev.filter((proveedor) => proveedor.id !== proveedorAEliminar.id),
    )
    if (proveedorActivo?.id === proveedorAEliminar.id) setProveedorActivo(null)
    setProveedorAEliminar(null)
    setIsDeletingProveedor(false)
  }

  const productosDisponibles = catalogoProductos.filter(
    (producto) =>
      !proveedorActivo?.producto_proveedores?.some(
        (relacion) => relacion.productos?.id === producto.id,
      ),
  )

  const productosFiltradosBusqueda = productosDisponibles.filter(
    (producto) =>
      normalizar(producto.nombre).includes(normalizar(busquedaProducto)) ||
      normalizar(producto.sku).includes(normalizar(busquedaProducto)),
  )

  const handleSelectProducto = (producto: Producto) => {
    setProductoSeleccionado(producto)
    setBusquedaProducto('')
    setIsDropdownOpen(false)
  }

  const handleAddProducto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proveedorActivo || !productoSeleccionado || !nuevoPrecio) return

    setIsAddingProduct(true)
    setErrorMsgProducto('')

    const result = await asignarPrecioAProducto(
      proveedorActivo.id,
      productoSeleccionado.id,
      parseFloat(nuevoPrecio),
    )

    if (result?.error) {
      setErrorMsgProducto(result.error)
      setIsAddingProduct(false)
      return
    }

    if (result?.success && result.id) {
      const nuevaRelacion: Relacion = {
        id: result.id,
        precio_unitario: parseFloat(nuevoPrecio),
        productos: productoSeleccionado,
      }

      const actualizado: Proveedor = {
        ...proveedorActivo,
        producto_proveedores: [
          ...(proveedorActivo.producto_proveedores || []),
          nuevaRelacion,
        ],
      }

      setProveedorActivo(actualizado)
      setListaProveedores((prev) =>
        prev.map((proveedor) =>
          proveedor.id === actualizado.id ? actualizado : proveedor,
        ),
      )

      setNuevoPrecio('')
      setProductoSeleccionado(null)
    }

    setIsAddingProduct(false)
  }

  const empezarEdicionPrecio = (relacion: Relacion) => {
    setRelacionEditando(relacion.id)
    setPrecioEdicion(String(relacion.precio_unitario))
    setErrorPrecio('')
  }

  const guardarPrecio = async (relacion: Relacion) => {
    if (!proveedorActivo) return

    const precio = Number(precioEdicion)

    if (!Number.isFinite(precio) || precio < 0) {
      setErrorPrecio('Ingresa un precio válido.')
      return
    }

    setIsUpdatingPrecio(true)
    setErrorPrecio('')

    const result = await actualizarPrecioProducto(relacion.id, precio)

    if (result?.error) {
      setErrorPrecio(result.error)
      setIsUpdatingPrecio(false)
      return
    }

    const actualizado: Proveedor = {
      ...proveedorActivo,
      producto_proveedores: (proveedorActivo.producto_proveedores || []).map(
        (item) =>
          item.id === relacion.id ? { ...item, precio_unitario: precio } : item,
      ),
    }

    setProveedorActivo(actualizado)
    setListaProveedores((prev) =>
      prev.map((proveedor) =>
        proveedor.id === actualizado.id ? actualizado : proveedor,
      ),
    )
    setRelacionEditando(null)
    setIsUpdatingPrecio(false)
  }

  const handleQuitarProducto = async () => {
    if (!proveedorActivo || !relacionAEliminar) return

    setIsRemovingProduct(true)
    setErrorQuitar('')

    const result = await quitarProductoAProveedor(relacionAEliminar.id)

    if (result?.error) {
      setErrorQuitar(result.error)
      setIsRemovingProduct(false)
      return
    }

    const actualizado: Proveedor = {
      ...proveedorActivo,
      producto_proveedores: (proveedorActivo.producto_proveedores || []).filter(
        (item) => item.id !== relacionAEliminar.id,
      ),
    }

    setProveedorActivo(actualizado)
    setListaProveedores((prev) =>
      prev.map((proveedor) =>
        proveedor.id === actualizado.id ? actualizado : proveedor,
      ),
    )
    setRelacionAEliminar(null)
    setIsRemovingProduct(false)
  }

  // Guarda un hueco desde la sección de productos sin proveedor o
  // sin precio: vínculo nuevo (asignarPrecioAProducto) o precio
  // nuevo sobre un vínculo existente (actualizarPrecioProducto).
  // Al guardar, el estado local se actualiza y la fila sale sola.
  const guardarHueco = async (hueco: HuecoProveedor) => {
    const eleccion = eleccionHueco[hueco.productoId] || ''
    const precioTexto = (precioHueco[hueco.productoId] || '').trim()
    const precio = parseFloat(precioTexto)

    if (!eleccion) {
      setErrorHueco((prev) => ({
        ...prev,
        [hueco.productoId]: 'Elige un proveedor.',
      }))
      return
    }
    if (!precioTexto || !Number.isFinite(precio) || precio <= 0) {
      setErrorHueco((prev) => ({
        ...prev,
        [hueco.productoId]: 'Escribe un precio mayor a 0.',
      }))
      return
    }

    setGuardandoHueco(hueco.productoId)
    setErrorHueco((prev) => ({ ...prev, [hueco.productoId]: '' }))

    if (hueco.tipo === 'sin-proveedor') {
      const result = await asignarPrecioAProducto(
        eleccion,
        hueco.productoId,
        precio,
      )

      if (result?.error) {
        setErrorHueco((prev) => ({
          ...prev,
          [hueco.productoId]: result.error,
        }))
        setGuardandoHueco(null)
        return
      }

      const nuevaRelacion: Relacion = {
        id: result.id as string,
        precio_unitario: precio,
        productos: {
          id: hueco.productoId,
          nombre: hueco.nombre,
          sku: hueco.sku,
        },
      }
      setListaProveedores((prev) =>
        prev.map((proveedor) =>
          proveedor.id === eleccion
            ? {
                ...proveedor,
                producto_proveedores: [
                  ...(proveedor.producto_proveedores || []),
                  nuevaRelacion,
                ],
              }
            : proveedor,
        ),
      )
      setProveedorActivo((prev) =>
        prev?.id === eleccion
          ? {
              ...prev,
              producto_proveedores: [
                ...(prev.producto_proveedores || []),
                nuevaRelacion,
              ],
            }
          : prev,
      )
    } else {
      const result = await actualizarPrecioProducto(eleccion, precio)

      if (result?.error) {
        setErrorHueco((prev) => ({
          ...prev,
          [hueco.productoId]: result.error,
        }))
        setGuardandoHueco(null)
        return
      }

      const parchearPrecio = (proveedor: Proveedor): Proveedor => ({
        ...proveedor,
        producto_proveedores: (proveedor.producto_proveedores || []).map(
          (relacion) =>
            relacion.id === eleccion
              ? { ...relacion, precio_unitario: precio }
              : relacion,
        ),
      })
      setListaProveedores((prev) => prev.map(parchearPrecio))
      setProveedorActivo((prev) => (prev ? parchearPrecio(prev) : prev))
    }

    setEleccionHueco((prev) => ({ ...prev, [hueco.productoId]: '' }))
    setPrecioHueco((prev) => ({ ...prev, [hueco.productoId]: '' }))
    setGuardandoHueco(null)
  }

  return (
    <div className="mx-auto max-w-[1180px] pb-6">
      <PageHeader
        eyebrow={`${listaProveedores.length} ${
          listaProveedores.length === 1 ? 'proveedor' : 'proveedores'
        } en el directorio`}
        title="Proveedores"
        action={
          <button
            type="button"
            onClick={abrirCrear}
            className="btn btn-primary hidden sm:inline-flex"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo proveedor
          </button>
        }
      />

      <section
        className="card mt-5 p-4 sm:p-5"
        aria-label="Productos sin proveedor o sin precio"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14.5px] font-semibold tracking-[-0.01em]">
            Productos sin proveedor o sin precio
          </h2>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${
              huecos.length > 0
                ? 'border-gonper-warning-border bg-gonper-warning-bg text-gonper-warning'
                : 'border-gonper-success-border bg-gonper-success-bg text-gonper-primary'
            }`}
          >
            {huecos.length}
          </span>
        </div>

        {huecos.length === 0 ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-gonper-muted">
            <Check className="h-4 w-4 text-gonper-primary" strokeWidth={1.75} />
            Todos los productos tienen proveedor y precio.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-gonper-muted">
              Asigna el proveedor y el precio sin salir de aquí. Al guardar,
              el producto sale de esta lista.
            </p>
            <div className="mt-3 max-h-[440px] divide-y divide-gonper-border overflow-y-auto rounded-[8px] border border-gonper-border">
              {huecos.map((hueco) => (
                <div key={hueco.productoId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">
                        {hueco.nombre}
                      </p>
                      <p className="text-[11.5px] text-gonper-muted">
                        {hueco.sku}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-gonper-warning-border bg-gonper-warning-bg px-2.5 py-0.5 text-[11px] font-semibold text-gonper-warning">
                      {hueco.tipo === 'sin-proveedor'
                        ? 'Sin proveedor'
                        : 'Sin precio'}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="field sm:max-w-[240px]"
                      aria-label={`Proveedor para ${hueco.nombre}`}
                      value={eleccionHueco[hueco.productoId] || ''}
                      onChange={(e) =>
                        setEleccionHueco((prev) => ({
                          ...prev,
                          [hueco.productoId]: e.target.value,
                        }))
                      }
                    >
                      <option value="" disabled>
                        {hueco.tipo === 'sin-proveedor'
                          ? 'Elige proveedor'
                          : 'Elige proveedor vinculado'}
                      </option>
                      {hueco.tipo === 'sin-proveedor'
                        ? listaProveedores.map((proveedor) => (
                            <option key={proveedor.id} value={proveedor.id}>
                              {proveedor.nombre}
                            </option>
                          ))
                        : hueco.vinculos.map((vinculo) => (
                            <option
                              key={vinculo.relacionId}
                              value={vinculo.relacionId}
                            >
                              {vinculo.proveedorNombre}
                            </option>
                          ))}
                    </select>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="Precio"
                      className="field sm:w-32"
                      aria-label={`Precio para ${hueco.nombre}`}
                      value={precioHueco[hueco.productoId] || ''}
                      onChange={(e) =>
                        setPrecioHueco((prev) => ({
                          ...prev,
                          [hueco.productoId]: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => void guardarHueco(hueco)}
                      disabled={guardandoHueco === hueco.productoId}
                      className="btn btn-primary text-[13px] sm:ml-auto"
                    >
                      {guardandoHueco === hueco.productoId
                        ? 'Guardando…'
                        : 'Guardar'}
                    </button>
                  </div>

                  {errorHueco[hueco.productoId] ? (
                    <p className="mt-2 text-[12px] text-gonper-danger">
                      {errorHueco[hueco.productoId]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="relative mt-5 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gonper-muted"
          strokeWidth={1.75}
        />
        <input
          type="search"
          placeholder="Buscar proveedor"
          className="field pl-9"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar proveedor"
        />
      </div>

      <div className="stagger mt-4 grid grid-cols-1 gap-3 md:hidden">
        {proveedoresFiltrados.map((proveedor) => (
          <article key={proveedor.id} className="card min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[14.5px] font-semibold leading-snug tracking-[-0.01em]">
                  {proveedor.nombre}
                </h2>

                <div className="mt-2 space-y-1">
                  {proveedor.telefono ? (
                    <p className="flex items-center gap-1.5 text-[12px] text-gonper-muted">
                      <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {proveedor.telefono}
                    </p>
                  ) : null}
                  {proveedor.correo ? (
                    <p className="flex items-center gap-1.5 truncate text-[12px] text-gonper-muted">
                      <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{proveedor.correo}</span>
                    </p>
                  ) : null}
                  {!proveedor.telefono && !proveedor.correo && (
                    <p className="text-[12px] text-gonper-muted">
                      Sin datos de contacto
                    </p>
                  )}
                </div>
              </div>

              <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => abrirEditar(proveedor)}
                  className="btn-icon"
                  aria-label={`Editar ${proveedor.nombre}`}
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorEliminar('')
                    setProveedorAEliminar(proveedor)
                  }}
                  className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                  aria-label={`Eliminar ${proveedor.nombre}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setProveedorActivo(proveedor)}
              className="mt-4 flex w-full items-center justify-between rounded-[6px] border border-gonper-border bg-gonper-bg/60 px-3 py-2.5 text-left transition-colors duration-[120ms] hover:bg-gonper-hover"
            >
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-gonper-primary">
                <Package className="h-4 w-4" strokeWidth={1.75} />
                Catálogo y precios
              </span>
              <span className="flex items-center gap-1 text-[11.5px] font-medium text-gonper-muted">
                {proveedor.producto_proveedores?.length || 0}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
            </button>
          </article>
        ))}

        {proveedoresFiltrados.length === 0 && (
          <div className="card">
            <EmptyState
              icon={<Factory className="h-6 w-6" strokeWidth={1.5} />}
              title="Sin proveedores"
              description={
                busqueda
                  ? 'Prueba con otro nombre.'
                  : 'Agrega tu primer proveedor para asociar precios a los productos.'
              }
            />
          </div>
        )}
      </div>

      <div className="mt-5 hidden overflow-hidden rounded-[8px] border border-gonper-border bg-gonper-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gonper-border bg-gonper-bg/60 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
              <th className="px-5 py-3 font-medium">Proveedor</th>
              <th className="px-5 py-3 font-medium">Contacto</th>
              <th className="px-5 py-3 text-center font-medium">Catálogo</th>
              <th className="px-5 py-3 text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gonper-border">
            {proveedoresFiltrados.map((proveedor) => (
              <tr
                key={proveedor.id}
                className="transition-colors duration-[120ms] hover:bg-gonper-hover"
              >
                <td className="px-5 py-3.5 text-[13.5px] font-medium">
                  {proveedor.nombre}
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-[12.5px] text-gonper-muted">
                    {proveedor.telefono || 'Sin teléfono'}
                  </p>
                  <p className="text-[12px] text-gonper-muted">
                    {proveedor.correo || 'Sin correo'}
                  </p>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <button
                    type="button"
                    onClick={() => setProveedorActivo(proveedor)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gonper-border bg-gonper-bg/60 px-3 py-1.5 text-[12px] font-medium text-gonper-primary transition-colors duration-[120ms] hover:bg-gonper-hover"
                  >
                    {proveedor.producto_proveedores?.length || 0} productos
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => abrirEditar(proveedor)}
                      className="btn-icon"
                      title="Editar proveedor"
                      aria-label={`Editar ${proveedor.nombre}`}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorEliminar('')
                        setProveedorAEliminar(proveedor)
                      }}
                      className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                      title="Eliminar proveedor"
                      aria-label={`Eliminar ${proveedor.nombre}`}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {proveedoresFiltrados.length === 0 && (
          <EmptyState
            icon={<Factory className="h-6 w-6" strokeWidth={1.5} />}
            title="Sin proveedores"
            description={
              busqueda
                ? 'Prueba con otro nombre.'
                : 'Agrega tu primer proveedor para asociar precios a los productos.'
            }
          />
        )}
      </div>

      <Fab
        label="Nuevo proveedor"
        onClick={abrirCrear}
        icon={<Plus className="h-6 w-6" strokeWidth={2} />}
      />

      <Modal
        open={isProveedorModalOpen}
        onClose={cerrarProveedorModal}
        title={proveedorAEditar ? 'Editar proveedor' : 'Nuevo proveedor'}
        description={
          proveedorAEditar
            ? 'Actualiza los datos de contacto.'
            : 'Registra un proveedor en el directorio.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={cerrarProveedorModal}
              disabled={isSubmitting}
              className="btn btn-quiet flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="proveedor-form"
              disabled={isSubmitting}
              className="btn btn-primary flex-1 sm:flex-none"
            >
              {isSubmitting
                ? 'Guardando…'
                : proveedorAEditar
                  ? 'Guardar cambios'
                  : 'Crear proveedor'}
            </button>
          </>
        }
      >
        <form
          id="proveedor-form"
          key={`${proveedorAEditar?.id ?? 'nuevo'}-${
            isProveedorModalOpen ? 'abierto' : 'cerrado'
          }`}
          onSubmit={handleSubmitProveedor}
          className="px-5 py-5"
        >
          <div>
            <label className="field-label" htmlFor="proveedor-nombre">
              Nombre de la empresa
            </label>
            <input
              id="proveedor-nombre"
              name="nombre"
              required
              defaultValue={proveedorAEditar?.nombre || ''}
              className="field"
              placeholder="Distribuidora Culiacán"
            />
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor="proveedor-telefono">
              Teléfono
            </label>
            <input
              id="proveedor-telefono"
              name="telefono"
              defaultValue={proveedorAEditar?.telefono || ''}
              className="field"
              placeholder="669 123 4567"
            />
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor="proveedor-correo">
              Correo electrónico
            </label>
            <input
              id="proveedor-correo"
              name="correo"
              type="email"
              defaultValue={proveedorAEditar?.correo || ''}
              className="field"
              placeholder="ventas@proveedor.com"
            />
          </div>

          {errorMsg && (
            <p className="mt-4 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
              {errorMsg}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={!!proveedorActivo}
        onClose={() => {
          setProveedorActivo(null)
          setRelacionEditando(null)
          setErrorPrecio('')
          setErrorMsgProducto('')
        }}
        title="Catálogo y precios"
        description={proveedorActivo?.nombre ?? undefined}
      >
        {proveedorActivo && (
          <div className="px-5 py-5">
            <form
              onSubmit={handleAddProducto}
              className="rounded-[6px] border border-gonper-border bg-gonper-bg/60 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
                <div className="relative">
                  <label className="field-label" htmlFor="producto-busqueda">
                    Producto del inventario
                  </label>

                  {productoSeleccionado ? (
                    <div className="flex h-11 items-center justify-between gap-2 rounded-[6px] border border-gonper-success-border bg-gonper-success-bg px-3 sm:h-10">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-gonper-success">
                          {productoSeleccionado.nombre}
                        </p>
                        <p className="font-mono text-[11px] text-gonper-success/80">
                          {productoSeleccionado.sku}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProductoSeleccionado(null)}
                        className="btn-icon shrink-0 text-gonper-success"
                        aria-label="Quitar producto seleccionado"
                      >
                        <X className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        id="producto-busqueda"
                        type="search"
                        placeholder="Nombre o SKU"
                        value={busquedaProducto}
                        onChange={(e) => {
                          setBusquedaProducto(e.target.value)
                          setIsDropdownOpen(true)
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        className="field"
                        autoComplete="off"
                      />

                      {isDropdownOpen && busquedaProducto.trim().length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-[6px] border border-gonper-border bg-gonper-surface py-1 shadow-[0_18px_44px_-14px_rgba(27,26,24,0.24)]">
                          {productosFiltradosBusqueda.length > 0 ? (
                            productosFiltradosBusqueda.map((producto) => (
                              <button
                                key={producto.id}
                                type="button"
                                onClick={() => handleSelectProducto(producto)}
                                className="flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-gonper-hover"
                              >
                                <span className="text-[13px] font-medium">
                                  {producto.nombre}
                                </span>
                                <span className="font-mono text-[11px] text-gonper-muted">
                                  {producto.sku}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-4 text-center text-[12.5px] text-gonper-muted">
                              Sin resultados.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {productosDisponibles.length === 0 && (
                    <p className="mt-1.5 text-[11.5px] text-gonper-warning">
                      Todos los productos ya están asignados a este proveedor.
                    </p>
                  )}
                </div>

                <div>
                  <label className="field-label" htmlFor="producto-precio">
                    Precio
                  </label>
                  <input
                    id="producto-precio"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={nuevoPrecio}
                    onChange={(e) => setNuevoPrecio(e.target.value)}
                    className="field text-right tabular-nums"
                    placeholder="0.00"
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    isAddingProduct ||
                    !productoSeleccionado ||
                    !nuevoPrecio ||
                    productosDisponibles.length === 0
                  }
                  className="btn btn-primary sm:mb-0"
                >
                  {isAddingProduct ? 'Agregando…' : 'Agregar'}
                </button>
              </div>

              {errorMsgProducto && (
                <p className="mt-3 rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-[12.5px] text-gonper-danger">
                  {errorMsgProducto}
                </p>
              )}
            </form>

            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold">
                {proveedorActivo.producto_proveedores?.length || 0} productos
              </h3>
              {errorPrecio && (
                <span className="text-[12px] text-gonper-danger">{errorPrecio}</span>
              )}
            </div>

            {(proveedorActivo.producto_proveedores?.length || 0) > 0 ? (
              <>
                <div className="mt-2 hidden overflow-hidden rounded-[6px] border border-gonper-border sm:block">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-gonper-border bg-gonper-bg/60 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
                        <th className="px-3 py-2.5 font-medium">Producto</th>
                        <th className="px-3 py-2.5 text-right font-medium">Precio</th>
                        <th className="w-24 px-3 py-2.5 text-center font-medium">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gonper-border">
                      {proveedorActivo.producto_proveedores?.map((relacion) => (
                        <tr
                          key={relacion.id}
                          className="transition-colors duration-[120ms] hover:bg-gonper-hover"
                        >
                          <td className="px-3 py-2.5">
                            <p className="text-[13px] font-medium">
                              {relacion.productos?.nombre}
                            </p>
                            <p className="font-mono text-[11px] text-gonper-muted">
                              {relacion.productos?.sku}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {relacionEditando === relacion.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={precioEdicion}
                                  onChange={(e) => setPrecioEdicion(e.target.value)}
                                  className="field h-9 w-24 text-right text-[13px]"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => guardarPrecio(relacion)}
                                  disabled={isUpdatingPrecio}
                                  className="btn-icon text-gonper-primary"
                                  aria-label="Guardar precio"
                                >
                                  <Check className="h-4 w-4" strokeWidth={2} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRelacionEditando(null)}
                                  disabled={isUpdatingPrecio}
                                  className="btn-icon"
                                  aria-label="Cancelar edición de precio"
                                >
                                  <X className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => empezarEdicionPrecio(relacion)}
                                className="text-[13px] font-semibold tabular-nums text-gonper-text transition-colors hover:text-gonper-primary"
                                title="Editar precio"
                              >
                                {moneda.format(Number(relacion.precio_unitario))}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => empezarEdicionPrecio(relacion)}
                                className="btn-icon"
                                title="Editar precio"
                                aria-label="Editar precio"
                              >
                                <Pencil className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setErrorQuitar('')
                                  setRelacionAEliminar(relacion)
                                }}
                                className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                                title="Quitar producto"
                                aria-label="Quitar producto"
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="stagger mt-3 grid gap-2 sm:hidden">
                  {proveedorActivo.producto_proveedores?.map((relacion) => (
                    <div
                      key={relacion.id}
                      className="rounded-[6px] border border-gonper-border p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">
                            {relacion.productos?.nombre}
                          </p>
                          <p className="font-mono text-[11px] text-gonper-muted">
                            {relacion.productos?.sku}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            onClick={() => empezarEdicionPrecio(relacion)}
                            className="btn-icon"
                            aria-label="Editar precio"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setErrorQuitar('')
                              setRelacionAEliminar(relacion)
                            }}
                            className="btn-icon hover:bg-gonper-danger-bg hover:text-gonper-danger"
                            aria-label="Quitar producto"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-gonper-border pt-2">
                        <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-gonper-muted">
                          Precio
                        </span>
                        {relacionEditando === relacion.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={precioEdicion}
                              onChange={(e) => setPrecioEdicion(e.target.value)}
                              className="field h-9 w-24 text-right text-[13px]"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => guardarPrecio(relacion)}
                              disabled={isUpdatingPrecio}
                              className="btn-icon text-gonper-primary"
                              aria-label="Guardar precio"
                            >
                              <Check className="h-4 w-4" strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRelacionEditando(null)}
                              disabled={isUpdatingPrecio}
                              className="btn-icon"
                              aria-label="Cancelar edición de precio"
                            >
                              <X className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[14px] font-semibold tabular-nums">
                            {moneda.format(Number(relacion.precio_unitario))}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-2 rounded-[6px] border border-dashed border-gonper-border px-4 py-10 text-center">
                <Package
                  className="mx-auto h-6 w-6 text-gonper-muted"
                  strokeWidth={1.5}
                />
                <p className="mt-2 text-[13px] font-medium">
                  Catálogo vacío
                </p>
                <p className="mt-1 text-[12px] text-gonper-muted">
                  Agrega el primer producto y su precio.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!proveedorAEliminar}
        title="Eliminar proveedor"
        description="Esta acción no se puede deshacer."
        pending={isDeletingProveedor}
        error={errorEliminar}
        onConfirm={handleEliminarProveedor}
        onClose={() => {
          if (isDeletingProveedor) return
          setProveedorAEliminar(null)
          setErrorEliminar('')
        }}
      >
        ¿Eliminar <strong className="font-semibold">{proveedorAEliminar?.nombre}</strong>
        ? Se quitará del directorio y de sus productos asociados.
      </ConfirmDialog>

      <ConfirmDialog
        open={!!relacionAEliminar}
        title="Quitar producto"
        description="El producto seguirá en el inventario."
        confirmLabel="Quitar"
        pendingLabel="Quitando…"
        pending={isRemovingProduct}
        error={errorQuitar}
        onConfirm={handleQuitarProducto}
        onClose={() => {
          if (isRemovingProduct) return
          setRelacionAEliminar(null)
          setErrorQuitar('')
        }}
      >
        ¿Quitar{' '}
        <strong className="font-semibold">
          {relacionAEliminar?.productos?.nombre}
        </strong>{' '}
        del catálogo de este proveedor?
      </ConfirmDialog>
    </div>
  )
}
