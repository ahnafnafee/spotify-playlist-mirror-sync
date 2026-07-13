import { useCallback, useEffect, useRef, useState } from 'react'

import { api, errorMessage } from '../api'
import type { TransferJob, TransferStatus } from '../types'

const POLL_MS = 1500
const TERMINAL_STATUSES: ReadonlySet<TransferStatus> = new Set(['done', 'error'])

/** Polls GET /api/transfers/{id} while a job is in flight. Stops once the
 * job reaches a terminal status ("done"/"error"); "queued", "busy" (the
 * shared sync engine is occupied with something else — SyncService's single
 * queue — and this job hasn't started yet), and "running" all keep polling.
 * Pass `null` for `jobId` to stay idle (no transfer started yet). */
export function useTransfer(jobId: string | null) {
  const [job, setJob] = useState<TransferJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const statusRef = useRef<TransferStatus | null>(null)

  const refresh = useCallback(async () => {
    if (!jobId || inFlight.current) return
    inFlight.current = true
    try {
      const data = await api.getTransfer(jobId)
      setJob(data)
      statusRef.current = data.status
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      inFlight.current = false
    }
  }, [jobId])

  useEffect(() => {
    statusRef.current = null
    setJob(null)
    setError(null)
    if (!jobId) return

    void refresh()
    const id = window.setInterval(() => {
      if (statusRef.current && TERMINAL_STATUSES.has(statusRef.current)) {
        window.clearInterval(id)
        return
      }
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [jobId, refresh])

  return { job, error, refresh }
}
