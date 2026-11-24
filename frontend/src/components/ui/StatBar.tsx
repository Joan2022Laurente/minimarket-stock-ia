import React from 'react';

interface StatBarProps {
  current: number;
  max: number;
  color?: 'brand' | 'warning' | 'danger' | 'success' | 'ai';
  className?: string;
}

export const StatBar: React.FC<StatBarProps> = ({
  current,
  max,
  color = 'brand',
  className = '',
}) => {
  const pct = Math.min(100, Math.max(0, max > 0 ? (current / max) * 100 : 0));

  const colorMap = {
    brand: 'bg-brand-500',
    warning: 'bg-warning',
    danger: 'bg-danger',
    success: 'bg-success',
    ai: 'bg-ai',
  };

  return (
    <div className={`relative h-2.5 overflow-hidden rounded-full bg-surface-3 bg-hatch ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${colorMap[color]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
