import { cn } from '@/lib/cn'
import { tagLabel, TRANSFER_STATUS_STYLES } from '@/lib/constants'
import type { TransferJob } from '@/types'

import { Card } from '../ui/Card'
import { LoadingStatus, Skeleton } from '../ui/Skeleton'

export function TransferProgress({ job, error }: { job: TransferJob | null; error: string | null }) {
  if (!job) {
    return (
      <Card className="p-4 sm:p-6">
        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">Could not load transfer status: {error}</p>
        ) : (
          <LoadingStatus label="Loading transfer status…">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          </LoadingStatus>
        )}
      </Card>
    )
  }

  const style = TRANSFER_STATUS_STYLES[job.status]
  const unresolvedConflicts = job.conflicts.filter((c) => !c.resolved).length

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', style.badge)}
        >
          <span className={cn('size-1.5 rounded-full', job.status === 'running' && 'animate-pulse', style.dot)} aria-hidden="true" />
          {style.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <span className="font-medium text-slate-800 dark:text-slate-100">{job.source.playlist_name}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">on {tagLabel(job.source.provider)}</span>
        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
          →
        </span>
        <span className="font-medium text-slate-800 dark:text-slate-100">{job.dest.playlist_name}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">on {tagLabel(job.dest.provider)}</span>
      </div>

      {job.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{job.error}</p>
      )}

      <div className="flex flex-wrap gap-2 text-xs font-medium">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          +{job.added} added
        </span>
        {job.deferred > 0 && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            {job.deferred} deferred
          </span>
        )}
        {unresolvedConflicts > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {unresolvedConflicts} need review
          </span>
        )}
      </div>
    </Card>
  )
}
