import { SiApplemusic, SiJellyfin, SiSpotify, SiYoutubemusic } from 'react-icons/si'

export type ServiceId = 'spotify' | 'apple' | 'ytmusic' | 'jellyfin'

interface ServiceLogoProps {
  service: ServiceId
  className?: string
}

/** Official Simple Icons brand marks — monochrome (`currentColor`), so
 * callers tint them with the service's own identity color (the `text-svc-*`
 * classes via `tagText()`) rather than a hardcoded fill. Every call site
 * already sits next to the service's name as visible text, so the mark
 * itself is decorative (`aria-hidden`) rather than a redundant announcement.
 * Size via `className` (e.g. `size-4`). */
export function ServiceLogo({ service, className }: ServiceLogoProps) {
  switch (service) {
    case 'spotify':
      return <SiSpotify className={className} aria-hidden="true" />
    case 'apple':
      return <SiApplemusic className={className} aria-hidden="true" />
    case 'ytmusic':
      return <SiYoutubemusic className={className} aria-hidden="true" />
    case 'jellyfin':
      return <SiJellyfin className={className} aria-hidden="true" />
  }
}
