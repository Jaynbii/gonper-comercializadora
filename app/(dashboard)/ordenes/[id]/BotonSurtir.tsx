'use client'

import { useState } from 'react'
import { surtirOrden } from '../actions'
import { useRouter } from 'next/navigation'

export default function BotonSurtir({ ordenId, esParcial }: { ordenId: string, esParcial: boolean }) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSurtir = async () => {
    const mensaje = esParcial 
      ? '⚠️ ALERTA: No tienes stock suficiente para todos los artículos. Se hará un surtido PARCIAL. ¿Continuar?'
      : '¿Estás seguro de surtir esta orden? El inventario se descontará automáticamente.'

    if (!confirm(mensaje)) return
    
    setIsLoading(true)
    try {
      await surtirOrden(ordenId)
      router.refresh()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button 
      onClick={handleSurtir} 
      disabled={isLoading}
      className={`${esParcial ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-6 py-2 rounded-lg font-bold shadow-sm disabled:bg-gray-400 transition-colors`}
    >
      {isLoading ? 'Surtiendo...' : esParcial ? '⚠️ Surtir Parcial' : '✅ Surtir Orden Completa'}
    </button>
  )
}