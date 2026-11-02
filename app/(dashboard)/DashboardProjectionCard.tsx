'use client'

import { useState } from 'react'

export default function DashboardProjectionCard({ 
  data, 
  totalFaltantes 
}: { 
  data: any[], 
  totalFaltantes: number 
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      {/* TARJETA CLICKEABLE */}
      <div 
        onClick={() => setIsModalOpen(true)}
        className="bg-gonper-surface p-6 rounded-xl border border-gonper-border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer border-l-4 border-l-orange-500 flex flex-col justify-between group"
      >
        <div className="flex justify-between items-start">
          <h3 className="text-gonper-muted text-sm font-medium">Proyección de Demanda</h3>
          <span className="text-gray-400 group-hover:text-orange-500 transition-colors">👁️</span>
        </div>
        <div className="flex items-end justify-between mt-4">
          <div>
            <p className={`text-4xl font-bold ${totalFaltantes > 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
              {totalFaltantes}
            </p>
            <p className="text-xs text-gonper-muted mt-1">Productos con faltante</p>
          </div>
          <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100">
            Ver detalle
          </span>
        </div>
      </div>

      {/* MODAL CON LA TABLA COMPLETA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gonper-surface w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            
            <div className="p-4 border-b border-gonper-border flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-lg font-bold text-gonper-text flex items-center gap-2">
                  <span>📊</span> Proyección de Demanda
                </h2>
                <p className="text-xs text-gonper-muted mt-1">Suma de órdenes activas vs Inventario Actual</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-3xl text-gray-400 hover:text-red-500 leading-none"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              {data.length > 0 ? (
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100 text-gray-600 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 font-semibold">Producto</th>
                      <th className="p-3 font-semibold text-center">Requerido</th>
                      <th className="p-3 font-semibold text-center">En Stock</th>
                      <th className="p-3 font-semibold text-center border-l border-gray-300">Faltante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.map((prod) => (
                      <tr key={prod.id} className={`transition-colors ${prod.faltante > 0 ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-gray-50'}`}>
                        <td className="p-3">
                          <p className="font-bold text-gonper-text">{prod.nombre}</p>
                          <p className="text-xs text-gonper-muted font-mono">{prod.sku}</p>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{prod.requerido}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">{prod.stock}</span>
                        </td>
                        <td className={`p-3 text-center border-l border-gray-200 font-bold text-lg ${prod.faltante > 0 ? 'text-red-600' : 'text-emerald-500'}`}>
                          {prod.faltante > 0 ? prod.faltante : 'Suficiente'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-gonper-muted">
                  No hay órdenes activas que demanden inventario. ¡Todo está surtido!
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gonper-border bg-gray-50 flex justify-end">
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}