import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 min-h-[200px] p-8 text-center">
      {icon ? <div className="mb-2">{icon}</div> : null}
      <div>
        <h2 className="m-0 text-[15px] font-bold text-black tracking-tight">{title}</h2>
        <p className="mt-1.5 text-[13px] text-zinc-500 font-medium max-w-[280px] mx-auto">{description}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
