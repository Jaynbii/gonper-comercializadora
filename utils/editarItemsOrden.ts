// Edición de los artículos de una requisición (Alex, 2026-11-25):
// cambiar cantidades, quitar artículos y agregar nuevos del catálogo.
// Reglas con candado, validadas aquí en puro (sin Supabase ni React)
// para probarlas con `node --test` y reutilizarlas tal cual en la
// Server Action, que es la que manda.
//
// - Un artículo con algo surtido no puede bajar de lo surtido ni
//   cambiar de producto (lo entregado ya es un hecho).
// - Un artículo con orden de compra no se puede modificar en nada ni
//   quitar (la compra ya lo referencia; cambiar la requisición
//   dejaría la compra huérfana o inconsistente).
// - La requisición debe quedar con al menos un artículo y sin el
//   mismo producto dos veces.

export type ItemExistenteEdicion = {
  itemId: string
  productoId: string
  nombre: string
  solicitado: number
  surtido: number
  bloqueadoPorCompra: boolean
}

export type ItemEditado = {
  itemId: string | null
  productoId: string
  nombre: string
  cantidad: number
  unidad: string
}

// Una fila del modal de edición: el artículo tal cual está en la
// requisición, con su candado si lo tiene.
export type FilaEdicion = {
  itemId: string
  productoId: string
  nombre: string
  sku: string
  unidad: string
  solicitado: number
  surtido: number
  bloqueo: 'surtido' | 'compra' | null
}

export type ValidacionEdicion =
  | { ok: true }
  | { ok: false; error: string }

export function validarEdicionItems(
  existentes: ItemExistenteEdicion[],
  editados: ItemEditado[],
): ValidacionEdicion {
  if (editados.length === 0) {
    return {
      ok: false,
      error: 'La requisición debe tener al menos un artículo.',
    }
  }

  for (const editado of editados) {
    if (!editado.productoId) {
      return {
        ok: false,
        error: 'Hay una fila sin producto: elige uno del catálogo.',
      }
    }
    if (!Number.isFinite(editado.cantidad) || editado.cantidad <= 0) {
      return {
        ok: false,
        error: `Cantidad inválida para ${editado.nombre || 'un artículo'}.`,
      }
    }
  }

  const vistos = new Set<string>()
  for (const editado of editados) {
    if (vistos.has(editado.productoId)) {
      return {
        ok: false,
        error: `El producto ${editado.nombre} está dos veces: quita una fila.`,
      }
    }
    vistos.add(editado.productoId)
  }

  const editadosPorId = new Map(
    editados
      .filter((e) => e.itemId !== null)
      .map((e) => [e.itemId as string, e]),
  )

  for (const existente of existentes) {
    const editado = editadosPorId.get(existente.itemId)
    if (!editado) {
      if (existente.surtido > 0) {
        return {
          ok: false,
          error: `No se puede quitar ${existente.nombre}: ya se surtieron ${existente.surtido}.`,
        }
      }
      if (existente.bloqueadoPorCompra) {
        return {
          ok: false,
          error: `No se puede quitar ${existente.nombre}: ya tiene orden de compra.`,
        }
      }
      continue
    }
    if (existente.bloqueadoPorCompra) {
      if (
        editado.productoId !== existente.productoId ||
        editado.cantidad !== existente.solicitado
      ) {
        return {
          ok: false,
          error: `${existente.nombre} ya tiene orden de compra y no se puede modificar.`,
        }
      }
      continue
    }
    if (existente.surtido > 0) {
      if (editado.productoId !== existente.productoId) {
        return {
          ok: false,
          error: `No se puede cambiar el producto de ${existente.nombre}: ya se surtieron ${existente.surtido}.`,
        }
      }
      if (editado.cantidad < existente.surtido) {
        return {
          ok: false,
          error: `La cantidad de ${existente.nombre} no puede ser menor que lo surtido (${existente.surtido}).`,
        }
      }
    }
  }

  return { ok: true }
}
