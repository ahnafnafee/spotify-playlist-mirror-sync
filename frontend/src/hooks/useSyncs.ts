import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from '../api'
import type { SyncJob } from '../types'

/** The list of named sync jobs (GET /api/syncs) — the Sync page's primary
 * data source. Mirrors useAccounts/useSettings' own shape for consistency. */
export function useSyncs() {
  const [syncs, setSyncs] = useState<SyncJob[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getSyncs()
      setSyncs(data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { syncs, loading, error, refresh }
}
