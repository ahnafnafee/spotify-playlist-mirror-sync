import { ACCOUNT_STATE_STYLES } from '@/lib/constants'
import type { AccountState } from '@/types'

import { Pill } from './Pill'

/** An account's connection state, via the shared Pill primitive. */
export function StatusPill({ state, className }: { state: AccountState; className?: string }) {
  const style = ACCOUNT_STATE_STYLES[state]
  return <Pill toneClasses={style.badge} label={style.label} className={className} />
}
