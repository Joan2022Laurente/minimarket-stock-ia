import React from 'react';
import { BarChart3, Sparkles } from 'lucide-react';
import { PrediccionItem } from '../../../types/prediccion';

interface PrediccionesChartsProps {
  alertas: PrediccionItem[];
  criticos: number;
  advertencias: number;
  optimos: number;
  reponerCount: number;
  totalUnidadesReponer: number;
}

export const PrediccionesCharts: React.FC<PrediccionesChartsProps> = ({
  alertas,
  criticos,
  advertencias,
  optimos,
  reponerCount,
  totalUnidadesReponer,
}) => {
  const total = Math.max(1, criticos + advertencias + optimos);
  const pctCritico = (criticos / total) * 100;
  const pctBajo = (advertencias / total) * 100;
  const pctOptimo = (optimos / total) * 100;

  // Top 6 productos por demanda proyectada a 7 días
  const top6 = [...alertas]
    .sort((a, b) => Number(b.demanda_diaria_estimada ?? 0) - Number(a.demanda_diaria_estimada ?? 0))
    .slice(0, 6);

  const maxBarValue = Math.max(
    1,
    ...top6.map((item) =>
      Math.max(Number(item.stock_actual ?? 0), Number(item.demanda_diaria_estimada ?? 0) * 7)
    )
  );

  // Producto más urgente (menor días de cobertura)
  const masUrgente = [...alertas].sort(
    (a, b) => Number(a.dias_cobertura ?? 999) - Number(b.dias_cobertura ?? 999)
  )[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Gráfico 1: Top 6 Demanda 7 días vs Stock Actual */}
      <div className="bg-[#141416] rounded-card border border-white/[0.08] p-6 space-y-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#FF4A15]" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Top 6 Rotación: Stock vs Demanda (7d)
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#8E8E93]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34D399]" />
              Stock
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF4A15]" />
              Demanda 7d
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {top6.map((item) => {
            const stock = Number(item.stock_actual ?? 0);
            const demanda7d = Number(item.demanda_diaria_estimada ?? 0) * 7;
            const stockW = Math.min(100, (stock / maxBarValue) * 100);
            const demandW = Math.min(100, (demanda7d / maxBarValue) * 100);

            return (
              <div key={item.producto_id} className="space-y-1">
                <div className="flex justify-between items-center gap-2 text-xs">
                  <span className="font-semibold text-white truncate">{item.producto_nombre}</span>
                  <span className="font-mono text-[11px] text-[#8E8E93] shrink-0">
                    {stock} u / {demanda7d.toFixed(0)} u
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-[#1C1C1F] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#34D399]"
                      style={{ width: `${stockW}%` }}
                    />
                  </div>
                  <div className="h-2 rounded-full bg-[#1C1C1F] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#FF4A15]"
                      style={{ width: `${demandW}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico 2: Salud del Catálogo + Resumen Ejecutivo Consolidado */}
      <div className="bg-[#141416] rounded-card border border-white/[0.08] p-6 flex flex-col justify-between gap-5 min-w-0">
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
            <Sparkles className="w-4 h-4 text-[#FF4A15]" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Salud Predictiva y Resumen Ejecutivo
            </h3>
          </div>

          {/* Barra segmentada proporcional */}
          <div className="space-y-2.5">
            <div className="h-3.5 rounded-full bg-[#1C1C1F] overflow-hidden flex">
              {pctCritico > 0 && (
                <div className="h-full bg-[#FF4D6A]" style={{ width: `${pctCritico}%` }} />
              )}
              {pctBajo > 0 && (
                <div className="h-full bg-[#FFD21F]" style={{ width: `${pctBajo}%` }} />
              )}
              {pctOptimo > 0 && (
                <div className="h-full bg-[#34D399]" style={{ width: `${pctOptimo}%` }} />
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-tile bg-[#1C1C1F] border border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase text-[#FF4D6A] block">Crítico</span>
                <span className="text-lg font-extrabold font-mono text-white">{criticos}</span>
              </div>
              <div className="p-2.5 rounded-tile bg-[#1C1C1F] border border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase text-[#FFD21F] block">Bajo</span>
                <span className="text-lg font-extrabold font-mono text-white">{advertencias}</span>
              </div>
              <div className="p-2.5 rounded-tile bg-[#1C1C1F] border border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase text-[#34D399] block">Óptimo</span>
                <span className="text-lg font-extrabold font-mono text-white">{optimos}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen Consolidado Real */}
        <div className="p-4 rounded-tile bg-[#1C1C1F] border border-white/[0.06] space-y-2">
          <p className="text-xs text-white font-bold">Diagnóstico consolidado del catálogo:</p>
          <p className="text-xs text-[#8E8E93] leading-relaxed">
            {reponerCount > 0 ? (
              <>
                Se detectaron <strong className="text-white">{reponerCount} productos</strong> por
                debajo de su punto de reorden, requiriendo un pedido total de{' '}
                <strong className="text-[#FF4A15]">{totalUnidadesReponer} unidades</strong> para
                cubrir los próximos 14 días más stock de seguridad.
              </>
            ) : (
              <>
                Todo el catálogo cuenta con stock por encima del punto de reorden calculado por el
                modelo LightGBM.
              </>
            )}
          </p>
          {masUrgente && (
            <p className="text-[11px] font-mono text-[#FFD21F] pt-1">
              Menor cobertura: {masUrgente.producto_nombre} (
              {Number(masUrgente.dias_cobertura ?? 0).toFixed(1)} días)
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
