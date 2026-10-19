'use client'

import { useEffect, useState } from 'react'
import { Mark } from './Mark'

const KEY = 'arena.intro.v1'

/**
 * Заставка при первом открытии вкладки: знак рисует границу возможного,
 * на неё садится точка сделки, проявляется название — и экран открывается.
 * Скрипт внутри прячет её до первой отрисовки, если она уже была показана
 * или включено «уменьшить движение», чтобы холл не мигал при возврате.
 */
const HIDE_IF_SEEN = `try{if(sessionStorage.getItem('${KEY}')||matchMedia('(prefers-reduced-motion: reduce)').matches){document.currentScript.parentElement.style.display='none'}}catch(e){}`

export function Intro() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show')

  useEffect(() => {
    let seen = false
    try {
      seen = !!sessionStorage.getItem(KEY) || matchMedia('(prefers-reduced-motion: reduce)').matches
      sessionStorage.setItem(KEY, '1')
    } catch {}
    if (seen) {
      setPhase('gone')
      return
    }
    const leave = setTimeout(() => setPhase('leave'), 1050)
    const gone = setTimeout(() => setPhase('gone'), 1400)
    return () => {
      clearTimeout(leave)
      clearTimeout(gone)
    }
  }, [])

  if (phase === 'gone') return null

  return (
    <div
      className={`intro${phase === 'leave' ? ' intro-leave' : ''}`}
      onClick={() => setPhase('gone')}
      aria-hidden
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: HIDE_IF_SEEN }} />
      <div className="intro-lockup">
        <Mark size={72} animate />
        <span className="intro-word">Арена</span>
      </div>
    </div>
  )
}
