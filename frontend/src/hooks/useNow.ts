import { useEffect, useState } from 'react'

/** Re-renders the caller every `intervalMs` — for live-updating relative-time
 * displays (the dashboard's "next check in…" countdown) without a data
 * refetch. Defaults to 30s: plenty fresh for an "Xh Ym" readout. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
