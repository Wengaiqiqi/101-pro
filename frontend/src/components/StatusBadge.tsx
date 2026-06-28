import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface StatusBadgeProps {
  className?: string;
  children: ReactNode;
}

export function StatusBadge({ className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-fit min-h-[22px] px-2.5 py-0.5',
        'rounded-full border border-slate-200 text-xs font-bold',
        'bg-slate-50 text-slate-600',
        className,
      )}
    >
      {children}
    </span>
  );
}
