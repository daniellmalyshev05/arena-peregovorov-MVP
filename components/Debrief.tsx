'use client'

import { useEffect, useState } from 'react'
import type { NegotiationState, Scenario } from '@/lib/types'
import type { ScoreReport } from '@/lib/engine/scoring'
import { concededAt, momentContext, type RewindCandidate } from '@/lib/engine/rewind'
import { analyze } from '@/lib/engine/utility'
import { decapitalize, num } from '@/lib/text'
import { count } from '@/lib/plural'
import { newlyMastered } from '@/lib/profile'
import { adaptationTargets, computeAdaptation } from '@/lib/engine/adaptive'
import { Portrait } from './Portrait'
import { SCORE_METHOD, type Method } from '@/lib/techniques'
import { ArenaMap } from './ArenaMap'
import type { RunRecord } from '@/lib/profile'

/**
 * Четвёртый шаг называется по тому, что на нём реально показано.
 *
 * Разбор не имеет права называть ошибкой ход, который на соседнем таймлайне
 * помечен находкой. Если настоящей ошибки в партии нет, шаг показывает
 * поворотный ход и называется соответственно.
 *
 * Третий шаг стоит сразу за баллом не случайно: человек, увидевший число,
 * первым делом спрашивает, кто его поставил.
 */
const steps = (fault: boolean) => [
  'Что получилось',
  'Где вы оказались',
  'Кто это посчитал',
  fault ? 'Где вы ошиблись' : 'Что решило исход',
  'Что было скрыто',
  'Что можно было иначе',
]
const STEP_COUNT = 6

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
    // Страховка: в свёрнутом или перекрытом окне кадры не приходят вовсе, и
    // главное число партии остаётся нулём — ровно на том экране, ради которого
    // всё и затевалось. Таймер в фоне только замедляется, поэтому итог доедет.
    const settle = setTimeout(() => setShown(value), duration + 250)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
    }
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
  const [allRounds, setAllRounds] = useState(false)

  // Стрелки на клавиатуре листают разбор — так же, как кнопки по бокам.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') setStep((v) => Math.max(0, v - 1))
      if (e.key === 'ArrowRight') setStep((v) => Math.min(STEP_COUNT - 1, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Без соглашения совместной ценности нет вовсе: вся возможная осталась на
  // столе. Раньше шаги 2 и 3 считали её по условиям, которые никто не подписал,
  // и рядом с «соглашения нет, 0 / 20» стояло «использована на 45%».
  const rawEconomy = analyze(scenario, state.deal)
  const agreed = state.status === 'deal' || state.status === 'active'
  const economy = agreed
    ? rawEconomy
    : { ...rawEconomy, efficiency: 0, valueLeftOnTable: Math.max(0, rawEconomy.maxJointSurplus) }
  const userTurns = state.transcript.filter((t) => t.role === 'user')

  /**
   * Кто что решил в этой партии.
   *
   * Утверждать «считает код, а не модель» словами мало: это говорят все. Здесь
   * показан счёт на числах сыгранной партии и построчно — какое решение стояло
   * за каждым ходом. Формулировки выверены по движку: вердикт и баллы модель
   * не трогает вообще, разметку актов и настроение — трогает, но в границах,
   * и эта граница названа честно, иначе первый же внимательный человек поймает
   * на преувеличении.
   */
  const opponentTurns = state.transcript.filter((t) => t.role === 'opponent')
  const verdictTurns = userTurns.filter((t) => t.verdict)
  const combos = scenario.issues.reduce((a, i) => a * i.options.length, 1)
  const VERDICT_TRACE = {
    accept: {
      title: 'Пакет принят',
      detail: 'Код посчитал: пакет выгоднее её запасного варианта. Модель получила решение готовым и только сформулировала согласие.',
      tone: 'good' as const,
    },
    counter: {
      title: 'Встречное предложение',
      detail: 'Лучше её отказа, но ниже того, на что она рассчитывала. Условия встречного посчитаны кодом и переданы модели готовыми.',
      tone: 'warn' as const,
    },
    reject: {
      title: 'Пакет отклонён',
      detail: 'Код посчитал: пакет ниже её запасного варианта. Модели осталось объяснить отказ словами.',
      tone: 'bad' as const,
    },
  }
  const decisions = userTurns.flatMap((t) => {
    const rows: { key: string; index: number; title: string; detail: string; tone: 'good' | 'warn' | 'bad' | 'plain' }[] = []
    if (t.verdict) rows.push({ key: `v${t.index}`, index: t.index, ...VERDICT_TRACE[t.verdict] })
    for (const id of t.revealed) {
      const label = scenario.hiddenInterests.find((h) => h.id === id)?.label
      rows.push({
        key: `r${t.index}-${id}`,
        index: t.index,
        title: 'Интерес раскрыт',
        detail: `Ход подошёл под акт из списка допустимых — код открыл${label ? `: ${decapitalize(label)}` : ' интерес'}.`,
        tone: 'good',
      })
    }
    if (t.factPlayed) {
      rows.push({
        key: `f${t.index}`,
        index: t.index,
        title: 'Факт засчитан',
        detail: 'Объективный критерий отмечен кодом и пошёл в отдельный показатель результата.',
        tone: 'plain',
      })
    }
    return rows
  })

  /**
   * Ход годится в «где вы ошиблись», только если таймлайн под заголовком не
   * помечает его находкой. Два кандидата на откат выбирают момент формулой от
   * длины партии («здесь можно было копнуть глубже») или берут последнюю
   * реплику, когда предложений не было, — и в удачной партии это ровно тот ход,
   * который раскрыл интерес. Разбор не имеет права называть его ошибкой.
   */
  const blameable = (index?: number) => {
    if (index === undefined) return false
    const t = userTurns.find((x) => x.index === index)
    if (!t) return false
    if (concededAt(t) || t.acts.includes('personal_attack')) return true
    return !(t.revealed.length > 0 || t.acts.includes('objective_criterion'))
  }
  const fault = [
    score.rootCauseTurn,
    ...candidates
      .filter((c) => c.kind !== 'missed_interest' && c.kind !== 'turning_point' && c.kind !== 'walkaway')
      .map((c) => c.turnIndex),
  ].find(blameable)
  // Ошибки нет — показываем поворот: ход, который открыл интерес или сдвинул условия.
  const turning =
    userTurns.find((t) => t.revealed.length > 0)?.index ??
    [...userTurns].reverse().find((t) => t.dealChanges.length > 0)?.index
  const focus = fault ?? turning
  const isFault = fault !== undefined
  const STEPS = steps(isFault)
  const moment = focus !== undefined ? momentContext(state, focus) : undefined
  const otherRounds = userTurns.filter((t) => !candidates.some((c) => c.turnIndex === t.index))
  // Что изменила именно эта сессия: освоенные навыки и новые привычки, которые
  // запомнила вторая сторона. Считается сравнением профиля до и после сессии.
  const unlocked = newlyMastered(history)
  const remembered = (() => {
    const before = adaptationTargets(computeAdaptation(history.slice(0, -1))).map((t) => t.id)
    return adaptationTargets(computeAdaptation(history)).filter((t) => !before.includes(t.id))
  })()
  const total = useCountUp(score.total)
  const grown = useGrown()

  // Ключевой момент бывает и удачным — красный только там, где действительно ошибка.
  const momentBad = Boolean(
    moment?.turn &&
      (concededAt(moment.turn) || moment.turn.acts.includes('personal_attack')),
  )
  const leftOnTableBad = economy.valueLeftOnTable > 8

  return (
    <main className="flex h-dvh flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:px-5">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <a href="/" aria-label="К списку сценариев" className="press tap -ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink2 hover:bg-line2 md:ml-0 md:h-8 md:w-8">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </a>
          <span className="font-semibold">Разбор</span>
          <span className="hidden text-ink3 xl:inline">·</span>
          <span className="hidden truncate text-small text-ink2 xl:inline">{scenario.title}</span>
        </div>
        <span className="num ml-auto shrink-0 text-small text-ink2">
          шаг {step + 1} из {STEP_COUNT}
        </span>
      </header>

      {/* Полоса шагов. Раньше переключение пряталось бледным текстом в шапке
          и его просто не находили — теперь это явная навигация с прогрессом. */}
      <nav aria-label="Шаги разбора" className="flex shrink-0 overflow-x-auto border-b border-line bg-surface">
        {STEPS.map((label: string, i: number) => {
          const done = i < step
          const current = i === step
          return (
            <button
              key={label}
              onClick={() => setStep(i)}
              // Кнопка состоит из номера и подписи разными спанами: без явного
              // имени скринридер читал её как безымянную.
              aria-label={`Шаг ${i + 1} из ${STEPS.length}: ${label}`}
              aria-current={current ? 'step' : undefined}
              className={`press relative flex min-h-11 min-w-[124px] flex-1 items-center gap-2 px-2.5 py-2.5 text-left sm:min-h-0 sm:min-w-[150px] sm:gap-2.5 sm:px-3 lg:px-4 ${
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
          onClick={() => setStep((v) => Math.min(STEP_COUNT - 1, v + 1))}
          disabled={step === STEP_COUNT - 1}
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

              {/* Прогрессия в момент, когда она произошла: навык подтвердился
                  повторяемостью или вторая сторона запомнила привычку. */}
              {(unlocked.length > 0 || remembered.length > 0) && (
                <div className="mt-8 flex flex-wrap gap-2">
                  {unlocked.map((s) => (
                    <span
                      key={s.id}
                      className="rise flex items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-3.5 py-2 text-small"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                      <span>
                        <span className="font-semibold text-accent">Навык освоен:</span> {decapitalize(s.title)}
                      </span>
                    </span>
                  ))}
                  {remembered.map((t) => (
                    <span
                      key={t.id}
                      className="rise flex items-center gap-2 rounded-md border border-line bg-surface px-3.5 py-2 text-small"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink3" aria-hidden><path d="M12 8v5l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                      <span>
                        <span className="font-semibold">Вторая сторона запомнила:</span> {decapitalize(t.cause)}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-3.5 lg:grid-cols-2">
                {score.lines.map((l) => (
                  <div key={l.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-small">
                      <span>
                        {l.label}
                        {SCORE_METHOD[l.key] && <MethodTag method={SCORE_METHOD[l.key]} />}
                      </span>
                      <span className={`num whitespace-nowrap ${l.earned === 0 ? 'text-danger' : 'text-ink2'}`}>
                        {points(l.earned)} / {l.max}
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
                      <span className="text-danger">
                        {p.label}
                        {SCORE_METHOD[p.key] && <MethodTag method={SCORE_METHOD[p.key]} />}
                      </span>
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
                      {num(economy.valueLeftOnTable)}
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
              {STEPS[2]}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}

        {/* Шаг 3 — кто считал.
            Самое своё в продукте и при этом самое незаметное: экономика сделки,
            вердикты и баллы считаются кодом, модель играет человека. Слова об
            этом стоят дёшево, поэтому здесь счёт по сыгранной партии и граница
            влияния модели, названная прямо. */}
        {step === 2 && (
          <div className="rise mx-auto max-w-[1180px]">
            <div className="lbl mb-3">{STEPS[2]}</div>
            <h1 className="max-w-[820px] text-h2 font-semibold tracking-[-0.016em] text-balance">
              Ваш балл посчитал код, а не языковая модель
            </h1>
            <p className="mt-3.5 max-w-[720px] text-lead text-ink2 text-pretty">
              Выгодность каждого пакета для второй стороны считается до того, как модель увидит
              ваш ход. Вердикт уходит ей готовым — принять, ответить встречным или отказаться, —
              и сказать она может только то, что уже решено. Результат нельзя выговорить, его
              можно выторговать.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="rounded-lg border border-accent-line bg-accent-soft p-5 sm:p-6">
                <div className="lbl mb-4 text-accent">Что посчитал код в этой партии</div>
                <dl className="flex flex-col gap-3.5">
                  {[
                    {
                      n: verdictTurns.length,
                      t: 'решений по вашим пакетам',
                      d: 'Принять, ответить встречным или отказаться — каждое посчитано до обращения к модели.',
                    },
                    {
                      n: userTurns.length,
                      t: 'проверок речевого акта',
                      d: 'Интерес открывается, только если ход действительно подходит под него. Заявку модели код сверяет со списком.',
                    },
                    {
                      n: combos,
                      t: 'комбинаций сделки перебрано',
                      d: 'Отсюда граница возможного на карте и ваша точка на ней.',
                    },
                    {
                      n: score.lines.length,
                      t: 'показателей результата',
                      d: `Со своими весами${score.penalties.length ? ` и ${count(score.penalties.length, ['штрафом', 'штрафами', 'штрафами'])}` : ''} — ни один не назначен на глаз.`,
                    },
                  ].map((r) => (
                    /* На узком экране колонка под число съедала ширину подписи,
                       и каждая строка ломалась на четыре. Пояснение уходит под
                       число во всю ширину, а колонка возвращается с 640 px. */
                    <div
                      key={r.t}
                      className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-x-3.5 sm:gap-y-0.5"
                    >
                      <dt className="num text-h2 font-semibold leading-none text-accent">
                        {r.n.toLocaleString('ru-RU')}
                      </dt>
                      <dd className="min-w-0 font-semibold">{r.t}</dd>
                      <dd className="col-span-2 text-small leading-snug text-ink2 text-pretty sm:col-span-1 sm:col-start-2">
                        {r.d}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
                  <div className="lbl mb-3">Что делала модель</div>
                  <div className="flex items-center gap-3">
                    <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={34} />
                    <div className="min-w-0">
                      <div className="font-semibold">{scenario.persona.name}</div>
                      <div className="text-caption text-ink3">{scenario.persona.role}</div>
                    </div>
                  </div>
                  <p className="mt-3.5 text-small leading-relaxed text-ink2 text-pretty">
                    {count(opponentTurns.length, ['реплика', 'реплики', 'реплик'])} в этой партии:
                    характер, интонация, реакция на ваши слова. Ни одного балла и ни одного решения
                    по сделке.
                  </p>
                </div>

                {/* Граница названа прямо: преувеличение поймают быстрее, чем похвалят. */}
                <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
                  <div className="lbl mb-3">Где проходит граница</div>
                  <p className="text-small leading-relaxed text-ink2 text-pretty">
                    Модель размечает ваши реплики по типу речевого акта и может подвинуть доверие
                    и раздражение второй стороны — не больше чем на восемь пунктов из ста за ход.
                    Дальше её полномочия кончаются: что попадёт в соглашение, что засчитано
                    уступкой и сколько это стоит, решает код.
                  </p>
                </div>
              </div>
            </div>

            <section className="mt-9">
              <div className="lbl mb-2.5 border-b border-line pb-2">Решения этой партии, по ходам</div>
              {decisions.length === 0 ? (
                <p className="py-3 text-small leading-relaxed text-ink2 text-pretty">
                  Вы не отправили ни одного пакета и не открыли ни одного интереса, поэтому считать
                  было нечего: код только размечал реплики и вёл настроение второй стороны.
                </p>
              ) : (
                <ol className="flex flex-col">
                  {decisions.map((d) => (
                    <li
                      key={d.key}
                      className="grid grid-cols-[minmax(0,1fr)] gap-y-1 border-b border-line2 py-3 last:border-0 sm:grid-cols-[76px_minmax(0,190px)_minmax(0,1fr)] sm:items-baseline sm:gap-x-4"
                    >
                      <span className="num text-caption text-ink3">раунд {Math.floor(d.index / 2) + 1}</span>
                      <span
                        className={`font-semibold ${
                          d.tone === 'bad' ? 'text-danger' : d.tone === 'good' ? 'text-accent' : ''
                        }`}
                      >
                        {d.title}
                      </span>
                      <span className="text-small leading-snug text-ink2 text-pretty">{d.detail}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <button
              onClick={() => setStep(3)}
              className="press mt-7 flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
            >
              {STEPS[3]}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}

        {/* Шаг 4 */}
        {step === 3 && (
          <div className="rise mx-auto max-w-[1180px]">
            <div className="lbl mb-3">{STEPS[3]}</div>
            <h1 className="max-w-[760px] text-h2 font-semibold tracking-[-0.016em] text-balance">
              {!moment?.turn
                ? 'Переговоры прошли без резких поворотов'
                : isFault
                  ? 'Один ход изменил экономику сделки'
                  : 'Один ход развернул переговоры'}
            </h1>

            {/* Таймлайн */}
            <div className="relative mt-9 h-14">
              <div className="absolute inset-x-0 top-[11px] h-[1.5px] bg-line" />
              {userTurns.map((t, i) => {
                const left = userTurns.length > 1 ? (i / (userTurns.length - 1)) * 96 + 2 : 50
                const bad = concededAt(t) || t.acts.includes('personal_attack')
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
                      {isFault ? 'ключевой момент' : 'поворотный ход'}
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
                  <div className="lbl mb-4">{isFault ? 'Что это стоило' : 'Чем это обернулось'}</div>
                  <div className="flex flex-col gap-3 text-small leading-snug">
                    <div>
                      <div className="lbl mb-1">Совместная ценность</div>
                      использована на <span className="num font-semibold">{(economy.efficiency * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <div className="lbl mb-1">Осталось на столе</div>
                      <span className={`num font-semibold ${leftOnTableBad ? 'text-danger' : ''}`}>
                        {num(economy.valueLeftOnTable)}
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
              onClick={() => setStep(4)}
              className="press mt-7 flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
            >
              Что было скрыто
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}

        {/* Шаг 5 */}
        {step === 4 && (
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
                    {num(score.lines.find((l) => l.key === 'calibration')?.earned ?? 0)}
                  </span>
                  <div className="mt-0.5 text-label text-ink3">из 15 баллов</div>
                </div>
              </div>

              <button
                onClick={() => setStep(5)}
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

        {/* Шаг 6 */}
        {step === 5 && (
          <div className="rise mx-auto max-w-[1180px]">
            <div className="max-w-[860px]">
              <div className="lbl mb-3">Что можно было иначе</div>
              <h1 className="text-h2 font-semibold tracking-[-0.016em] text-balance">
                Вернитесь в один момент и скажите иначе
              </h1>
              <p className="mt-2.5 max-w-[680px] text-body leading-relaxed text-ink2 text-pretty">
                Весь стол вернётся к этому раунду: настроение второй стороны, раскрытые интересы,
                условия в соглашении. Изменится только то, что вы скажете дальше.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {candidates.length === 0 && (
                <p className="text-ink2">Переговоры закончились раньше первой реплики — возвращаться не к чему.</p>
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

            {/* Любой другой раунд: холл обещает, что вернуть можно любой ход. */}
            {otherRounds.length > 0 && (
              <div className="mt-7 max-w-[860px]">
                <button
                  onClick={() => setAllRounds((v) => !v)}
                  aria-expanded={allRounds}
                  className="press flex min-h-11 items-center gap-2 rounded-md text-small font-semibold text-accent md:min-h-0 md:rounded-sm"
                >
                  Вернуть другой раунд
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden
                    style={{ transform: allRounds ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {allRounds && (
                  <div className="rise mt-3 divide-y divide-line2 rounded-lg border border-line bg-surface">
                    {otherRounds.map((t) => (
                      <button
                        key={t.index}
                        onClick={() => onRewind(t.index)}
                        className="press group flex w-full items-baseline gap-4 px-4 py-3 text-left hover:bg-line2/60"
                      >
                        <span className="num w-[68px] shrink-0 text-caption text-ink3">раунд {Math.floor(t.index / 2) + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-small text-ink2 group-hover:text-ink">«{t.text}»</span>
                        <span className="shrink-0 text-ink3 transition-colors group-hover:text-accent" aria-hidden>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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

/** Методика, на которой стоит показатель: названа там же, где стоит балл. */
function MethodTag({ method }: { method: Method }) {
  return (
    <span className="ml-2 inline-flex translate-y-[-1px] items-center whitespace-nowrap rounded-sm border border-line px-1.5 py-px align-middle text-[11px] font-medium leading-4 text-ink3">
      {method}
    </span>
  )
}

/** Баллы с запятой, как и все числа в разборе; целые — без «,0». */
function points(value: number) {
  return Number.isInteger(value) ? String(value) : num(value)
}
