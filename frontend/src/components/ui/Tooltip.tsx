import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** CSS-only hover/focus tooltip. The bubble is `display: none` until shown
 * (never `opacity`), so it contributes nothing to layout or overflow while
 * hidden; it appears for mouse hover and keyboard focus alike. Anchored above
 * the trigger and right-aligned, so a trigger near a row's right edge keeps
 * the bubble inside the panel. */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden w-64 rounded-control border border-border bg-surface px-3.5 py-2.5 text-[12px] leading-relaxed text-text-2 shadow-lg group-hover/tip:block group-focus-within/tip:block"
      >
        {content}
      </span>
    </span>
  )
}
