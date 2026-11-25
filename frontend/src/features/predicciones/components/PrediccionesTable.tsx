import React from 'react';
import { Search, Download, ShoppingCart } from 'lucide-react';
import { PrediccionItem } from '../../../types/prediccion';
import { StockBadge } from '../../../components/ui/StockBadge';

interface PrediccionesTableProps {
  alertas: PrediccionItem[];
  loading: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  filterNivel: string;
  onFilterChange: (nivel: string) => void;
  counts: { todos: number; critico: number; advertencia: number; optimo: number };
  onExportCsv: () => void;
  onOpenReponer: (item: PrediccionItem) => void;
}

const SEVERITY_ORDER: Record<string, number> = {
  critico: 0,
  advertencia: 1,
  optimo: 2,
};

export const PrediccionesTable: React.FC<PrediccionesTableProps> = ({
  alertas,
  loading,
  search,
  onSearchChange,
  filterNivel,
  onFilterChange,
  counts,
  onExportCsv,
  onOpenReponer,
}) => {
  const filteredSorted = [...alertas]
    .filter((item) => {
      const matchesNivel = filterNivel === 'todos' || item.nivel_alerta === filterNivel;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.producto_nombre.toLowerCase().includes(q) ||
        (item.codigo_barras || '').includes(q);
      return matchesNivel && matchesSearch;
    })
    .sort((a, b) => {
      const sevDiff =
        (SEVERITY_ORDER[a.nivel_alerta] ?? 3) - (SEVERITY_ORDER[b.nivel_alerta] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      const sugDiff = Number(b.cantidad_sugerida ?? 0) - Number(a.cantidad_sugerida ?? 0);
      if (sugDiff !== 0) return sugDiff;
      return Number(a.dias_cobertura ?? 999) - Number(b.dias_cobertura ?? 999);
    });

  const filterOptions = [
    { id: 'todos', label: `Todos (${counts.todos})` },
    { id: 'critico', label: `Crítico (${counts.critico})` },
    { id: 'advertencia', label: `Bajo (${counts.advertencia})` },
    { id: 'optimo', label: `Óptimo (${counts.optimo})` },
  ];

  return (
    <div className="bg-[#141416] rounded-card border border-white/[0.08] p-6 space-y-4 min-w-0">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Plan de Reabastecimiento Sugerido (7 Días)
          </h3>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            Ordenado por prioridad de agotamiento · Stock vs. Punto de Reorden (ROP)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar SKU o producto..."
              className="w-full h-10 pl-10 pr-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white placeholder-[#5C5C62] focus:outline-none focus:border-white/25"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#1C1C1F] p-1 rounded-full border border-white/[0.06] overflow-x-auto">
            {filterOptions.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                  filterNivel === f.id
                    ? 'bg-white text-black'
                    : 'text-[#8E8E93] hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onExportCsv}
            className="h-10 px-4 rounded-full bg-[#1C1C1F] border border-white/[0.08] hover:border-white/30 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#34D399]" />
            <span>Exportar Orden (CSV)</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-[#8E8E93] text-sm">Cargando pronósticos de IA...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.06] text-[#8E8E93] font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4">Stock / Punto Reorden</th>
                <th className="py-3 px-4">Demanda 7 Días</th>
                <th className="py-3 px-4">Cobertura</th>
                <th className="py-3 px-4">Compra Sugerida</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#8E8E93] text-xs">
                    No hay productos coincidentes en esta categoría.
                  </td>
                </tr>
              ) : (
                filteredSorted.map((a) => {
                  const dias = Number(a.dias_cobertura ?? 0);
                  const demanda7dias = Number(a.demanda_diaria_estimada ?? 0) * 7;
                  const stock = Number(a.stock_actual ?? 0);
                  const rop = Number(a.punto_reorden ?? 0);
                  const cantSugerida = Number(a.cantidad_sugerida ?? 0);

                  const coberturaColor =
                    dias <= 3
                      ? 'text-[#FF4D6A] font-bold'
                      : dias <= 7
                      ? 'text-[#FFD21F] font-bold'
                      : 'text-[#34D399] font-bold';

                  const ratioPct = Math.min(100, Math.round((stock / Math.max(1, rop * 1.5)) * 100));

                  return (
                    <tr key={a.producto_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-white">{a.producto_nombre}</p>
                        {a.codigo_barras && (
                          <p className="text-[10px] font-mono text-[#5C5C62] mt-0.5">
                            {a.codigo_barras}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <StockBadge stock={stock} />
                          <div className="w-24 hidden sm:block">
                            <div className="flex justify-between text-[10px] font-mono text-[#8E8E93] mb-1">
                              <span>ROP {rop.toFixed(0)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[#1C1C1F] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  stock <= rop ? 'bg-[#FFD21F]' : 'bg-[#34D399]'
                                }`}
                                style={{ width: `${ratioPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-white whitespace-nowrap">
                        {demanda7dias.toFixed(1)} u
                      </td>

                      <td className={`py-3.5 px-4 font-mono whitespace-nowrap ${coberturaColor}`}>
                        {dias.toFixed(1)} días
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {cantSugerida > 0 ? (
                          <span className="px-3 py-1 rounded-full bg-[#FF4A15]/20 text-[#FF4A15] font-mono font-bold text-xs">
                            +{cantSugerida} u
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-[#1C1C1F] text-[#8E8E93] font-mono text-xs">
                            0 u
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {cantSugerida > 0 ? (
                          <button
                            type="button"
                            onClick={() => onOpenReponer(a)}
                            className="px-3 py-1.5 rounded-full bg-[#FF4A15] hover:bg-[#E63900] text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Registrar Compra</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#5C5C62] font-medium">
                            Stock saludable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
