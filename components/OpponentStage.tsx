'use client'

import { useEffect, useRef, useState } from 'react'
import type { HiddenInterest, NegotiationState, Scenario } from '@/lib/types'
import { LAYER_LABEL, MOOD_BANDS, MOOD_LABEL, moodBand, xrayCards, type XrayCard } from '@/lib/stage'
import { Portrait } from './Portrait'

/** Знак слоя: интерес — цель, ограничение — рамка, опасение — щит, ресурс — ключ. */
function LayerGlyph({ kind, size = 14 }: { kind: HiddenInterest['layer']; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      {kind === 'interest' && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.8" fill="currentColor" />
        </>
      )}
      {kind === 'constraint' && <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />}
      {kind === 'fear' && <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />}
      {kind === 'resource' && (
        <>
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
        </>
      )}
    </svg>
  )
}

/**
 * Ширины плашек на закрытой карте. Рисунок свой у каждой позиции и не зависит
 * от текста: по длине плашек нельзя угадать, что под ними.
 */
const REDACTION = [
  [94, 80, 56],
  [88, 96, 44],
  [100, 72, 60],
  [84, 92, 38],
]

function Redaction({ index, overlay = false }: { index: number; overlay?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex flex-col gap-[10px] ${overlay ? 'pointer-events-none absolute inset-x-0 top-[5px]' : 'pt-[5px]'}`}
    >
      {REDACTION[index % REDACTION.length].map((w, i) => (
        <span
          key={i}
          className={`block h-2 rounded-[3px] bg-ink2 ${overlay ? 'redact-bar' : ''}`}
          style={{ width: `${w}%`, animationDelay: overlay ? `${i * 90}ms` : undefined }}
        />
      ))}
    </span>
  )
}

/**
 * Вторая сторона над лентой: портрет, настрой и то, что она скрывает. На
 * широком экране — сцена «лицом к лицу», на узком — строка.
 *
 * `animate` выключается, когда партия поднята из хранилища: восстановленные
 * карты не должны раскрываться заново.
 */
export function OpponentStage({
  scenario,
  state,
  animate,
}: {
  scenario: Scenario
  state: NegotiationState
  animate: boolean
}) {
  const band = moodBand(state)
  const cards = xrayCards(scenario, state)
  const opened = cards.filter((c) => c.open).length

  const [fresh, setFresh] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [pulse, setPulse] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const seen = useRef(state.revealedInterests)
  const lastBand = useRef(band)
  // Таймеры живут отдельно от эффекта: следующий ход меняет состояние раньше,
  // чем плашка успевает уйти, и сброс в эффекте оставил бы её висеть.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    const added = state.revealedInterests.filter((id) => !seen.current.includes(id))
    seen.current = state.revealedInterests
    if (!animate || added.length === 0) return
    timers.current.forEach(clearTimeout)
    setFresh(added)
    const last = scenario.hiddenInterests.find((h) => h.id === added[added.length - 1])
    if (last) setToast(`Раскрыто: ${LAYER_LABEL[last.layer].toLowerCase()}`)
    timers.current = [setTimeout(() => setFresh([]), 1100), setTimeout(() => setToast(null), 2600)]
  }, [state.revealedInterests, animate, scenario.hiddenInterests])

  useEffect(() => {
    if (lastBand.current === band) return
    lastBand.current = band
    if (!animate) return
    setPulse(true)
    timers.current.push(setTimeout(() => setPulse(false), 420))
  }, [band, animate])

  // После возврата к прошлому раунду раскрытая подробность могла снова закрыться.
  useEffect(() => {
    if (detail && !state.revealedInterests.includes(detail)) setDetail(null)
  }, [detail, state.revealedInterests])

  const ring = `stage-ring${pulse ? ' mood-pulse' : ''}`
  const detailCard = cards.find((c): c is Extract<XrayCard, { open: true }> => c.open && c.id === detail)

  const wideCard = (c: XrayCard, index: number) => (
    <div
      key={c.id}
      title={c.open ? c.text : undefined}
      className={`h-[104px] rounded-lg px-3.5 py-3 transition-[background-color,box-shadow] duration-300 ${
        c.open
          ? 'bg-surface shadow-[inset_0_0_0_1px_var(--color-accent-line),0_8px_22px_-14px_rgba(30,92,65,0.45)]'
          : 'bg-rail'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-caption font-semibold ${c.open ? 'text-accent' : 'text-ink2'}`}>
        <LayerGlyph kind={c.kind} />
        {c.layer}
        {!c.open && <span className="sr-only">, не раскрыто</span>}
      </span>
      <span className="relative mt-1.5 block">
        {c.open ? (
          <>
            <span className={`line-clamp-3 text-small leading-[18px] text-ink ${fresh.includes(c.id) ? 'redact-text' : ''}`}>
              {c.text}
            </span>
            {fresh.includes(c.id) && <Redaction index={index} overlay />}
          </>
        ) : (
          <Redaction index={index} />
        )}
      </span>
    </div>
  )

  const meter = (
    <span aria-hidden className="flex gap-[3px]">
      {MOOD_BANDS.map((b) => (
        <span
          key={b}
          className={`h-[5px] w-4 rounded-full transition-colors duration-300 ${b === band ? 'bg-[var(--mood)]' : 'bg-line'}`}
        />
      ))}
    </span>
  )

  const chip = (
    <span className="stage-chip whitespace-nowrap rounded-full px-2.5 py-[3px] text-caption font-semibold">
      {MOOD_LABEL[band]}
    </span>
  )

  return (
    <section
      aria-label={`${scenario.persona.name}, ${scenario.persona.role}`}
      className={`mood-${band} relative shrink-0 border-b border-line bg-surface`}
    >
      {/* Широкий экран: лицом к лицу, по две карты с каждой стороны. */}
      <div className="hidden px-8 pb-5 pt-4 stage:block">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="lbl">Что скрывает</span>
          <span className="num text-caption text-ink3">раскрыто {opened} из {cards.length}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_176px_minmax(0,1fr)] items-center gap-5">
          <div className="grid gap-2">{cards.slice(0, 2).map((c, i) => wideCard(c, i))}</div>
          <div className="flex flex-col items-center gap-2 text-center">
            <span className={`${ring} block rounded-full`}>
              <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={108} />
            </span>
            <span className="mt-1.5 flex flex-col">
              <span className="text-body font-semibold leading-tight">{scenario.persona.name}</span>
              <span className="text-caption text-ink3">{scenario.persona.role}</span>
            </span>
            {chip}
            {meter}
          </div>
          <div className="grid gap-2">{cards.slice(2).map((c, i) => wideCard(c, i + 2))}</div>
        </div>
      </div>

      {/* Узкий или невысокий экран: строка и четыре карты в ряд. */}
      <div className="flex flex-col gap-2.5 px-4 py-3 stage:hidden lg:px-10">
        <div className="flex items-center gap-3">
          <span className={`${ring} stage-ring-sm block rounded-full`}>
            <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={44} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-small font-semibold leading-tight">{scenario.persona.name}</span>
            <span className="truncate text-caption text-ink3">{scenario.persona.role}</span>
          </span>
          <span className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
            {chip}
            <span className="hidden sm:flex">{meter}</span>
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {cards.map((c) =>
            c.open ? (
              <button
                key={c.id}
                type="button"
                onClick={() => setDetail(detail === c.id ? null : c.id)}
                aria-expanded={detail === c.id}
                className={`press flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md bg-surface px-0.5 text-label font-semibold leading-none text-accent sm:text-caption ${
                  detail === c.id
                    ? 'shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
                    : 'shadow-[inset_0_0_0_1px_var(--color-accent-line)]'
                } ${fresh.includes(c.id) ? 'rise' : ''}`}
              >
                <LayerGlyph kind={c.kind} size={13} />
                <span className="max-w-full truncate">{c.layer}</span>
              </button>
            ) : (
              <div
                key={c.id}
                className="flex h-12 min-w-0 flex-col items-center justify-center gap-[3px] rounded-md bg-rail px-0.5 text-label font-semibold leading-none text-ink2 sm:text-caption"
              >
                <span className="text-ink3"><LayerGlyph kind={c.kind} size={13} /></span>
                <span className="max-w-full truncate">{c.layer}</span>
                <span aria-hidden className="h-1 w-7 rounded-full bg-ink-faint" />
                <span className="sr-only">, не раскрыто</span>
              </div>
            ),
          )}
        </div>
        {detailCard && (
          <p className="rise rounded-md bg-accent-soft px-3 py-2 text-small leading-snug text-ink">
            {detailCard.text}
          </p>
        )}
      </div>

      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 -bottom-4 z-10 flex justify-center">
        {toast && (
          <span className="rise rounded-full bg-accent px-3.5 py-1.5 text-caption font-semibold text-white shadow-[0_6px_20px_rgba(26,28,25,0.18)]">
            {toast}
          </span>
        )}
      </div>
    </section>
  )
}
