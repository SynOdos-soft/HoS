import * as React from 'react';
import { cn } from '@/lib/utils';

export const Surface = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-surface', className)} {...props} />
);

export const SectionHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-section-header', className)} {...props} />
);

export const StatusBadge = ({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }) => (
  <span className={cn('ui-status-badge', `ui-status-${tone}`, className)} {...props} />
);

export const EmptyState = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-empty-state', className)} {...props} />
);
