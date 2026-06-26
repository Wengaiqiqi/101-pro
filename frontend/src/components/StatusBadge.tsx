import type { ReactNode } from 'react';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
}

export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
