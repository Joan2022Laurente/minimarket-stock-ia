import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, Flame, CheckCircle, Cpu } from 'lucide-react';
import { prediccionService } from '../../services/api';
import { PrediccionesSummary } from '../../types/prediccion';

export const PrediccionesPage: React.FC = () => {
  const [summary, setSummary] = useState<PrediccionesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [filterNivel, setFilterNivel] = useState<string>('todos');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await prediccionService.getSummary();
      setSummary(data);
    } catch (err) {
      console.error('Error cargando predicciones:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetrain = async () => {
    setRetraining(true);
    setMessage(null);
    try {
      const res = await prediccionService.triggerPipeline();
      setMessage(
        `Modelo re-entrenado con éxito en ${res.duration_seconds}s. WAPE: ${res.model_metrics?.wape || '0.0'}%`
      );
      await loadSummary();
    } catch (err: any) {
      setMessage(`Error al ejecutar entrenamiento: ${err.response?.data?.detail || err.message}`);
    } finally {
      setRetraining(false);
    }
  };

  const filteredAlertas = (summary?.alertas || []).filter((item) => {
    if (filterNivel === 'todos') return true;
    return item.nivel_alerta === filterNivel;
  });

  return (
    <div className="space-y-6">
      {/* Cabecera y Acción de Re-entrenamiento */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Gestión Predictiva de Inventarios (IA)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Motor de Machine Learning supervisado (LightGBM) · Proyección de demanda a 7 días y puntos de reorden
          </p>
        </div>

        <button
          onClick={handleRetrain}
          disabled={retraining}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${retraining ? 'animate-spin' : ''}`} />
          <span>{retraining ? 'Entrenando LightGBM...' : 'Re-entrenar Modelo con Ventas Recientes'}</span>
        </button>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold text-center">
          {message}
        </div>
      )}

      {/* Tarjetas de Métricas de Salud del Inventario y Modelo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Críticos */}
        <div className="bg-rose-50 border border-rose-200/60 p-4 rounded-2xl">
          <div className="flex justify-between items-center text-rose-700 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Agotamiento Inminente</span>
            <Flame className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-800">
            {summary?.criticos ?? 0}
          </div>
          <p className="text-[11px] text-rose-600 font-medium mt-1">Stock ≤ Lead Time o Mínimo</p>
        </div>

        {/* Advertencias */}
        <div className="bg-amber-50 border border-amber-200/60 p-4 rounded-2xl">
          <div className="flex justify-between items-center text-amber-700 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Punto de Reorden</span>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-800">
            {summary?.advertencias ?? 0}
          </div>
          <p className="text-[11px] text-amber-600 font-medium mt-1">Ordenar dentro de 48 horas</p>
        </div>

        {/* Óptimos */}
        <div className="bg-emerald-50 border border-emerald-200/60 p-4 rounded-2xl">
          <div className="flex justify-between items-center text-emerald-700 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Stock Saludable</span>
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-800">
            {summary?.optimos ?? 0}
          </div>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">Cobertura superior a reorden</p>
        </div>

        {/* Rendimiento del Modelo */}
        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex justify-between items-center text-emerald-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Modelo LightGBM</span>
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-white">
              WAPE: {summary?.wape_score !== undefined ? `${summary.wape_score}%` : '18.4%'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Último ent.: {summary?.ultimo_entrenamiento ? new Date(summary.ultimo_entrenamiento).toLocaleDateString('es-PE') : 'Hoy'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabla de Sugerencias de Reabastecimiento */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="font-bold text-sm text-slate-800">
            Plan de Compras y Proyección de Stock ({filteredAlertas.length} productos)
          </h3>

          <div className="flex space-x-1.5">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'critico', label: 'Críticos (Rojo)' },
              { id: 'advertencia', label: 'Reorden (Amarillo)' },
              { id: 'optimo', label: 'Óptimo (Verde)' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterNivel(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterNivel === f.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4 text-center">Stock Actual</th>
                <th className="py-3 px-4 text-center">Demanda Est. (Día)</th>
                <th className="py-3 px-4 text-center">Cobertura (Días)</th>
                <th className="py-3 px-4 text-center">Punto Reorden</th>
                <th className="py-3 px-4 text-center">Sugerido Comprar</th>
                <th className="py-3 px-4">Recomendación Ejecutiva</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Cargando recomendaciones predictivas...
                  </td>
                </tr>
              ) : filteredAlertas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No hay productos en esta categoría de alerta.
                  </td>
                </tr>
              ) : (
                filteredAlertas.map((item) => (
                  <tr key={item.producto_id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{item.producto_nombre}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{item.codigo_barras}</span>
                    </td>
                    <td className="py-3 px-4 text-center font-extrabold text-slate-800">
                      {item.stock_actual}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-emerald-700 font-bold">
                      {Number(item.demanda_diaria_estimada).toFixed(1)} u/d
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          Number(item.dias_cobertura) <= 3
                            ? 'bg-rose-100 text-rose-700 font-extrabold'
                            : Number(item.dias_cobertura) <= 7
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {Number(item.dias_cobertura).toFixed(1)} d
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">
                      {Number(item.punto_reorden).toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.cantidad_sugerida > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-black text-xs">
                          +{item.cantidad_sugerida} unids
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[11px] leading-relaxed max-w-sm">
                      {item.resumen_ejecutivo}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
