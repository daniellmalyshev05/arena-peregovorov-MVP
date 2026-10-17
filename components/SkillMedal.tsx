'use client'

import type { SkillStatus } from '@/lib/profile'

/** Знак навыка: поиск, обмен, документ, человек, выход. */
function SkillGlyph({ id, size }: { id: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {id === 'discovery' && (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.6-4.6" />
        </>
      )}
      {id === 'exchange' && <path d="M7 7h11l-3-3M17 17H6l3 3" />}
      {id === 'criteria' && <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />}
      {id === 'model' && (
        <>
          <circle cx="12" cy="9" r="3.5" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </>
      )}
      {id === 'walkaway' && <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4" />}
    </svg>
  )
}

/**
 * Медаль навыка. Освоен — закрашена, в работе — заполнена наполовину,
 * не проверен — пунктир. Порог освоения считает профиль, здесь только вид.
 *
 * `fresh` — навык освоен именно этой сессией: медаль коротко вспыхивает.
 */
export function SkillMedal({
  id,
  status,
  size = 40,
  fresh = false,
}: {
  id: string
  status: SkillStatus
  size?: number
  fresh?: boolean
}) {
  const r = size / 2 - 1.5
  const c = 2 * Math.PI * r
  const glyph = Math.round(size * 0.45)

  if (status === 'mastered') {
    return (
      <span
        className={`relative flex shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_0_2px_var(--color-surface),0_0_0_3.5px_var(--color-accent-line)] ${fresh ? 'medal-fresh' : ''}`}
        style={{ width: size, height: size }}
      >
        <SkillGlyph id={id} size={glyph} />
      </span>
    )
  }

  const partial = status === 'learning' || status === 'seen'
  return (
    <span className="relative flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="var(--color-surface)"
          stroke="var(--color-line-strong)"
          strokeWidth="1.5"
          strokeDasharray={partial ? undefined : '3 3'}
        />
        {partial && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${c / 2} ${c}`} />
        )}
      </svg>
      <span className={`relative ${partial ? 'text-accent' : 'text-ink-faint'}`}>
        <SkillGlyph id={id} size={glyph} />
      </span>
    </span>
  )
}
