import { Hero } from '@/components/dashboard/Hero'
import { LiveFeed } from '@/components/dashboard/LiveFeed'
import { NeedsALook } from '@/components/dashboard/NeedsALook'
import { SyncControlCard } from '@/components/dashboard/SyncControlCard'
import { YourServices } from '@/components/dashboard/YourServices'
import { Card } from '@/components/ui/Card'
import { useAccounts } from '@/hooks/useAccounts'
import { useSettings } from '@/hooks/useSettings'
import { useSyncStatus } from '@/hooks/useSyncStatus'

/** The hero's headline stands in for the page's h1 (see Hero.tsx) — a
 * separate "Dashboard" title above it would just repeat what the sentence
 * already says. */
export default function Dashboard() {
  const { accounts } = useAccounts()
  const { status, error, refresh } = useSyncStatus()
  const { settings } = useSettings()

  return (
    <div className="flex flex-col gap-7">
      {error && <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">Could not load sync status: {error}</p>}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
        <Hero accounts={accounts} status={status} displayName={settings?.DISPLAY_NAME} />
        <SyncControlCard status={status} onQueued={() => void refresh()} />
      </div>

      <NeedsALook accounts={accounts} status={status} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.65fr_1fr] lg:items-start">
        <Card className="flex flex-col gap-3 overflow-hidden p-4 sm:p-5">
          <h2 className="text-[15px] font-extrabold text-text">Recent activity</h2>
          <LiveFeed />
        </Card>
        <YourServices accounts={accounts} status={status} />
      </div>
    </div>
  )
}
