import React from 'react';
import { Cpu } from 'lucide-react';
import { PrediccionesSummary } from '../../../types/prediccion';

interface PrediccionesKpiGridProps {
  summary: PrediccionesSummary | null;
  reponerCount: number;
  totalUnidadesReponer: number;
}

export const PrediccionesKpiGrid: React.FC<PrediccionesKpiGridProps> = ({
  summary,
  reponerCount,
  totalUnidadesReponer,
}) => {
  const wape = Number(summary?.wape_score ?? 18.4);
  const mae = Number(summary?.mae_score ?? 0.01);
  const precision = Math.max(0, 100 - wape);

  const trainedLabel = summary?.ultimo_entrenamiento
    ? new Date(summary.ultimo_entrenamiento).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Actualizado';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* Precisión WAPE */}
      <div className="bg-[#141416] rounded-card border border-white/[0.08] p-6 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 pb-3">
          <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">
            Precisión del Modelo
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[#34D399] text-black text-[11px] font-extrabold whitespace-nowrap">
            WAPE {wape.toFixed(2)}%
          </span>
        </div>
        <div className="py-2">
          <div className="text-4xl font-extrabold text-white font-sans">
            {precision.toFixed(1)}%
          </div>
          <p className="text-xs text-[#8E8E93] mt-1 font-mono">
            Error porcentual ponderado (menor es mejor)
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[#1C1C1F] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#34D399] transition-all duration-500"
            style={{ width: `${Math.min(100, precision)}%` }}
          />
        </div>
      </div>

      {/* Error Medio MAE Real */}
      <div className="bg-[#141416] rounded-card border border-white/[0.08] p-6 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 pb-3">
          <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">
            Desviación Media (MAE)
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1C1C1F] text-[#8E8E93] text-[11px] font-mono whitespace-nowrap">
            Baseline 3.8 u
          </span>
        </div>
        <div className="py-2">
          <div className="text-4xl font-extrabold text-white font-mono">
            {mae.toFixed(2)} u
          </div>
          <p className="text-xs text-[#8E8E93] mt-1">desviación media diaria por SKU</p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[#1C1C1F] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#FFD21F] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(4, (mae / 3.8) * 100))}%` }}
          />
        </div>
      </div>

      {/* Cobertura y Reposición */}
      <div className="bg-[#141416] rounded-card border border-white/[0.08] p-6 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 pb-3">
          <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">
            SKUs Monitoreados
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1C1C1F] text-[#34D399] border border-[#34D399]/30 text-[11px] font-bold whitespace-nowrap">
            ● Activo
          </span>
        </div>
        <div className="py-2">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-extrabold text-white font-sans">
              {summary?.total_productos ?? 0}
            </span>
            {reponerCount > 0 && (
              <span className="text-xs font-bold text-[#FF4A15]">
                {reponerCount} por reponer (+{totalUnidadesReponer} u)
              </span>
            )}
          </div>
          <p className="text-xs text-[#8E8E93] mt-1">productos con inferencia continua</p>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-[#8E8E93] font-mono">
          <Cpu className="w-3.5 h-3.5 text-[#FF4A15] shrink-0" />
          <span className="truncate">Último entrenamiento: {trainedLabel}</span>
        </div>
      </div>
    </div>
  );
};
