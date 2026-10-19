import type { CSSProperties, Ref } from 'react'
import { VOICE_BARS } from '@/lib/voice'

/** Полоски уровня голоса. Высоту каждой пишет хук записи, сюда — только разметка. */
export function VoiceMeter({ ref, busy, className = '' }: { ref: Ref<HTMLDivElement>; busy: boolean; className?: string }) {
  return (
    <div ref={ref} aria-hidden className={`voice-meter ${busy ? 'is-busy' : ''} ${className}`}>
      {Array.from({ length: VOICE_BARS }, (_, i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  )
}

export function IconMic({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
    </svg>
  )
}

export function IconStop({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  )
}
