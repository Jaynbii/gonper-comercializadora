'use server'

import { createClient } from '@/utils/supabase/server'
import Fuse from 'fuse.js'
import { parseRequisicion } from '@/utils/requisicion'
import { normalizarUnidad } from '@/utils/unidades'

type ProductoDB = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
  codigo_sat: string | null
}

type Sugerencia = {
  id: string
  sku: string
  nombre: string
  unidad_medida: string | null
}

function formatearNombre(str: string) {
  if (!str) return str
  return str
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase())
}

// Función para limpiar palabras comunes y unificar el formato
function limpiarParaBusqueda(texto: string) {
  return texto
    .toLowerCase() // 👈 Todo a minúsculas para evitar problemas de Case
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/\b(de|del|la|el|los|las|en|con|para|y)\b/g, '') // Quitar conectores
    .replace(/[.,#/-]/g, ' ') // Quitar símbolos
    .replace(/\s+/g, ' ')
    .trim()
}

export async function procesarTextoOrden(textoCrudo: string) {
  const supabase = await createClient()
  
  const { data: productosDB, error: dbError } = await supabase
    .from('productos')
    .select('id, sku, nombre, unidad_medida, codigo_sat')

  if (dbError) throw new Error('No se pudo conectar a la base de datos')

  const productos = (productosDB ?? []) as ProductoDB[]
  
  const porSku = new Map(productos.map((producto) => [producto.sku, producto]))
  const porSat = new Map(productos.filter(p => p.codigo_sat).map((producto) => [producto.codigo_sat, producto]))
  
  // 👇 AUMENTAMOS EL THRESHOLD A 0.4 para tolerar palabras extra ("Abanico") y errores del OCR
  const fuse = new Fuse(productos.map(p => ({
    ...p,
    nombreLimpio: limpiarParaBusqueda(p.nombre)
  })), {
    keys: ['nombreLimpio'],
    threshold: 0.4, 
    ignoreLocation: true,
    includeScore: true,
  })

  const { items, lineasNoReconocidas } = parseRequisicion(textoCrudo)

  const detectados = items.map((item) => {
    const existentePorSat = porSat.get(item.codigo_pdf)
    const existentePorSku = porSku.get(item.codigo_pdf)
    
    let sugerencia: Sugerencia | null = null
    let productoFinal = existentePorSat || existentePorSku

    // Si no hay coincidencia por código, buscamos por nombre
    if (!productoFinal) {
      const descripcionLimpia = limpiarParaBusqueda(item.descripcion_pdf)
      const mejor = fuse.search(descripcionLimpia)[0]

      if (mejor) {
        const score = mejor.score ?? 1
        // 👇 AJUSTAMOS LOS SCORES:
        // 0.35 o menos = Coincidencia muy alta (Auto-vincula)
        // 0.40 o menos = Coincidencia alta (Muestra botón de sugerencia)
        if (score <= 0.35) {
          productoFinal = mejor.item
        } 
        else if (score <= 0.4) {
          sugerencia = {
            id: mejor.item.id,
            sku: mejor.item.sku,
            nombre: mejor.item.nombre,
            unidad_medida: mejor.item.unidad_medida,
          }
        }
      }
    }

    const nombre = productoFinal?.nombre || formatearNombre(item.descripcion_pdf)

    return {
      codigo_pdf: item.codigo_pdf,
      cantidad: item.cantidad,
      unidad: normalizarUnidad(productoFinal?.unidad_medida) || item.unidad || '',
      descripcion_pdf: nombre,
      producto_nombre: nombre,
      existe_en_bd: !!productoFinal,
      id_bd: productoFinal?.id || null,
      sugerencia,
    }
  })

  return {
    success: true as const,
    items: detectados,
    lineasNoReconocidas,
  }
}