import { useEffect, useMemo, useState } from 'react'

import { api, errorMessage } from '@/api'
import type { ProviderPlaylistsEntry } from '@/hooks/useProviderPlaylists'
import { tagLabel } from '@/lib/constants'
import type { Account, StartTransferRequest } from '@/types'

import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

// Sentinel for the destination-playlist <select> — everything else in that
// list is a real playlist id.
const CREATE_NEW = '__create__'

interface Props {
  /** Connected accounts only — a transfer can't read from or write to a
   * disconnected service. */
  accounts: Account[]
  entries: Record<string, ProviderPlaylistsEntry>
  onStarted: (jobId: string) => void
}

export function TransferSetupForm({ accounts, entries, onStarted }: Props) {
  const [sourceProvider, setSourceProvider] = useState('')
  const [sourcePlaylistId, setSourcePlaylistId] = useState('')
  const [destProvider, setDestProvider] = useState('')
  const [destChoice, setDestChoice] = useState('') // a playlist id, CREATE_NEW, or '' (unset)
  const [destName, setDestName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const destProviderOptions = useMemo(() => accounts.filter((a) => a.id !== sourceProvider), [accounts, sourceProvider])

  // A source change invalidates a same-provider destination selection —
  // clear it rather than let a stale, now-hidden option linger.
  useEffect(() => {
    if (destProvider && destProvider === sourceProvider) {
      setDestProvider('')
      setDestChoice('')
    }
  }, [sourceProvider, destProvider])

  // Default "create new"'s name to the source playlist's name — re-derives
  // whenever the source playlist or the create-new choice changes, but a
  // manual edit in between sticks until one of those changes again.
  useEffect(() => {
    if (destChoice !== CREATE_NEW) return
    const sourcePlaylist = entries[sourceProvider]?.playlists.find((p) => p.id === sourcePlaylistId)
    if (sourcePlaylist) setDestName(sourcePlaylist.name)
  }, [destChoice, sourceProvider, sourcePlaylistId, entries])

  const sourcePlaylist = entries[sourceProvider]?.playlists.find((p) => p.id === sourcePlaylistId)
  const destPlaylist = destChoice !== CREATE_NEW ? entries[destProvider]?.playlists.find((p) => p.id === destChoice) : undefined

  const formValid = Boolean(
    sourceProvider && sourcePlaylistId && destProvider && destChoice && (destChoice !== CREATE_NEW || destName.trim()),
  )

  function playlistOptions(providerId: string) {
    const entry = entries[providerId]
    return [
      { value: '', label: entry?.loading ? 'Loading…' : 'Choose a playlist…' },
      ...(entry?.playlists.map((p) => ({ value: p.id, label: `${p.name} (${p.count} track${p.count === 1 ? '' : 's'})` })) ?? []),
    ]
  }

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      const body: StartTransferRequest = {
        source_provider: sourceProvider,
        source_playlist_id: sourcePlaylistId,
        dest_provider: destProvider,
        dest_playlist_id: destChoice === CREATE_NEW ? null : destChoice,
        dest_name: destChoice === CREATE_NEW ? destName.trim() : (destPlaylist?.name ?? ''),
      }
      const res = await api.startTransfer(body)
      setConfirming(false)
      onStarted(res.job_id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Set up a transfer</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          A one-time copy — existing tracks on the destination are kept, this only adds.
        </p>
      </div>

      {accounts.length < 2 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Connect at least 2 services on the Accounts page to copy a playlist between them.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="From (source)"
              options={[{ value: '', label: 'Choose a service…' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
              value={sourceProvider}
              onChange={(e) => {
                setSourceProvider(e.target.value)
                setSourcePlaylistId('')
              }}
            />
            <SelectField
              label="Source playlist"
              options={playlistOptions(sourceProvider)}
              value={sourcePlaylistId}
              disabled={!sourceProvider}
              onChange={(e) => setSourcePlaylistId(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="To (destination)"
              help={!sourceProvider ? 'Pick a source service first.' : undefined}
              options={[
                { value: '', label: 'Choose a service…' },
                ...destProviderOptions.map((a) => ({ value: a.id, label: a.name })),
              ]}
              value={destProvider}
              disabled={!sourceProvider}
              onChange={(e) => {
                setDestProvider(e.target.value)
                setDestChoice('')
              }}
            />
            <SelectField
              label="Destination playlist"
              options={[
                { value: '', label: 'Choose an option…' },
                { value: CREATE_NEW, label: '+ Create a new playlist' },
                ...(entries[destProvider]?.playlists.map((p) => ({ value: p.id, label: p.name })) ?? []),
              ]}
              value={destChoice}
              disabled={!destProvider}
              onChange={(e) => setDestChoice(e.target.value)}
            />
          </div>

          {destChoice === CREATE_NEW && (
            <TextField
              label="New playlist name"
              help="Defaults to the source playlist's name — feel free to change it."
              required
              value={destName}
              onChange={(e) => setDestName(e.target.value)}
            />
          )}

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div>
            <Button onClick={() => setConfirming(true)} disabled={!formValid}>
              Copy playlist
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title="Copy this playlist?"
        description={
          sourcePlaylist
            ? `"${sourcePlaylist.name}" will be copied from ${tagLabel(sourceProvider)} to ${
                destChoice === CREATE_NEW
                  ? `a new playlist named "${destName.trim()}"`
                  : `"${destPlaylist?.name ?? ''}"`
              } on ${tagLabel(destProvider)}. Existing tracks on the destination are kept — this only adds.`
            : 'This will start copying the selected playlist.'
        }
        confirmLabel="Copy playlist"
        loading={starting}
        onConfirm={() => void handleStart()}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  )
}
