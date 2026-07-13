import type { Account, SyncJob } from '@/types'

// The N-way sync peers — mirrors the backend's own DEFAULT_PROVIDERS
// (engine/config.py). Jellyfin is a real connected account but isn't a sync
// peer (it only ever receives pushed cover art), so it never appears as a
// Services/Providers toggle or a Source-of-truth choice.
const SYNC_PEER_IDS = ['spotify', 'apple', 'ytmusic']

export function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinCsv(values: string[]): string {
  return values.join(',')
}

/** The N-way sync peers among `accounts`, in their original order. */
export function syncPeersOf(accounts: Account[]): Account[] {
  return accounts.filter((a) => SYNC_PEER_IDS.includes(a.id))
}

/** Whichever peer is locked as the source in one-way mode — `null` in
 * N-way, which has no single source. */
export function lockedSourceOf(job: Pick<SyncJob, 'mode' | 'source'>): string | null {
  return job.mode === 'nway' ? null : job.source || 'spotify'
}

/** Which providers a job actually includes. An explicit, non-empty
 * `providers` list wins; an empty one defaults to every currently-connected
 * peer (a display-time fallback only — nothing is written back until the
 * user actually touches a toggle). */
export function enabledProvidersOf(job: Pick<SyncJob, 'providers'>, peers: Account[]): Set<string> {
  const explicit = parseCsv(job.providers)
  if (explicit.length > 0) return new Set(explicit)
  return new Set(peers.filter((a) => a.state === 'connected').map((a) => a.id))
}

export interface SyncSummaryRow {
  label: string
  value: string
}

/** Plain-English recap of a job's config, one labeled row per aspect —
 * shared by the wizard's final-step review (rendered as a structured
 * label→value layout) and the Sync list page's per-job summary line
 * (flattened, Schedule dropped since the card shows interval separately),
 * so the two surfaces can never describe the same job differently.
 * `downloadDir` is the *global* Settings value — only the wizard, which
 * reads it for display, passes it; the card's line stays path-free. */
export function buildSyncSummaryRows(job: SyncJob, peers: Account[], downloadDir?: string): SyncSummaryRow[] {
  const rows: SyncSummaryRow[] = []

  rows.push({ label: 'Schedule', value: job.enabled ? `Every ${job.interval || '?'}` : 'Manual' })

  const enabled = enabledProvidersOf(job, peers)
  const lockedId = lockedSourceOf(job)
  const enabledNames = peers.filter((a) => a.id === lockedId || enabled.has(a.id)).map((a) => a.name)
  if (job.mode === 'nway') {
    // No single source in N-way — just list who's included.
    const who = enabledNames.length > 0 ? enabledNames.join(' ⇄ ') : 'no services selected'
    rows.push({ label: 'Direction', value: `Bidirectional (N-way) · ${who}` })
  } else {
    const sourceName = peers.find((a) => a.id === (job.source || 'spotify'))?.name ?? 'Spotify'
    const others = enabledNames.filter((n) => n !== sourceName)
    const who = others.length > 0 ? `${sourceName} → ${others.join(', ')}` : `${sourceName} only`
    rows.push({ label: 'Direction', value: `One-way · ${who}` })
  }

  const playlistNames = parseCsv(job.playlists)
  let playlistsValue: string
  if (playlistNames.length === 0) playlistsValue = 'All playlists'
  else if (playlistNames.length <= 3) playlistsValue = playlistNames.join(', ')
  else playlistsValue = `${playlistNames.slice(0, 3).join(', ')} +${playlistNames.length - 3} more`
  rows.push({ label: 'Playlists', value: playlistsValue })

  rows.push({ label: 'Limits', value: `≤${job.max_adds} adds, ≤${job.max_removals} removals / pass` })

  rows.push({
    label: 'Downloads',
    value: job.download ? (downloadDir?.trim() ? `On (${downloadDir.trim()})` : 'On') : 'Off',
  })

  return rows
}
