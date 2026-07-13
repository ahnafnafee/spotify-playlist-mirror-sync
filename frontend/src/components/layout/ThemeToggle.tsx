import { LuMoon, LuSun } from 'react-icons/lu'

import { useDarkMode } from '@/hooks/useDarkMode'

import { Toggle } from '../ui/Toggle'

interface ThemeToggleProps {
  /** "icon" — the compact chip used in the sidebar footer (>=lg only). "row"
   * — a full Toggle row used inside the mobile drawer, reachable one-handed. */
  variant?: 'icon' | 'row'
}

export function ThemeToggle({ variant = 'icon' }: ThemeToggleProps) {
  const [dark, toggle] = useDarkMode()

  if (variant === 'row') {
    return <Toggle checked={dark} onChange={toggle} label="Dark theme" />
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 text-text-2 transition-colors duration-fast hover:text-text"
    >
      {dark ? <LuSun className="size-4" aria-hidden="true" /> : <LuMoon className="size-4" aria-hidden="true" />}
    </button>
  )
}
