'use client'

import { useEffect, useState } from 'react'
import type { NegotiationState, Scenario } from '@/lib/types'
import type { ScoreReport } from '@/lib/engine/scoring'
import { momentContext, type RewindCandidate } from '@/lib/engine/rewind'
import { analyze } from '@/lib/engine/utility'
import { Portrait } from './Portrait'
import { ArenaMap } from './ArenaMap'
import type { RunRecord } from '@/lib/profile'

const STEPS = ['Что получилось', 'Где вы оказались', 'Где вы ошиблись', 'Что было скрыто', 'Что можно было иначе']

/** Балл набирается на глазах — это итог партии, а не просто число на экране. */
function useCountUp(value: number, duration = 900) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setShown(value)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // та же кривая, что у остального движения
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(value * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return shown
}

/** Полоски показателей вырастают из нуля после появления экрана. */
function useGrown(delay = 120) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setGrown(true), delay)
    return () => clearTimeout(id)
  }, [delay])
  return grown
}

/**
 * Разбор. Пять шагов, на каждом — ровно один вопрос.
 * Метрики есть, но они второй слой: первым идёт причина, а не цифры.
 */
export function Debrief({
  scenario,
  state,
  score,
  candidates,
  history,
  onRewind,
}: {
  scenario: Scenario
  state: NegotiationState
  score: ScoreReport
  candidates: RewindCandidate[]
  history: RunRecord[]
  onRewind: (turnIndex: number) => void
}) {
  const [step, setStep] = useState(0)

  // Стрелки на клавиатуре листают разбор — так же, как кнопки по бокам.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') setStep((v) => Math.max(0, v - 1))
      if (e.key === 'ArrowRight') setStep((v) => Math.min(STEPS.length - 1, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const economy = analyze(scenario, state.deal)
  const focus = score.rootCauseTurn ?? candidates[0]?.turnIndex
  const moment = focus !== undefined ? momentContext(state, focus) : undefined
  const userTurns = state.transcript.filter((t) => t.role === 'user')
  const total = useCountUp(score.total)
  const grown = useGrown()

  // Ключевой момент бывает и удачным — красный только там, где действительно ошибка.
  const momentBad = Boolean(
    moment?.turn &&
      (moment.turn.acts.includes('unilateral_concession') || moment.turn.acts.includes('personal_attack')),
  )
  const leftOnTableBad = economy.valueLeftOnTable > 8

  return (
    <main className="flex h-dvh flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:px-5">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <a href="/" aria-label="К списку сценариев" className="press shrink-0 rounded-sm p-1 text-ink2 hover:bg-line2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </a>
          <span className="font-semibold">Разбор</span>
          <span className="hidden text-ink3 xl:inline">·</span>
          <span className="hidden truncate text-small text-ink2 xl:inline">{scenario.title}</span>
        </div>
        <span className="num ml-auto shrink-0 text-small text-ink2">
          шаг {step + 1} из {STEPS.length}
        </span>
      </header>

      {/* Полоса шагов. Раньше переключение пряталось бледным текстом в шапке
          и его просто не находили — теперь это явная навигация с прогрессом. */}
      <nav aria-label="Шаги разбора" className="flex shrink-0 overflow-x-auto border-b border-line bg-surface">
        {STEPS.map((label, i) => {
          const done = i < step
          const current = i === step
          return (
            <button
              key={label}
              onClick={() => setStep(i)}
              aria-current={current ? 'step' : undefined}
              className={`press relative flex min-w-[124px] flex-1 items-center gap-2 px-2.5 py-2.5 text-left sm:min-w-[150px] sm:gap-2.5 sm:px-3 lg:px-4 ${
                current ? '' : 'hover:bg-line2/60'
              }`}
            >
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-[2px] ${done || current ? 'bg-accent' : 'bg-line2'}`}
              />
              <span
                className={`num flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-caption ${
                  current
                    ? 'border-accent bg-accent font-semibold text-white'
                    : done
                      ? 'border-accent-line text-accent'
                      : 'border-line text-ink3'
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`truncate text-small ${
                  current ? 'font-semibold text-ink' : done ? 'text-ink2' : 'text-ink3'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="relative min-h-0 flex-1">
        <button
          onClick={() => setStep((v) => Math.max(0, v - 1))}
          disabled={step === 0}
          aria-label="Предыдущий шаг"
          className="press absolute left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink2 shadow-sm transition-colors hover:border-accent-line hover:text-ink disabled:pointer-events-none disabled:opacity-0 xl:flex"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button
          onClick={() => setStep((v) => Math.min(STEPS.length - 1, v + 1))}
          disabled={step === STEPS.length - 1}
          aria-label="Следующий шаг"
          className="press absolute right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink2 shadow-sm transition-colors hover:border-accent-line hover:text-ink disabled:pointer-events-none disabled:opacity-0 xl:flex"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>

      <div className="h-full overflow-y-auto px-6 py-8 lg:px-14">
        {/* Шаг 1 */}
        {step === 0 && (
          <div className="mx-auto max-w-[1180px]">
            <div className="stagger">
              <div className="flex flex-wrap items-start justify-between gap-x-14 gap-y-6">
                <div className="max-w-[760px] flex-1">
                  <div className="lbl mb-3">Что получилось</div>
                  <h1 className="text-h1 font-semibold tracking-[-0.018em] text-balance">{score.headline}</h1>
                  <p className="mt-3.5 max-w-[660px] text-lead text-ink2 text-pretty">{score.rootCause}</p>
                  <button
                    onClick={() => setStep(1)}
                    className="press mt-7 flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
                  >
                    Где вы оказались
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
                <div className="shrink-0 text-right">
                  <div className="mono text-display font-semibold tracking-[-0.03em]">{total}</div>
                  <div className="lbl mt-1.5">из 100</div>
                </div>
              </div>

              <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-3.5 lg:grid-cols-2">
                {score.lines.map((l) => (
                  <div key={l.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-small">
                      <span>{l.label}</span>
                      <span className={`num whitespace-nowrap ${l.earned === 0 ? 'text-danger' : 'text-ink2'}`}>
                        {l.earned} / {l.max}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-line2">
                      <div
                        className="h-1 rounded-full bg-accent transition-[width] duration-700 ease-[cubic-bezier(0.2,0,0,1)]"
                        style={{ width: grown ? `${(l.earned / l.max) * 100}%` : '0%' }}
                      />
                    </div>
                    <p className="mt-1.5 text-caption leading-snug text-ink3">{l.detail}</p>
                  </div>
                ))}
              </div>

              {score.penalties.length > 0 && (
                <div className="mt-8 border-t border-line pt-4">
                  {score.penalties.map((p) => (
                    <div key={p.key} className="flex justify-between gap-3 py-1 text-small">
                      <span className="text-danger">{p.label}</span>
                      <span className="num font-semibold text-danger">−{p.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Шаг 2: карта арены */}
        {step === 1 && (
          <div className="rise mx-auto max-w-[1180px]">
            <div className="lbl mb-3">Где вы оказались</div>
            <h1 className="max-w-[760px] text-h2 font-semibold tracking-[-0.016em] text-balance">
              {economy.efficiency > 0.75
                ? 'Вы подошли близко к границе возможного'
                : economy.valueLeftOnTable > 8
                  ? 'До границы возможного вы не дошли'
                  : 'Все соглашения, которые были возможны в этом сценарии'}
            </h1>
            <p className="mt-2.5 max-w-[680px] text-body leading-relaxed text-ink2 text-pretty">
              Каждая точка — соглашение, которое было достижимо. Линия — граница возможного: двигаться
              по ней можно, только забирая ценность у второй стороны. Всё, что под линией, — ценность,
              которую не создал никто.
            </p>

            <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-lg border border-line bg-surface px-4 py-5 sm:px-6">
                <ArenaMap scenario={scenario} state={state} history={history} />
              </div>

              <div className="self-start rounded-lg border border-line bg-surface px-5 py-5 sm:px-[22px]">
                <div className="lbl mb-4">Что это значит</div>
                <div className="flex flex-col gap-4 text-small leading-snug">
                  <div>
                    <div className="lbl mb-1">Совместная ценность</div>
                    <span className="num text-title font-semibold">{(economy.efficiency * 100).toFixed(0)}%</span>
                    <span className="ml-1.5 text-ink3">от возможного</span>
                  </div>
                  <div>
                    <div className="lbl mb-1">Осталось на столе</div>
                    <span className={`num text-title font-semibold ${leftOnTableBad ? 'text-danger' : ''}`}>
                      {economy.valueLeftOnTable.toFixed(1)}
                    </span>
                    <span className="ml-1.5 text-ink3">пунктов ценности</span>
                  </div>
                  <p className="text-ink2">
                    {economy.paretoImprovementExisted
                      ? 'Существовал вариант, лучший одновременно для вас и для второй стороны. Это и есть цена нераскрытых интересов.'
                      : 'Улучшить результат, не забрав его у второй стороны, было уже нельзя.'}
                  </p>
                  <p className="text-caption leading-snug text-ink3">
                    В переговорной теории эту линию называют границей Парето.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="press mt-7 flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
            >
              Где вы ошиблись
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}

        {/* Шаг 3 */}
        {step === 2 && (
          <div className="rise mx-auto max-w-[1180px]">
            <div className="lbl mb-3">Где вы ошиблись</div>
            <h1 className="max-w-[760px] text-h2 font-semibold tracking-[-0.016em] text-balance">
              {moment?.turn ? 'Один ход изменил экономику сделки' : 'Переговоры прошли без резких поворотов'}
            </h1>

            {/* Таймлайн */}
            <div className="relative mt-9 h-14">
              <div className="absolute inset-x-0 top-[11px] h-[1.5px] bg-line" />
              {userTurns.map((t, i) => {
                const left = userTurns.length > 1 ? (i / (userTurns.length - 1)) * 96 + 2 : 50
                const bad = t.acts.includes('unilateral_concession') || t.acts.includes('personal_attack')
                const good = t.revealed.length > 0 || t.acts.includes('objective_criterion')
                const isFocus = t.index === focus
                return (
                  <div key={t.index} className="absolute top-[5px] flex flex-col items-center gap-2" style={{ left: `${left}%` }}>
                    <div
                      className={`rounded-full border-2 ${
                        bad
                          ? 'h-[19px] w-[19px] border-danger bg-danger-soft'
                          : good
                            ? 'h-[13px] w-[13px] border-accent bg-accent'
                            : 'h-[13px] w-[13px] border-line-strong bg-surface'
                      } ${isFocus ? (bad ? 'ring-4 ring-danger/15' : 'ring-4 ring-accent/15') : ''}`}
                    />
                    <span className={`num whitespace-nowrap text-label ${bad ? 'font-semibold text-danger' : good ? 'font-semibold text-accent' : 'text-ink3'}`}>
                      {bad ? 'уступка' : good ? 'находка' : i + 1}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Момент */}
            {moment?.turn && (
              <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
                <div className="rounded-lg border border-line bg-surface px-5 py-5 sm:px-6 sm:py-[22px]">
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className="num text-caption text-ink3">раунд {Math.floor(moment.turn.index / 2) + 1}</span>
                    <span className="h-1 w-1 rounded-full bg-line-strong" />
                    <span className={`text-caption font-semibold ${momentBad ? 'text-danger' : 'text-accent'}`}>
                      ключевой момент
                    </span>
                  </div>
                  <div className="flex flex-col gap-3.5">
                    {moment.before && (
                      <div>
                        <div className="mb-1 flex items-center gap-2 text-caption text-ink3">
                          <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={20} />
                          {scenario.persona.name}
                        </div>
                        <div className="leading-relaxed text-ink2">{moment.before.text}</div>
                      </div>
                    )}
                    <div>
                      <div className="mb-1 text-caption text-ink3">Вы</div>
                      <div className="border-l-2 border-line pl-3.5 leading-relaxed">{moment.turn.text}</div>
                    </div>
                    {moment.after && (
                      <div>
                        <div className="mb-1 text-caption text-ink3">{scenario.persona.name}</div>
                        <div className="leading-relaxed text-ink2">{moment.after.text}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="self-start rounded-lg border border-line bg-surface px-5 py-5 sm:px-[22px]">
                  <div className="lbl mb-4">Что это стоило</div>
                  <div className="flex flex-col gap-3 text-small leading-snug">
                    <div>
                      <div className="lbl mb-1">Совместная ценность</div>
                      использована на <span className="num font-semibold">{(economy.efficiency * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <div className="lbl mb-1">Осталось на столе</div>
                      <span className={`num font-semibold ${leftOnTableBad ? 'text-danger' : ''}`}>
                        {economy.valueLeftOnTable.toFixed(1)}
                      </span>{' '}
                      пунктов ценности
                    </div>
                    <div>
                      <div className="lbl mb-1">Дисциплина уступок</div>
                      условных обменов <span className="num font-semibold">{state.conditionalOffers}</span>, уступок без встречного
                      условия{' '}
                      <span className={`num font-semibold ${state.unilateralConcessions > 0 ? 'text-danger' : ''}`}>
                        {state.unilateralConcessions}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              className="press mt-7 flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
            >
              Что было скрыто
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}

        {/* Шаг 4 */}
        {step === 3 && (
          <div className="rise mx-auto grid max-w-[1180px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-11 xl:grid-cols-[minmax(0,1fr)_456px]">
            <div className="min-w-0">
              <div className="lbl mb-3">Что было скрыто</div>
              <h1 className="text-h2 font-semibold tracking-[-0.016em] text-balance">
                Насколько точно вы понимали вторую сторону
              </h1>
              <p className="mt-2.5 max-w-[620px] text-body leading-relaxed text-ink2 text-pretty">
                По ходу разговора вы оценили {state.hypotheses.length} из {scenario.beliefProbes.length} утверждений
                о второй стороне. Часть из них — ловушки.
              </p>

              <div className="mt-6">
                {scenario.beliefProbes.map((probe) => {
                  const given = state.hypotheses.find((h) => h.id === probe.id)?.confidence
                  const truth = probe.truth ? 1 : 0
                  const wrong = given !== undefined && Math.abs(given - truth) > 0.5
                  const right = given !== undefined && Math.abs(given - truth) < 0.3
                  return (
                    <div
                      key={probe.id}
                      className={`flex items-start gap-4 border-t border-line py-[15px] ${wrong ? '-mx-3.5 rounded-sm bg-danger-soft px-3.5' : ''}`}
                    >
                      <span className="shrink-0 pt-0.5">
                        {right ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        ) : wrong ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink3)" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 17h.01" /></svg>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 text-body leading-snug">{probe.text}</div>
                        <div className="text-small leading-normal text-ink2">{probe.reality}</div>
                      </div>
                      <div className="w-[96px] shrink-0 text-right">
                        <div className={`num text-small font-semibold ${right ? 'text-accent' : wrong ? 'text-danger' : 'text-ink2'}`}>
                          {given === undefined ? '—' : `${Math.round(given * 100)}%`}
                        </div>
                        <div className="mt-px text-label text-ink3">{given === undefined ? 'не оценили' : 'ваша оценка'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface px-4 py-3.5">
                <div className="min-w-[260px] flex-1">
                  <div className="lbl mb-1">Точность модели</div>
                  <div className="text-small leading-snug text-ink2">
                    Учитываются и ошибки уверенности, и утверждения, которые вы не стали оценивать.
                    Метрика — оценка Брайера.
                  </div>
                </div>
                <div className="num ml-auto whitespace-nowrap text-right">
                  <span className="text-h2 font-semibold">
                    {score.lines.find((l) => l.key === 'calibration')?.earned.toFixed(1)}
                  </span>
                  <div className="mt-0.5 text-label text-ink3">из 15 баллов</div>
                </div>
              </div>

              <button
                onClick={() => setStep(4)}
                className="press mt-7 flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
              >
                Что можно было иначе
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>

            {/* Слои оппонента */}
            <div className="self-start rounded-lg border border-line bg-surface px-5 py-5 sm:px-[26px] sm:py-6">
              <div className="mb-2 flex items-center gap-3">
                <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={40} />
                <div className="min-w-0">
                  <div className="font-semibold">{scenario.persona.name}</div>
                  <div className="text-caption text-ink3">{scenario.persona.role} · {scenario.persona.company}</div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-4">
                <div className="flex gap-3.5">
                  <div className="w-1 shrink-0 rounded-full bg-line-strong" />
                  <div>
                    <div className="lbl mb-1">Позиция — что говорил вслух</div>
                    <div className="leading-snug">{scenario.persona.openingPosition}</div>
                  </div>
                </div>
                {scenario.hiddenInterests.map((h) => {
                  const found = state.revealedInterests.includes(h.id)
                  const layerName = { interest: 'Интерес', constraint: 'Ограничение', fear: 'Страх', resource: 'Ресурс' }[h.layer]
                  return (
                    <div key={h.id} className="flex gap-3.5">
                      <div className={`w-1 shrink-0 rounded-full ${found ? 'bg-accent' : 'bg-line-strong'}`} />
                      <div>
                        <div className={`lbl mb-1 ${found ? 'text-accent' : ''}`}>
                          {layerName} {!found && '· не найдено'}
                        </div>
                        <div className={`leading-snug ${found ? '' : 'text-ink2'}`}>{h.label}</div>
                      </div>
                    </div>
                  )
                })}
                <div className="flex gap-3.5">
                  <div className="w-1 shrink-0 rounded-full bg-danger" />
                  <div>
                    <div className="lbl mb-1 text-danger">Запасной вариант второй стороны</div>
                    <div className="leading-snug">{scenario.opponentBatna.label}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Шаг 5 */}
        {step === 4 && (
          <div className="rise mx-auto max-w-[1180px]">
            <div className="max-w-[860px]">
              <div className="lbl mb-3">Что можно было иначе</div>
              <h1 className="text-h2 font-semibold tracking-[-0.016em] text-balance">
                Вернитесь в один момент и скажите иначе
              </h1>
              <p className="mt-2.5 max-w-[680px] text-body leading-relaxed text-ink2 text-pretty">
                {scenario.persona.name.split(' ')[0]}, его интересы и всё состояние переговоров восстановятся на этот
                раунд. Изменится только ваша формулировка.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {candidates.length === 0 && (
                <p className="text-ink2">Явных развилок нет — переговоры прошли ровно.</p>
              )}
              {candidates.map((c, i) => {
                const said = state.transcript.find((t) => t.index === c.turnIndex && t.role === 'user')?.text
                return (
                  <button
                    key={c.turnIndex}
                    onClick={() => onRewind(c.turnIndex)}
                    className="press group flex flex-col items-start gap-3 rounded-lg border border-line bg-surface px-5 py-[18px] text-left hover:border-accent hover:shadow-[0_6px_28px_rgba(30,92,65,0.09)]"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span className="flex w-full items-center gap-3">
                      <span className="num shrink-0 text-caption text-ink3">раунд {Math.floor(c.turnIndex / 2) + 1}</span>
                      <span className="h-px flex-1 bg-line" />
                      <span className="shrink-0 text-ink3 transition-colors group-hover:text-accent">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </span>
                    <span className="block text-lead font-semibold transition-colors group-hover:text-accent">
                      {c.title}
                    </span>
                    <span className="block text-small leading-snug text-ink2">{c.why}</span>
                    {said && (
                      <span className="mt-1 block border-l-2 border-line pl-3 text-small leading-relaxed text-ink3">
                        «{said}»
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <a
              href="/"
              className="press mt-7 inline-flex h-11 items-center rounded-md border border-line bg-surface px-5 text-ink2 hover:border-accent-line"
            >
              К списку сценариев
            </a>
          </div>
        )}
        </div>
      </div>
    </main>
  )
}
