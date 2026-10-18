'use client'

import { useEffect, useRef, useState } from 'react'
import type { HiddenInterest, NegotiationState, Scenario } from '@/lib/types'
import { adaptationLevel, adaptationTargets, type Adaptation } from '@/lib/engine/adaptive'
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
          className={`block h-2 rounded-[3px] ${overlay ? 'redact-bar bg-ink-faint' : 'bg-line-strong'}`}
          style={{ width: `${w}%`, animationDelay: overlay ? `${i * 90}ms` : undefined }}
        />
      ))}
    </span>
  )
}

/** Шкала идёт дугой снизу слева направо, внизу остаётся зазор, как у прибора. */
const SWEEP_FROM = -130
const SEGMENT = 52

/**
 * Настрой второй стороны — пять делений вокруг портрета. Заполнено столько,
 * сколько ступеней настроя пройдено от раздражения, цвет — по текущей ступени.
 */
function MoodGauge({
  band,
  size,
  gap,
  stroke,
  halo,
  empty = false,
  children,
}: {
  band: ReturnType<typeof moodBand>
  /** До входа в переговоры шкала пустая и заполняется на глазах. */
  empty?: boolean
  size: number
  gap: number
  stroke: number
  halo: number
  children: React.ReactNode
}) {
  const filled = empty ? 0 : MOOD_BANDS.indexOf(band) + 1
  const r = size / 2 + gap + stroke / 2
  const outer = r + stroke / 2 + halo
  const box = outer * 2
  const c = outer
  const spacing = (stroke / r) * (180 / Math.PI) + 7
  const point = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`
  }
  return (
    <span className="relative block shrink-0" style={{ width: box, height: box }}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden className="absolute inset-0">
        {halo > 0 && <circle cx={c} cy={c} r={outer} className="mood-halo" />}
        {MOOD_BANDS.map((b, i) => {
          const from = SWEEP_FROM + i * SEGMENT + spacing / 2
          const to = SWEEP_FROM + (i + 1) * SEGMENT - spacing / 2
          return (
            <path
              key={b}
              d={`M ${point(from)} A ${r} ${r} 0 0 1 ${point(to)}`}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              className="mood-seg"
              data-on={i < filled || undefined}
              style={{ transitionDelay: `${i * 50}ms` }}
            />
          )
        })}
      </svg>
      <span className="enter-portrait absolute" style={{ inset: outer - size / 2 }}>
        {children}
      </span>
    </span>
  )
}

type Verdict = 'accept' | 'counter' | 'reject'

/** Решение по пакету: цвет, знак и слово. Само решение уже принял движок. */
const VERDICT: Record<Verdict, { title: string; tone: string }> = {
  accept: { title: 'Согласие', tone: 'bg-accent text-white' },
  counter: { title: 'Встречное предложение', tone: 'bg-ink text-white' },
  reject: { title: 'Отказ', tone: 'bg-danger text-white' },
}

function VerdictGlyph({ verdict }: { verdict: Verdict }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {verdict === 'accept' && <path d="M5 12.5l4.5 4.5L19 7.5" />}
      {verdict === 'counter' && <path d="M7 7h11l-3-3M17 17H6l3 3" />}
      {verdict === 'reject' && <path d="M7 7l10 10M17 7L7 17" />}
    </svg>
  )
}

const LEVEL_DOTS: Record<ReturnType<typeof adaptationLevel>, number> = { нет: 0, заметно: 1, ощутимо: 2, жёстко: 3 }

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
  adaptation,
}: {
  scenario: Scenario
  state: NegotiationState
  animate: boolean
  adaptation: Adaptation
}) {
  const band = moodBand(state)
  const cards = xrayCards(scenario, state)
  const opened = cards.filter((c) => c.open).length

  const [fresh, setFresh] = useState<string[]>([])
  const [detail, setDetail] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<{ v: Verdict; key: number } | null>(null)
  // Вход в переговоры: шкала настроя заполняется после того, как сцена собралась.
  const [entered, setEntered] = useState(false)
  const seen = useRef(state.revealedInterests)
  const turns = useRef(state.transcript.length)
  // Таймеры живут отдельно от эффекта: следующий ход меняет состояние раньше,
  // чем плашка успевает уйти, и сброс в эффекте оставил бы её висеть.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 180)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const added = state.revealedInterests.filter((id) => !seen.current.includes(id))
    seen.current = state.revealedInterests
    if (!animate || added.length === 0) return
    timers.current.forEach(clearTimeout)
    setFresh(added)
    timers.current = [setTimeout(() => setFresh([]), 1100)]
  }, [state.revealedInterests, animate])

  // Ответ на пакет: вердикт лежит в ходе игрока перед новой репликой.
  useEffect(() => {
    const grew = state.transcript.length > turns.current
    turns.current = state.transcript.length
    if (!animate || !grew) return
    const last = state.transcript[state.transcript.length - 1]
    const asked = state.transcript[state.transcript.length - 2]
    if (last?.role !== 'opponent' || asked?.role !== 'user' || !asked.verdict) return
    setVerdict({ v: asked.verdict, key: last.index })
    timers.current.push(setTimeout(() => setVerdict(null), 3000))
  }, [state.transcript, animate])

  // После возврата к прошлому раунду раскрытая подробность могла снова закрыться.
  useEffect(() => {
    if (detail && !state.revealedInterests.includes(detail)) setDetail(null)
  }, [detail, state.revealedInterests])

  const lastFresh = scenario.hiddenInterests.find((h) => h.id === fresh[fresh.length - 1])
  const freshLabel = lastFresh ? `Раскрыто: ${LAYER_LABEL[lastFresh.layer].toLowerCase()}` : null
  const remembered = adaptationTargets(adaptation)
  const level = adaptationLevel(adaptation)

  // Что вторая сторона вынесла из прошлых сессий. Главная привычка словами,
  // сила подстройки — точками.
  const memory = (wrap: boolean) => remembered.length > 0 && (
    <span
      title={`Играет жёстче: ${level}`}
      className={`memory-in inline-flex min-w-0 max-w-full gap-2 bg-warn-soft px-3 py-1 text-caption text-warn ${
        wrap ? 'items-start rounded-md py-1.5 leading-snug' : 'items-center rounded-full'
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" />
      </svg>
      <span className={`min-w-0 ${wrap ? '' : 'truncate'}`}>
        <span className="font-semibold">Помнит:</span> {remembered[0].cause}
      </span>
      <span aria-label={`Играет жёстче: ${level}`} className={`flex shrink-0 gap-[3px] ${wrap ? 'mt-[5px] ml-auto' : ''}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-[5px] w-[5px] rounded-full ${i < LEVEL_DOTS[level] ? 'bg-warn' : 'bg-warn/25'}`} />
        ))}
      </span>
    </span>
  )
  const detailCard = cards.find((c): c is Extract<XrayCard, { open: true }> => c.open && c.id === detail)

  const wideCard = (c: XrayCard, index: number) => (
    <div
      key={c.id}
      title={c.open ? c.text : undefined}
      style={{ animationDelay: `${260 + index * 70}ms` }}
      className={`enter-card h-[104px] rounded-lg px-3.5 py-3 transition-[background-color,box-shadow] duration-300 ${
        c.open
          ? 'bg-surface shadow-[inset_0_0_0_1px_var(--color-accent-line),0_10px_26px_-14px_rgba(30,92,65,0.5)]'
          : 'bg-paper/80 shadow-[inset_0_0_0_1px_var(--color-line2)]'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-caption font-semibold ${c.open ? 'text-accent' : 'text-ink3'}`}>
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
      {/* Сцена окрашена настроем второй стороны: атмосферу видно, не читая подписей. */}
      <span aria-hidden className="stage-glow pointer-events-none absolute inset-0" />
      {/* Широкий экран: лицом к лицу, по две карты с каждой стороны. */}
      <div className="relative hidden px-8 pb-5 pt-4 stage:block">
        <div className="mb-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
          <span className="lbl">Что скрывает</span>
          <span className="flex min-w-0 justify-center">{memory(false)}</span>
          <span className="num text-caption text-ink3">раскрыто {opened} из {cards.length}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_176px_minmax(0,1fr)] items-center gap-5">
          <div className="grid gap-2">{cards.slice(0, 2).map((c, i) => wideCard(c, i))}</div>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <MoodGauge band={band} size={104} gap={4} stroke={5} halo={6} empty={!entered}>
              <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={104} />
            </MoodGauge>
            <span className="flex flex-col">
              <span className="text-body font-semibold leading-tight">{scenario.persona.name}</span>
              <span className="text-caption text-ink3">{scenario.persona.role}</span>
            </span>
            {chip}
          </div>
          <div className="grid gap-2">{cards.slice(2).map((c, i) => wideCard(c, i + 2))}</div>
        </div>
      </div>

      {/* Узкий или невысокий экран: строка и четыре карты в ряд. */}
      <div className="relative flex flex-col gap-2.5 px-4 py-3 stage:hidden lg:px-10">
        <div className="flex items-center gap-3">
          <MoodGauge band={band} size={42} gap={3} stroke={3} halo={0} empty={!entered}>
            <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={42} />
          </MoodGauge>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-small font-semibold leading-tight">{scenario.persona.name}</span>
            <span className="truncate text-caption text-ink3">{scenario.persona.role}</span>
          </span>
          <span className="ml-auto flex shrink-0">{chip}</span>
        </div>
        <div className="enter-card grid grid-cols-4 gap-1.5" style={{ animationDelay: '220ms' }}>
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
                className="flex h-12 min-w-0 flex-col items-center justify-center gap-[3px] rounded-md bg-paper/80 px-0.5 text-label font-semibold leading-none text-ink3 shadow-[inset_0_0_0_1px_var(--color-line2)] sm:text-caption"
              >
                <span className="text-ink3"><LayerGlyph kind={c.kind} size={13} /></span>
                <span className="max-w-full truncate">{c.layer}</span>
                <span aria-hidden className="h-1 w-7 rounded-full bg-line-strong" />
                <span className="sr-only">, не раскрыто</span>
              </div>
            ),
          )}
        </div>
        {remembered.length > 0 && <span className="flex min-w-0">{memory(true)}</span>}
        {detailCard && (
          <p className="rise rounded-md bg-accent-soft px-3 py-2 text-small leading-snug text-ink">
            {detailCard.text}
          </p>
        )}
      </div>

      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-[70%] justify-center px-4">
        {verdict && (
          <span
            key={verdict.key}
            className="verdict-in relative flex items-center gap-3 overflow-hidden rounded-lg bg-surface/90 py-2.5 pl-2.5 pr-5 shadow-[0_0_0_1px_rgba(26,28,25,0.06),0_14px_36px_-12px_rgba(26,28,25,0.32)] backdrop-blur-md"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${VERDICT[verdict.v].tone}`}>
              <VerdictGlyph verdict={verdict.v} />
            </span>
            <span className="flex flex-col">
              <span className="text-lead font-semibold leading-tight">{VERDICT[verdict.v].title}</span>
              <span className="text-caption text-ink3">посчитано алгоритмом</span>
            </span>
            <span aria-hidden className="verdict-timer absolute inset-x-0 bottom-0 h-[2px] bg-line-strong" />
          </span>
        )}
        {freshLabel && <span className="sr-only">{freshLabel}</span>}
      </div>
    </section>
  )
}
