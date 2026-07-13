import { useState } from 'react'

import { api, errorMessage } from '@/api'
import { cn } from '@/lib/cn'
import type { TransferConflict } from '@/types'

import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { TextField } from '../ui/TextField'

interface ConflictListProps {
  jobId: string
  conflicts: TransferConflict[]
  onResolved: () => void
}

/** Tracks the transfer couldn't automatically match on the destination
 * service. A search-picker is a future refinement — for now each conflict
 * resolves by pasting the destination track's id/URL directly. */
export function ConflictList({ jobId, conflicts, onResolved }: ConflictListProps) {
  if (conflicts.length === 0) return null

  const unresolvedCount = conflicts.filter((c) => !c.resolved).length

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Conflicts {unresolvedCount > 0 ? `(${unresolvedCount} need review)` : '(all resolved)'}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          These tracks couldn't be automatically matched on the destination service. Find the matching track there
          and paste its link (or raw id) to resolve one.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {conflicts.map((conflict) => (
          <ConflictRow key={conflict.key} jobId={jobId} conflict={conflict} onResolved={onResolved} />
        ))}
      </ul>
    </Card>
  )
}

function ConflictRow({ jobId, conflict, onResolved }: { jobId: string; conflict: TransferConflict; onResolved: () => void }) {
  const [destId, setDestId] = useState('')
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleResolve() {
    const trimmed = destId.trim()
    if (!trimmed) return
    setResolving(true)
    setError(null)
    try {
      await api.resolveTransferConflict(jobId, { key: conflict.key, dest_id: trimmed })
      onResolved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setResolving(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{conflict.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{conflict.artist}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            conflict.resolved
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
          )}
        >
          {conflict.resolved ? 'Resolved' : 'Needs review'}
        </span>
      </div>

      {!conflict.resolved && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            void handleResolve()
          }}
        >
          <div className="flex-1">
            <TextField
              label="Destination track link or id"
              placeholder="e.g. https://open.spotify.com/track/..."
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
            />
          </div>
          <Button type="submit" loading={resolving} disabled={!destId.trim()}>
            Resolve
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </li>
  )
}
