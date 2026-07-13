import { useState } from 'react'
import { LuClock, LuEye, LuLightbulb, LuZap } from 'react-icons/lu'

import { api, errorMessage } from '@/api'
import { useNow } from '@/hooks/useNow'
import { formatClockTime, formatCountdown, formatInterval } from '@/lib/format'
import type { SyncStatus } from '@/types'

import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Toggle } from '../ui/Toggle'

interface Props {
  status: SyncStatus | null
  onQueued: () => void
}

/** The dashboard's action card: when the next automatic pass runs, the two
 * one-word actions ("Sync now" / "Preview"), and the auto-sync toggle —
 * absorbs what used to be RunControls + the schedule toggle into one card,
 * matching the mockup's grouping. */
export function SyncControlCard({ status, onQueued }: Props) {
  const [confirmingExecute, setConfirmingExecute] = useState(false)
  const [runningDry, setRunningDry] = useState(false)
  const [runningExecute, setRunningExecute] = useState(false)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = useNow()

  const disabled = !status || status.running
  const busy = runningDry || runningExecute

  async function runDry() {
    setError(null)
    setRunningDry(true)
    try {
      await api.runSync(false)
      onQueued()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRunningDry(false)
    }
  }

  async function confirmExecute() {
    setError(null)
    setRunningExecute(true)
    try {
      await api.runSync(true)
      onQueued()
      setConfirmingExecute(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRunningExecute(false)
    }
  }

  async function toggleSchedule() {
    if (!status) return
    setScheduleBusy(true)
    setError(null)
    try {
      await api.setSchedule({ action: status.scheduled ? 'pause' : 'resume' })
      onQueued()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setScheduleBusy(false)
    }
  }

  return (
    <Card className="flex min-w-[280px] flex-1 flex-col gap-3.5 p-5 lg:max-w-[380px]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-text-3">
          <LuClock className="size-[15px] shrink-0" aria-hidden="true" />
          Next check
        </span>
        {status?.scheduled && status.next_run_at ? (
          <span className="text-[13.5px] font-bold text-text">
            {formatClockTime(status.next_run_at)}{' '}
            <span className="font-mono text-[11px] font-normal text-text-3">· {formatCountdown(status.next_run_at, now)}</span>
          </span>
        ) : (
          <span className="text-[13px] font-medium text-text-3">Auto-sync paused</span>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-[1.4]"
          icon={<LuZap className="size-4" aria-hidden="true" />}
          onClick={() => setConfirmingExecute(true)}
          disabled={disabled || busy}
        >
          Sync now
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          icon={<LuEye className="size-4" aria-hidden="true" />}
          onClick={() => void runDry()}
          loading={runningDry}
          disabled={disabled || busy}
        >
          Preview
        </Button>
      </div>

      <div className="flex items-start gap-2.5 rounded-control bg-accent-soft px-3 py-2.5">
        <LuLightbulb className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-text-2">
          <b className="font-semibold text-text">Tip</b> — Preview checks everything but never changes your libraries.
          Great before a first real sync.
        </p>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border pt-3">
        <span className="flex-1 text-[12.5px] text-text-3">Automatic sync</span>
        {status && <span className="font-mono text-[11px] text-text-3">every {formatInterval(status.interval_s)}</span>}
        <Toggle
          checked={Boolean(status?.scheduled)}
          onChange={() => void toggleSchedule()}
          label={status?.scheduled ? 'Pause automatic sync' : 'Resume automatic sync'}
          hideLabel
          disabled={scheduleBusy || !status}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={confirmingExecute}
        title="Apply changes now?"
        description="This adds and removes tracks on your connected services so they match Spotify. Removals are capped per pass, but this can't be undone automatically — review a preview first if you're unsure."
        confirmLabel="Apply changes"
        danger
        loading={runningExecute}
        onConfirm={() => void confirmExecute()}
        onCancel={() => setConfirmingExecute(false)}
      />
    </Card>
  )
}
