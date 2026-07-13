import { useState } from 'react'
import { LuEye, LuZap } from 'react-icons/lu'

import { api, errorMessage } from '@/api'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ButtonSize } from '@/components/ui/buttonStyles'
import type { SyncJob } from '@/types'

interface Props {
  job: SyncJob
  /** True while any pass is running — only one runs at a time. */
  disabled?: boolean
  onChanged: () => void
  size?: ButtonSize
}

/** Per-sync "Sync now" (execute=1, confirmed) + "Preview" (execute=0, no
 * confirm needed — it never changes anything) — shared by the Sync page's
 * SyncJobCard and the dashboard's Syncs panel so both run a job the same
 * way. Owns its own async/confirm state; `onChanged` just triggers the
 * caller's refresh. */
export function SyncRunButtons({ job, disabled, onChanged, size = 'sm' }: Props) {
  const [previewing, setPreviewing] = useState(false)
  const [runningNow, setRunningNow] = useState(false)
  const [confirmingRun, setConfirmingRun] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function preview() {
    setPreviewing(true)
    setError(null)
    try {
      await api.runSyncJob(job.id, false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPreviewing(false)
    }
  }

  async function runNow() {
    setRunningNow(true)
    setError(null)
    try {
      await api.runSyncJob(job.id, true)
      setConfirmingRun(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRunningNow(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex shrink-0 gap-2">
        <Button
          size={size}
          icon={<LuZap className="size-3.5" aria-hidden="true" />}
          onClick={() => setConfirmingRun(true)}
          disabled={disabled || previewing}
        >
          Sync now
        </Button>
        <Button
          variant="secondary"
          size={size}
          icon={<LuEye className="size-3.5" aria-hidden="true" />}
          onClick={() => void preview()}
          loading={previewing}
          disabled={disabled || runningNow}
        >
          Preview
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      <ConfirmDialog
        open={confirmingRun}
        title={`Sync "${job.name}" now?`}
        description="This applies real changes to your connected services right away, outside its normal schedule. Removals are still capped per pass."
        confirmLabel="Sync now"
        danger
        loading={runningNow}
        onConfirm={() => void runNow()}
        onCancel={() => setConfirmingRun(false)}
      />
    </div>
  )
}
