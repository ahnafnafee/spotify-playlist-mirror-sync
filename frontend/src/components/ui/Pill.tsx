import { cn } from '@/lib/cn'

interface PillProps {
  /** A soft-bg + text-color pair, e.g. "bg-success-soft text-success" — the
   * one source of truth for the pill's tone. `ring-current` and the dot's
   * `bg-current` both pick it up from the text color, so a single class pair
   * defines the whole thing. */
  toneClasses: string
  label: string
  /** Animates the dot — for a genuinely in-progress state (e.g. a running
   * transfer), not a static one. */
  pulsing?: boolean
  className?: string
}

/** h-[26px] rounded-full · dot + word, ringed for chip definition against
 * its own soft background. The word always carries the state — color is
 * never the only signal — so a uniform dot reads cleaner than per-state
 * glyphs. Shared by StatusPill (accounts) and the transfer job pill; pills
 * never truncate, they wrap whole rather than clip. */
export function Pill({ toneClasses, label, pulsing, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold ring-1 ring-inset ring-current/15',
        toneClasses,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full bg-current', pulsing && 'animate-pulse')} aria-hidden="true" />
      {label}
    </span>
  )
}
