import clsx from 'clsx';
import { CloudOff, type LucideIcon } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { ApiError } from '@/lib/api';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('skeleton', className)} />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-10 !rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-content px-4 pt-8 sm:px-8" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 !rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-6 h-80 !rounded-card" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-[340px] !rounded-banner" />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-40 !rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-5 h-96 !rounded-card" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action, compact }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx('flex flex-col items-center text-center', compact ? 'px-3 py-7' : 'px-4 py-12')}>
      <span className="relative mb-4 grid place-items-center">
        <span aria-hidden className="absolute size-24 animate-drift rounded-full bg-brand-100/70 blur-xl" />
        <span className="relative grid size-16 place-items-center rounded-[22px] bg-white text-brand-600 shadow-card">
          <Icon aria-hidden className="size-7" />
        </span>
      </span>
      <h3 className="card-title">{title}</h3>
      {text && <p className="mt-1 max-w-[42ch] text-ink-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const message = error instanceof ApiError ? error.message : 'This couldn’t be loaded.';
  return (
    <div role="alert" className={clsx('flex flex-col items-center text-center', compact ? 'px-3 py-6' : 'px-4 py-12')}>
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-coral-50 text-coral-600">
        <CloudOff aria-hidden className="size-6" />
      </span>
      <h3 className="card-title">This didn’t load</h3>
      <p className="mt-1 max-w-[42ch] text-ink-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Loading, failed and loaded states in one place, so no screen shows a failure as if it were empty. */
export function Loaded<T>({ query, skeleton, children, compact }: { query: UseQueryResult<T>; skeleton?: ReactNode; children: (data: T) => ReactNode; compact?: boolean }) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} compact={compact} />;
  return <>{children(query.data)}</>;
}
