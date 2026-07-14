import { useCallback, useEffect, useRef, useState } from 'react'

import { api, errorMessage } from '../api'
import type { TransferJob } from '../types'

const POLL_MS = 1500

/** Polls GET /api/transfers (active jobs only — queued/running/paused) for
 * the dashboard's "Ongoing transfers" card. Keeps polling as long as the
 * list is non-empty; stops once it drains to empty rather than polling
 * forever for nothing. A fresh mount (e.g. navigating back to the
 * dashboard) always does its own initial fetch, so a transfer started
 * elsewhere still shows up on return. */
export function useTransfers() {
  const [jobs, setJobs] = useState<TransferJob[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const emptyRef = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const data = await api.listTransfers()
      setJobs(data)
      emptyRef.current = data.length === 0
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      if (emptyRef.current) {
        window.clearInterval(id)
        return
      }
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  return { jobs, error, refresh }
}
