import React from 'react';

interface StockBadgeProps {
  stock: number;
  min?: number;
}

const map = {
  critico: { cls: 'bg-danger-soft text-danger', dot: 'bg-danger', txt: 'Crítico' },
  bajo: { cls: 'bg-warning-soft text-warning', dot: 'bg-warning', txt: 'Bajo' },
  optimo: { cls: 'bg-success-soft text-success', dot: 'bg-success', txt: 'Óptimo' },
};

export const StockBadge: React.FC<StockBadgeProps> = ({ stock, min = 5 }) => {
  const k = stock <= 0 || stock <= min * 0.5 ? 'critico' : stock <= min ? 'bajo' : 'optimo';
  const m = map[k];

  return (
    <span className={`pill ${m.cls}`}>
      <i className={`h-1.5 w-1.5 rounded-full ${m.dot} ${k === 'critico' ? 'animate-pulse-dot' : ''}`} />
      <span>{stock <= 0 ? 'Agotado' : `${stock} u`}</span>
    </span>
  );
};
