'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** Свёрнутый факт — три строки по 18 px. */
const CLAMP = 54

/**
 * Факт в левой колонке. Свёрнут до трёх строк и раскрывается на месте;
 * приложить его к ответу — отдельная кнопка, чтобы чтение не меняло ход.
 */
export function FactRow({
  text,
  used,
  armed,
  disabled,
  onToggle,
}: {
  text: string
  used: boolean
  armed: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(true)
  const body = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  useLayoutEffect(() => {
    const el = body.current
    if (el) setLong(el.scrollHeight > CLAMP + 2)
  }, [text])

  const clamped = long && !open

  return (
    <div
      className={`rounded-md border px-3 pb-2.5 pt-[9px] transition-[background-color,border-color,opacity] duration-200 ${
        used
          ? 'border-line2 bg-transparent opacity-55'
          : armed
            ? 'border-accent bg-accent-soft'
            : 'border-line bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={() => long && setOpen((o) => !o)}
        aria-expanded={long ? open : undefined}
        className={`relative block w-full text-left ${long ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <motion.div
          initial={false}
          animate={{ height: clamped ? CLAMP : 'auto' }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
          className={`overflow-hidden ${clamped ? 'fact-fade' : ''}`}
        >
          <div ref={body} className={`text-small leading-[18px] ${used ? 'text-ink3' : 'text-ink'}`}>
            {text}
          </div>
        </motion.div>
      </button>

      <div className="mt-1 flex items-center justify-between gap-2">
        {used ? (
          <span className="flex items-center gap-1.5 text-caption text-ink3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            уже использован
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-pressed={armed}
            className={`press -mx-1 flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-sm px-1 text-caption font-semibold disabled:opacity-40 md:min-h-7 ${
              armed ? 'text-accent' : 'text-ink2 hover:text-accent'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20.5 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.6-8.6a3.4 3.4 0 014.8 4.8l-8.4 8.4a1.7 1.7 0 01-2.4-2.4l7.7-7.7" />
            </svg>
            {armed ? 'приложен к ответу' : 'Приложить к ответу'}
          </button>
        )}
        {long && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-hidden
            tabIndex={-1}
            className="flex h-11 w-8 items-center justify-center text-ink3 hover:text-ink2 md:h-7 md:w-6"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
