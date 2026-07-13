import { LuArrowRight } from 'react-icons/lu'

import { serviceLogoId, tagDot, tagLabel, tagText, TRANSFER_STATUS_STYLES } from '@/lib/constants'
import { cn } from '@/lib/cn'
import type { TransferJob } from '@/types'

import { Card } from '../ui/Card'
import { CountChip } from '../ui/CountChip'
import { Pill } from '../ui/Pill'
import { ServiceLogo } from '../ui/ServiceLogo'
import { LoadingStatus, Skeleton } from '../ui/Skeleton'
import { Spinner } from '../ui/Spinner'

function EndpointBadge({ provider, playlistName }: { provider: string; playlistName: string }) {
  const logoId = serviceLogoId(provider)
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {logoId ? (
        <ServiceLogo service={logoId} className={cn('size-3.5 shrink-0', tagText(provider))} />
      ) : (
        <span className={cn('size-2 shrink-0 rounded-full', tagDot(provider))} aria-hidden="true" />
      )}
      <span className="min-w-0 truncate font-semibold text-text">{playlistName}</span>
      <span className="shrink-0 text-xs font-normal text-text-3">({tagLabel(provider)})</span>
    </span>
  )
}

export function TransferProgress({ job, error }: { job: TransferJob | null; error: string | null }) {
  if (!job) {
    return (
      <Card className="p-4 sm:p-6">
        {error ? (
          <p className="text-sm text-danger">Could not load transfer status: {error}</p>
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
  const isRunning = job.status === 'running'
  const isDone = job.status === 'done'

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <EndpointBadge provider={job.source.provider} playlistName={job.source.playlist_name} />
          <LuArrowRight className="size-3.5 shrink-0 text-text-3" aria-hidden="true" />
          <EndpointBadge provider={job.dest.provider} playlistName={job.dest.playlist_name} />
        </div>
        <Pill toneClasses={style.badge} label={style.label} pulsing={isRunning} />
      </div>

      {isRunning && (
        <div
          role="progressbar"
          aria-label="Transfer in progress"
          aria-valuetext="In progress — exact completion time isn't known"
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-inset"
        >
          <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent [animation:indeterminate-bar_1.4s_ease-in-out_infinite]" />
        </div>
      )}

      {job.error && <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{job.error}</p>}

      {isRunning ? (
        <div className="flex flex-wrap items-end gap-4">
          {job.added > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[28px] font-bold leading-none text-success">+{job.added}</span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-text-3">ADDED SO FAR</span>
            </div>
          ) : (
            // Nothing's landed yet — a prominent "+0" reads as broken, so
            // this stays subtle until the count actually has something to
            // show, then the live counter above takes over.
            <div className="flex items-center gap-2 text-sm text-text-2">
              <Spinner className="size-3.5 shrink-0" aria-hidden="true" />
              Copying…
            </div>
          )}
          {job.deferred > 0 && <CountChip tone="warning" value={job.deferred} />}
          {unresolvedConflicts > 0 && (
            <span className="inline-flex h-6 items-center rounded-chip bg-warning-soft px-2 font-mono text-xs font-semibold text-warning">
              {unresolvedConflicts} need review
            </span>
          )}
        </div>
      ) : isDone ? (
        <p className="text-sm text-text-2">
          <span className="font-semibold text-success">Done</span>
          <span className="font-mono"> · {job.added} added</span>
          {job.deferred > 0 && <span className="font-mono"> · {job.deferred} deferred</span>}
          {unresolvedConflicts > 0 && <span className="font-mono"> · {unresolvedConflicts} need review</span>}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <CountChip tone="success" sign="+" value={job.added} />
          {job.deferred > 0 && <CountChip tone="warning" value={job.deferred} />}
          {unresolvedConflicts > 0 && (
            <span className="inline-flex h-6 items-center rounded-chip bg-warning-soft px-2 font-mono text-xs font-semibold text-warning">
              {unresolvedConflicts} need review
            </span>
          )}
        </div>
      )}
    </Card>
  )
}
