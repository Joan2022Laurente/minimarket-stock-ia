import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, BrainCircuit } from 'lucide-react';
import { prediccionService } from '../../services/api';
import { PrediccionItem, PrediccionesSummary } from '../../types/prediccion';
import { PrediccionesKpiGrid } from './components/PrediccionesKpiGrid';
import { PrediccionesCharts } from './components/PrediccionesCharts';
import { PrediccionesTable } from './components/PrediccionesTable';
import { ReposicionRapidaModal } from './components/ReposicionRapidaModal';

export const PrediccionesPage: React.FC = () => {
  const [summary, setSummary] = useState<PrediccionesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [filterNivel, setFilterNivel] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [reponerItem, setReponerItem] = useState<PrediccionItem | null>(null);

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
        `Modelo LightGBM reentrenado con éxito en ${res.duration_seconds}s. WAPE: ${res.model_metrics?.wape || '0.0'}%`
      );
      await loadSummary();
    } catch (err: any) {
      setMessage(`Error al entrenar: ${err.response?.data?.detail || err.message}`);
    } finally {
      setRetraining(false);
    }
  };

  const alertas = summary?.alertas || [];
  const itemsPorReponer = alertas.filter((a) => Number(a.cantidad_sugerida ?? 0) > 0);
  const totalUnidadesReponer = itemsPorReponer.reduce(
    (acc, a) => acc + Number(a.cantidad_sugerida ?? 0),
    0
  );

  const counts = {
    todos: alertas.length,
    critico: alertas.filter((a) => a.nivel_alerta === 'critico').length,
    advertencia: alertas.filter((a) => a.nivel_alerta === 'advertencia').length,
    optimo: alertas.filter((a) => a.nivel_alerta === 'optimo').length,
  };

  const handleExportCsv = () => {
    const target = itemsPorReponer.length > 0 ? itemsPorReponer : alertas;
    const header = 'CodigoBarras,Producto,StockActual,PuntoReorden,Demanda7Dias,CoberturaDias,CompraSugerida,Nivel\n';
    const rows = target
      .map((a) =>
        [
          a.codigo_barras || '',
          `"${a.producto_nombre.replace(/"/g, '""')}"`,
          a.stock_actual,
          Number(a.punto_reorden ?? 0).toFixed(1),
          (Number(a.demanda_diaria_estimada ?? 0) * 7).toFixed(1),
          Number(a.dias_cobertura ?? 0).toFixed(1),
          a.cantidad_sugerida,
          a.nivel_alerta,
        ].join(',')
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orden_reposicion_ia_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Cabecera y Acción de Reentrenamiento */}
      <div className="bg-[#141416] rounded-card border border-white/[0.08] p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#FF4A15]/20 text-[#FF4A15] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Gestión Predictiva de Inventarios (IA)
            </h2>
          </div>
          <p className="text-xs text-[#8E8E93] mt-1">
            Pronósticos de demanda a 7 días calculados con modelo LightGBM local
          </p>
        </div>

        <button
          type="button"
          onClick={handleRetrain}
          disabled={retraining}
          className="h-12 px-6 rounded-full bg-[#FF4A15] hover:bg-[#E63900] text-white text-xs font-extrabold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer self-stretch sm:self-auto justify-center"
        >
          <RefreshCw className={`w-4 h-4 ${retraining ? 'animate-spin' : ''}`} />
          <span>{retraining ? 'Entrenando Modelo...' : 'Reentrenar Modelo (IA)'}</span>
        </button>
      </div>

      {message && (
        <div className="p-4 bg-[#34D399]/15 border border-[#34D399]/30 rounded-2xl text-[#34D399] text-xs font-bold flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* 3 Tarjetas KPI con Métricas Reales */}
      <PrediccionesKpiGrid
        summary={summary}
        reponerCount={itemsPorReponer.length}
        totalUnidadesReponer={totalUnidadesReponer}
      />

      {/* Gráficos Analíticos Planos + Resumen Consolidado */}
      <PrediccionesCharts
        alertas={alertas}
        criticos={counts.critico}
        advertencias={counts.advertencia}
        optimos={counts.optimo}
        reponerCount={itemsPorReponer.length}
        totalUnidadesReponer={totalUnidadesReponer}
      />

      {/* Tabla Inteligente con Prioridad, Buscador, CSV y Reposición Directa */}
      <PrediccionesTable
        alertas={alertas}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        filterNivel={filterNivel}
        onFilterChange={setFilterNivel}
        counts={counts}
        onExportCsv={handleExportCsv}
        onOpenReponer={(item) => setReponerItem(item)}
      />

      {/* Modal de Reposición Directa al Kardex */}
      <ReposicionRapidaModal
        item={reponerItem}
        onClose={() => setReponerItem(null)}
        onSuccess={async () => {
          setMessage('Compra registrada en el Kardex y cobertura recalculada.');
          await loadSummary();
        }}
      />
    </div>
  );
};
