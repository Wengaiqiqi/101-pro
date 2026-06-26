import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
