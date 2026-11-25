export interface PrediccionItem {
  id?: number;
  producto_id: number;
  producto_nombre: string;
  codigo_barras?: string;
  stock_actual: number;
  demanda_diaria_estimada: number;
  dias_cobertura: number;
  punto_reorden: number;
  cantidad_sugerida: number;
  nivel_alerta: 'critico' | 'advertencia' | 'optimo';
  resumen_ejecutivo?: string;
  fecha_prediccion?: string;
}

export interface PrediccionesSummary {
  total_productos: number;
  criticos: number;
  advertencias: number;
  optimos: number;
  wape_score?: number;
  mae_score?: number;
  ultimo_entrenamiento?: string;
  alertas: PrediccionItem[];
}
