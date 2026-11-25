import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { ViewTransition } from 'react'
import { notFound } from 'next/navigation'
import { CheckCircle2, ChevronLeft, Package, TriangleAlert, ShoppingCart } from 'lucide-react'
import BotonSurtir from './BotonSurtir'
import BotonFacturaFirmada from './BotonFacturaFirmada'
import CotejoArticulos from './CotejoArticulos'
import ProcesarPdfButton from '../ProcesarPdfButton'
import EstadoBadge, { Badge } from '@/components/EstadoBadge'
import TransicionPagina from '@/components/ui/TransicionPagina'
import LineaTiempo from '@/components/ui/LineaTiempo'
import { lineaTiempoOrden } from '@/utils/progresoRequisicion'
import { estadoCotejoItem } from '@/utils/cotejoRequisicion'
import type { FilaCotejo } from '@/utils/filtroCotejo'
import type { FilaEdicion } from '@/utils/editarItemsOrden'
import type { ProductoCatalogo } from '@/utils/vincularProductos'
import { esRequisicionCompleta } from '@/utils/requisicionesCompletas'

type Producto = {
  id: string
  nombre: string
  sku: string
  stock_actual: number | string
  unidad_medida: string | null
}

type ItemOrden = {
  id: string
  cantidad_solicitada: number | string
  cantidad_surtida: number | string | null
  estado_item: string | null
  unidad: string | null
  created_at: string | null
  productos: Producto | Producto[] | null
}

type Orden = {
  id: string
  folio: string
  estado: string
  created_at: string
  pdf_path: string | null
  clientes: { nombre: string } | { nombre: string }[] | null
  orden_items: ItemOrden[]
}

const fecha = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
})

const productoDe = (item: ItemOrden): Producto | null =>
  Array.isArray(item.productos) ? item.productos[0] ?? null : item.productos

const nombreCliente = (clientes: Orden['clientes']) => {
  if (!clientes) return 'Cliente desconocido'
  return Array.isArray(clientes)
    ? clientes[0]?.nombre || 'Cliente desconocido'
    : clientes.nombre
}

export default async function OrdenDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ guardado?: string | string[] }>
}) {
  const { id } = await params
  const guardado =
    (await searchParams)?.guardado === '1'
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ordenes')
    .select(
      `
      id, folio, estado, created_at, pdf_path,
      clientes (nombre),
      orden_items (
        id, cantidad_solicitada, cantidad_surtida, estado_item, unidad,
        created_at,
        productos (id, nombre, sku, stock_actual, unidad_medida)
      )
    `,
    )
    .eq('id', id)
    .single()

  if (error || !data) return notFound()

  const orden = data as unknown as Orden
  const items = orden.orden_items ?? []

  // Marca "Sin surtir" (Alex, 2026-11-25): consulta aparte y
  // tolerante — si la migración aún no se corrió en Supabase, la
  // columna no existe y esta consulta falla; el detalle sigue
  // funcionando con todo surtible.
  const { data: flagsSinSurtir } = await supabase
    .from('orden_items')
    .select('id, sin_surtir')
    .eq('orden_id', id)
  const sinSurtirPorId = new Map<string, boolean>(
    (flagsSinSurtir || []).map((f) => [
      f.id as string,
      !!(f as { sin_surtir?: boolean }).sin_surtir,
    ]),
  )
  const esSinSurtir = (itemId: string) =>
    sinSurtirPorId.get(itemId) ?? false

  // Foto de la factura firmada: consulta aparte y tolerante — si la
  // migración aún no se corrió en Supabase, la columna no existe y
  // esta consulta falla; el detalle sigue funcionando sin la foto.
  const { data: firmada } = await supabase
    .from('ordenes')
    .select('factura_firmada_path, factura_firmada_en')
    .eq('id', id)
    .single()
  const facturaFirmadaPath =
    (firmada as { factura_firmada_path?: string | null } | null)
      ?.factura_firmada_path ?? null
  const facturaFirmadaEn =
    (firmada as { factura_firmada_en?: string | null } | null)
      ?.factura_firmada_en ?? null

  // Fecha del primer surtido: el RPC inserta un movimiento de
  // inventario con motivo "Surtido de requisición" cada vez que
  // surte. Consulta tolerante como la de la foto: si no hay
  // movimientos, el paso Surtida se muestra sin fecha (el estado
  // prueba que ocurrió).
  const { data: primerSurtido } = await supabase
    .from('movimientos_inventario')
    .select('created_at')
    .eq('orden_id', id)
    .eq('motivo', 'Surtido de requisición')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const surtidoEn =
    (primerSurtido as { created_at?: string | null } | null)?.created_at ??
    null

  // Fecha de captura de los artículos: la creación del primer ítem.
  const capturadoEn =
    items.length > 0
      ? items
          .map((item) => item.created_at)
          .filter((f): f is string => !!f)
          .sort()[0] ?? null
      : null

  // Qué se entregó hasta ahora (Alex, 2026-11-24): los artículos
  // con cantidad surtida se listan en el paso Surtida de la línea
  // de tiempo, para que quede el registro de la entrega.
  const surtidoDetalle = items
    .filter((item) => (Number(item.cantidad_surtida) || 0) > 0)
    .map((item) => ({
      nombre: productoDe(item)?.nombre || 'Producto eliminado',
      cantidad: Number(item.cantidad_surtida) || 0,
      unidad: item.unidad || productoDe(item)?.unidad_medida || '',
    }))

  const pasosLineaTiempo = lineaTiempoOrden({
    estado: orden.estado,
    creadoEn: orden.created_at,
    capturadoEn,
    surtidoEn,
    firmadaEn: facturaFirmadaEn,
    surtidoDetalle,
  })

  // Filas del cotejo con el estado ya calculado (Alex, 2026-11-24):
  // el componente cliente las filtra por artículo sin volver a pedir
  // datos al servidor.
  const filas: FilaCotejo[] = items.map((item) => {
    const producto = productoDe(item)
    const solicitado = Number(item.cantidad_solicitada)
    const stock = Number(producto?.stock_actual) || 0
    const surtido = Number(item.cantidad_surtida) || 0
    const { aSurtir, faltante, estado } = estadoCotejoItem({
      solicitado,
      surtido,
      stock,
      sinSurtir: esSinSurtir(item.id),
    })
    return {
      id: item.id,
      nombre: producto?.nombre || 'Producto eliminado',
      sku: producto?.sku || '',
      unidad: item.unidad || producto?.unidad_medida || '',
      solicitado,
      stock,
      surtido,
      aSurtir,
      faltante,
      estado,
    }
  })

  // Sello "SURTIDA" de la tabla de cotejo (Alex, 2026-11-17): solo
  // cuando está entregada Y firmada. Entregada sin firmar queda
  // normal, porque todavía falta la prueba.
  const completa = esRequisicionCompleta({
    estado: orden.estado,
    facturaFirmadaPath,
  })

  // Catálogo para el modal de edición de artículos (Alex, 2026-11-25)
  // y candado de compra: productos que ya están en una orden de
  // compra de esta requisición. Si la consulta de compras falla, se
  // asume sin candados en la vista; el servidor vuelve a verificar
  // al guardar y es el que manda.
  const { data: catalogoData } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida, codigo_sat')
    .order('nombre')
  const catalogo: ProductoCatalogo[] = (catalogoData || []).map((p) => ({
    id: p.id as string,
    sku: p.sku as string,
    nombre: p.nombre as string,
    unidad_medida: (p.unidad_medida as string | null) ?? null,
    codigo_sat: (p.codigo_sat as string | null) ?? null,
  }))
  const { data: compras } = await supabase
    .from('ordenes_compra')
    .select('id')
    .eq('requisition_id', id)
  let comprados = new Set<string>()
  if (compras && compras.length > 0) {
    const { data: compradosItems } = await supabase
      .from('orden_compra_items')
      .select('producto_id')
      .in(
        'orden_compra_id',
        compras.map((c) => c.id),
      )
    comprados = new Set(
      (compradosItems || []).map((i) => i.producto_id as string),
    )
  }

  // Edición de artículos: solo en BORRADOR, PENDIENTE o PARCIAL y
  // sin foto firmada (la firmada es evidencia de entrega). Cada fila
  // lleva su candado: surtido (no baja de lo entregado) o compra.
  const editable =
    ['BORRADOR', 'PENDIENTE', 'PARCIAL'].includes(orden.estado) &&
    !facturaFirmadaPath
  const motivoNoEditable = facturaFirmadaPath
    ? 'No se pueden editar los artículos: está entregada y firmada.'
    : orden.estado === 'ENTREGADA'
      ? 'No se pueden editar los artículos: ya está entregada.'
      : 'No se pueden editar los artículos en este estado.'
  const filasEdicion: FilaEdicion[] = items.map((item) => {
    const producto = productoDe(item)
    const solicitado = Number(item.cantidad_solicitada)
    const surtido = Number(item.cantidad_surtida) || 0
    const productoId = producto?.id || ''
    return {
      itemId: item.id,
      productoId,
      nombre: producto?.nombre || 'Producto eliminado',
      sku: producto?.sku || '',
      unidad: item.unidad || producto?.unidad_medida || '',
      solicitado,
      surtido,
      bloqueo:
        productoId && comprados.has(productoId)
          ? 'compra'
          : surtido > 0
            ? 'surtido'
            : null,
      sinSurtir: esSinSurtir(item.id),
    }
  })

  // Artículos que sí se pueden surtir: con pendiente y sin la marca
  // "Sin surtir". Si no hay ninguno, no hay botón de surtir ni
  // faltante que comprar — los marcados quedan solo en el registro.
  const hayPendientesSurtibles = items.some((item) => {
    const pendiente =
      Number(item.cantidad_solicitada) -
      (Number(item.cantidad_surtida) || 0)
    return !esSinSurtir(item.id) && pendiente > 0
  })

  // Hay stock total solo si TODOS los artículos surtibles están
  // cubiertos con lo que QUEDA por surtir (solicitado menos surtido).
  // Antes se comparaba contra lo solicitado total y el botón decía
  // "Surtir parcialmente" aunque el stock alcanzara para lo que
  // quedaba. Los marcados "Sin surtir" no cuentan: no se surten.
  const hayStockTotal =
    items.length > 0 &&
    hayPendientesSurtibles &&
    items.every((item) => {
      if (esSinSurtir(item.id)) return true
      const producto = productoDe(item)
      const pendiente =
        Number(item.cantidad_solicitada) -
        (Number(item.cantidad_surtida) || 0)
      return (
        !!producto && Number(producto.stock_actual) >= Math.max(0, pendiente)
      )
    })

  // Hay stock parcial solo si algún artículo surtible con pendiente
  // tiene stock. El stock de un artículo ya entregado completo no
  // cuenta: surtir no movería nada.
  const hayStockParcial = items.some((item) => {
    const pendiente =
      Number(item.cantidad_solicitada) -
      (Number(item.cantidad_surtida) || 0)
    return (
      !esSinSurtir(item.id) &&
      pendiente > 0 &&
      Number(productoDe(item)?.stock_actual) > 0
    )
  })

  // Faltante real: lo que queda por surtir después de lo ya
  // surtido y del stock disponible. Así una requisición PARCIAL también
  // puede ir a Compras por lo que le falta (Fase 1). Los marcados
  // "Sin surtir" no son faltante: no se compran.
  const hayFaltantes = items.some((item) => {
    const producto = productoDe(item)
    const pendiente =
      Number(item.cantidad_solicitada) - (Number(item.cantidad_surtida) || 0)
    const aSurtir = Math.min(Number(producto?.stock_actual) || 0, pendiente)
    return !esSinSurtir(item.id) && pendiente - aSurtir > 0
  })

  const puedeIrACompras =
    orden.estado !== 'ENTREGADA' && orden.estado !== 'CANCELADA'

  // Se puede surtir una PENDIENTE y también una PARCIAL (para surtir
  // lo que falta cuando llega stock). Antes las PARCIAL no mostraban
  // el botón: REQ-0003 quedó en PARCIAL tras el fallo #441 y ya no se
  // podía completar desde aquí. El botón es "Surtir parcialmente"
  // cuando no hay stock total (esParcial) y solo aparece si hay algo
  // de stock (hayStockParcial); si no, se muestra el aviso.
  const puedeSurtir =
    orden.estado !== 'ENTREGADA' && orden.estado !== 'CANCELADA'

  return (
    <TransicionPagina>
    <div className="mx-auto max-w-245 pb-6">
      <Link
        href="/ordenes"
        transitionTypes={['nav-back']}
        className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gonper-muted transition-colors duration-120 hover:text-gonper-primary"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        Volver a requisiciones
      </Link>

      {/* Confirmación al llegar desde "Confirmar y agregar" tras leer
          el archivo. Antes el usuario caía en el detalle sin ninguna
          señal de que los artículos se guardaron, y no sabía si
          "pasó algo" o qué seguía. */}
      {guardado && (
        <div
          role="status"
          className="card mb-4 border-gonper-success-border bg-gonper-success-bg/50 p-4"
        >
          <p className="flex items-center gap-2 text-[14px] font-semibold text-gonper-success">
            <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            Artículos guardados: {items.length}{' '}
            {items.length === 1 ? 'artículo' : 'artículos'} en la requisición
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-gonper-muted">
            Revisa las cantidades abajo. Lo que sigue es surtir lo que hay
            en stock o comprar lo que falta.
          </p>
        </div>
      )}

      <header className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Requisición</p>
            <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.025em] sm:text-[28px]">
              {nombreCliente(orden.clientes)}
            </h1>
            <p className="mt-1.5 text-[12px] text-gonper-muted">
              Folio{' '}
              {/* El folio hace morph desde la lista: mismo nombre en
                  la lista y aquí. */}
              <ViewTransition
                name={`req-${orden.id}`}
                share="morph"
                default="none"
              >
                <span className="text-[14px] font-semibold text-gonper-text">
                  {orden.folio}
                </span>
              </ViewTransition>
            </p>
            <p className="mt-0.5 text-[12px] text-gonper-muted">
              {fecha.format(new Date(orden.created_at))}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <EstadoBadge estado={orden.estado} />
            {facturaFirmadaPath && (
              <Badge tono="success">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Firmada
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-gonper-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          
          {/* CONTENEDOR DE BOTONES MODIFICADO */}
          <div className="flex flex-col gap-2.5 w-full sm:w-auto">
            {puedeSurtir ? (
              hayStockParcial ? (
                <BotonSurtir ordenId={orden.id} esParcial={!hayStockTotal} />
              ) : hayPendientesSurtibles ? (
                <Badge tono="danger">
                  <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Sin stock para surtir
                </Badge>
              ) : (
                <p className="text-[12.5px] text-gonper-muted">
                  Todos los artículos están marcados Sin surtir: no hay nada
                  que surtir ni comprar.
                </p>
              )
            ) : orden.estado === 'ENTREGADA' ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12.5px] text-gonper-muted">
                  Esta requisición ya fue surtida.
                </p>
                <BotonFacturaFirmada
                  ordenId={orden.id}
                  folio={orden.folio}
                  firmadaEn={facturaFirmadaEn}
                  tieneFoto={!!facturaFirmadaPath}
                />
              </div>
            ) : (
              <p className="text-[12.5px] text-gonper-muted">
                Esta requisición está cancelada.
              </p>
            )}

            {/* Fase 1: lleva a Compras ya filtrado a ESTA orden
                (?orden=<id>), no al faltante general. Con &comprar=1
                Compras abre directo el diálogo de compra del faltante
                de esta requisición. */}
            {puedeIrACompras && hayFaltantes && (
              <Link
                href={`/compras?orden=${orden.id}&comprar=1`}
                transitionTypes={['nav-section']}
                className="btn btn-primary w-full sm:w-auto"
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                Ir a Compras por el faltante de esta requisición
              </Link>
            )}
          </div>

          {/* Qué sigue, en palabras simples y según el stock real.
              Antes solo había una nota chica ("al surtir se descuenta
              el inventario") y solo cuando había algo de stock; un
              usuario nuevo no sabía si surtir, comprar o esperar. */}
          {puedeSurtir && (
            <p className="text-[12.5px] leading-relaxed text-gonper-muted">
              {hayStockTotal
                ? 'Tenemos todo en stock: puedes surtir ahora.'
                : hayStockParcial
                  ? 'Hay stock para una parte: surte lo que hay y compra lo que falta.'
                  : hayPendientesSurtibles
                    ? 'No hay stock para ningún artículo: compra lo que falta para poder surtir.'
                    : 'Todos los artículos están marcados Sin surtir: quedan solo en el registro.'}
            </p>
          )}
        </div>
      </header>

      {/* Línea de tiempo (reel @ale.uiux "Progress steps UI", patrón
          02): la vida de la requisición — creada, capturada, surtida,
          firmada. Antes solo se veía el badge del estado actual. */}
      <section
        aria-label="Progreso de la requisición"
        className="card mt-4 p-5 sm:p-6"
      >
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
          Progreso de la requisición
        </h2>
        <div className="mt-4">
          <LineaTiempo pasos={pasosLineaTiempo} />
        </div>
      </section>

      <section className="card mt-4 overflow-hidden">
        {items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Package
              className="mx-auto h-6 w-6 text-gonper-muted"
              strokeWidth={1.5}
            />
            <p className="mt-2 text-[13px] font-medium">
              Esta orden todavía no tiene artículos
            </p>
            <p className="mt-1 text-[12px] text-gonper-muted">
              {orden.estado === 'BORRADOR' && orden.pdf_path
                ? 'Lee el archivo para capturar sus artículos.'
                : 'Esta requisición no tiene artículos.'}
            </p>
            {orden.estado === 'BORRADOR' && orden.pdf_path ? (
              <div className="mt-4">
                <ProcesarPdfButton
                  ordenId={orden.id}
                  pdfPath={orden.pdf_path}
                  grande
                />
              </div>
            ) : (
              <Link
                href="/ordenes"
                transitionTypes={['nav-back']}
                className="btn btn-primary mt-4 inline-flex min-h-12"
              >
                Volver a requisiciones
              </Link>
            )}
          </div>
        ) : (
          <CotejoArticulos
            filas={filas}
            muestraSurtido={
              orden.estado === 'ENTREGADA' || orden.estado === 'PARCIAL'
            }
            surtida={completa}
            ordenId={orden.id}
            catalogo={catalogo}
            filasEdicion={filasEdicion}
            editable={editable}
            motivoNoEditable={motivoNoEditable}
          />
        )}
      </section>
    </div>
    </TransicionPagina>
  )
}