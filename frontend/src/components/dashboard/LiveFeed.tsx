import { useState } from 'react'

import { EventFeedList } from '@/components/events/EventFeedList'
import { useEventStream } from '@/hooks/useEventStream'
import { cn } from '@/lib/cn'

const COUNTER_META: Array<{ key: 'added' | 'removed' | 'held' | 'missing'; label: string; sign: string; className: string }> = [
  { key: 'added', label: 'added', sign: '+', className: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'removed', label: 'removed', sign: '-', className: 'text-rose-600 dark:text-rose-400' },
  { key: 'held', label: 'held', sign: '', className: 'text-amber-600 dark:text-amber-400' },
  { key: 'missing', label: 'missing', sign: '', className: 'text-slate-500 dark:text-slate-400' },
]

/** Live-tails the /events SSE stream for the sync dashboard, with running
 * add/remove/held/missing counters for the current pass. */
export function LiveFeed() {
  const { events, counters, connected } = useEventStream()
  const [paused, setPaused] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')}
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Live activity</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {connected ? 'connected' : 'reconnecting…'}
          </span>
          {paused && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Paused
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-medium">
          {COUNTER_META.map((c) => (
            <span key={c.key}>
              <span className={c.className}>
                {c.sign}
                {counters[c.key]}
              </span>{' '}
              <span className="text-slate-400 dark:text-slate-500">{c.label}</span>
            </span>
          ))}
        </div>
      </div>

      <EventFeedList
        events={events}
        paused={paused}
        onPausedChange={setPaused}
        emptyTitle="No activity yet"
        emptyDescription="Start a sync to see live progress here — every track added, removed, or held will show up in real time."
        ariaLabel="Live sync activity"
      />
    </div>
  )
}
