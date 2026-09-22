'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Deal, NegotiationState, Scenario } from '@/lib/types'
import { createInitialState, walkAway } from '@/lib/engine/state'
import { score as computeScore, type ScoreReport } from '@/lib/engine/scoring'
import { rewindCandidates } from '@/lib/engine/rewind'
import { buildRun, loadRuns, saveRun, type RunRecord } from '@/lib/profile'
import { computeAdaptation } from '@/lib/engine/adaptive'
import { loadMode, type OpponentMode } from '@/lib/admin/storage'
import { clearSession, loadSession, saveSession } from '@/lib/session'
import { Debrief } from './Debrief'
import { Compare } from './Compare'
import { DealPanel } from './DealPanel'
import { Dossier } from './Dossier'
import { OfferSheet } from './OfferSheet'
import { Portrait } from './Portrait'
import { decapitalize } from '@/lib/text'
import { count } from '@/lib/plural'

/**
 * Тур по столу переговоров.
 *
 * Три подсказки вместо модального онбординга: они не закрывают экран, их
 * можно пропустить одной кнопкой и вернуть кнопкой «?». Тексты написаны так,
 * чтобы работать и на узком экране, где боковые зоны открываются кнопками.
 */
const TOUR = [
  {
    title: 'Цель и факты',
    detail:
      'Слева — ваша цель, запасной вариант и факты (на телефоне их открывает кнопка «Цель и факты»). Факт можно приложить к ответу: это объективный критерий, и он считается в разборе.',
  },
  {
    title: 'Разговор',
    detail:
      'Здесь вы говорите своими словами. Верный вопрос открывает интерес второй стороны — и в соглашении появляется новое условие, которым можно торговать.',
  },
  {
    title: 'Соглашение и пакет',
    detail:
      'Справа — проект соглашения и кнопка «Собрать предложение» (на телефоне — кнопка «Соглашение»). Пакет уходит целиком: вторая сторона отвечает на него одним решением.',
  },
]

const TOUR_KEY = 'arena.tour.v1'

function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === 'done'
  } catch {
    return true
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, 'done')
  } catch {
    /* приватный режим — тур просто покажется снова */
  }
}

export function ArenaClient({ scenario, configCode }: { scenario: Scenario; configCode?: string }) {
  const [state, setState] = useState<NegotiationState>(() => createInitialState(scenario))

  // Снапшот состояния ПЕРЕД каждым ходом игрока — на них держится развилка.
  const [snapshots, setSnapshots] = useState<{ turnIndex: number; state: NegotiationState }[]>([])
  // Снапшоты зачётной сессии отдельно: после возврата в ленте копятся снапшоты
  // второй версии, и «Переиграть другой момент» раньше мог восстановить мир из неё.
  const [baselineSnaps, setBaselineSnaps] = useState<{ turnIndex: number; state: NegotiationState }[]>([])
  const snapsRef = useRef(snapshots)
  useEffect(() => {
    snapsRef.current = snapshots
  }, [snapshots])
  // Последний отправленный пакет: шторка открывается с ним, а не с исходных условий.
  const [lastOffer, setLastOffer] = useState<Deal | undefined>()
  const [sheetSeed, setSheetSeed] = useState<Deal | undefined>()
  const [phase, setPhase] = useState<'live' | 'debrief' | 'compare'>('live')
  const [baseline, setBaseline] = useState<{ state: NegotiationState; score: ScoreReport } | null>(null)
  const [branch, setBranch] = useState<{ state: NegotiationState; score: ScoreReport } | null>(null)
  const [replay, setReplay] = useState<{ turnIndex: number; before: string } | null>(null)
  const [history, setHistory] = useState<RunRecord[]>([])
  const [prevDeal, setPrevDeal] = useState<Record<string, string>>({})
  const [newIssues, setNewIssues] = useState<string[]>([])
  const [hint, setHint] = useState<{ text: string; probeId?: string } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'deal' | 'dossier'>('deal')
  const [sheet, setSheet] = useState(false)
  const [pendingFact, setPendingFact] = useState<string | undefined>()
  const [confirmExit, setConfirmExit] = useState(false)
  // Вторая сторона согласилась: ждём решения игрока — фиксировать или продолжать.
  const [pendingDeal, setPendingDeal] = useState(false)
  // Отправленная реплика показывается сразу, не дожидаясь ответа сервера.
  const [pending, setPending] = useState<string | null>(null)
  const [intro, setIntro] = useState(true)
  const [offline, setOffline] = useState(false)
  const [mode, setMode] = useState<OpponentMode>('auto')
  // Какая боковая панель раскрыта на узком экране.
  const [panel, setPanel] = useState<'brief' | 'deal' | null>(null)
  // Переговоры закончились: экран уходит, разбор въезжает.
  const [closing, setClosing] = useState(false)
  // Партия поднята из хранилища после перезагрузки — об этом честно говорим в ленте.
  const [restored, setRestored] = useState(false)
  // Короткий тур по столу: три подсказки при первом входе, дальше по кнопке «?».
  const [tour, setTour] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  // Подпись сессии: кейс вместе с настройкой администратора. Другая настройка —
  // другая симуляция, поднимать в ней сохранённый разговор нельзя.
  const signature = `${scenario.id}|${configCode ?? ''}`

  // Оппонент помнит прошлые переговоры: профиль делает его жёстче там, где игрок слаб.
  const adaptation = useMemo(() => computeAdaptation(history), [history])

  // Встречное показывается сразу после ответа на пакет: чем оно отличается от
  // отправленного. Условия считает движок, поэтому взятое как есть оно принимается.
  const counterView = useMemo(() => {
    const counter = state.standingCounter
    const answered = state.transcript[state.transcript.length - 2]
    if (!counter || state.status !== 'active' || answered?.role !== 'user' || !answered.verdict || answered.verdict === 'accept') {
      return null
    }
    const from = lastOffer ?? state.deal
    const rows = scenario.issues
      .filter((i) => from[i.id] !== counter[i.id])
      .map((i) => ({
        label: i.label,
        from: i.options.find((o) => o.id === from[i.id])?.label ?? '',
        to: i.options.find((o) => o.id === counter[i.id])?.label ?? '',
      }))
    return rows.length ? { deal: counter, rows } : null
  }, [lastOffer, scenario.issues, state.deal, state.standingCounter, state.status, state.transcript])

  const openers = scenario.openers ?? []

  // На стол выкладываются первые три карты из колоды сценария.
  const hand = scenario.facts.slice(0, 3)
  const lastIndex = state.transcript.length - 1

  useEffect(() => {
    setHistory(loadRuns())
    setMode(loadMode())
    // Жюри открывает тренажёр раньше, чем видит демонстрацию: первый вход
    // объясняет три зоны стола. Второй раз тур сам не появляется.
    if (!tourSeen()) setTour(0)
    // Незаконченная партия переживает перезагрузку страницы: на демо это
    // разница между «продолжаем» и «начинаем сначала при жюри».
    const saved = loadSession(signature)
    if (saved) {
      setState(saved.state)
      setSnapshots(saved.snapshots ?? [])
      setLastOffer(saved.lastOffer)
      setIntro(false)
      setRestored(true)
      // Пауза после согласия переживает перезагрузку вместе с партией.
      if (saved.state.status === 'deal') setPendingDeal(true)
    }
  }, [signature])

  // Сохраняется только живая партия зачётной сессии: разбор и развилка
  // восстанавливаются расчётом, а не из хранилища.
  useEffect(() => {
    if (phase !== 'live' || replay) return
    if (state.status === 'active' || pendingDeal) saveSession({ signature, state, snapshots, lastOffer })
    else clearSession()
  }, [lastOffer, pendingDeal, phase, replay, signature, snapshots, state])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.transcript.length, busy, pending])

  const finish = useCallback(
    (final: NegotiationState) => {
      clearSession()
      const report = computeScore(scenario, final)
      setHistory(saveRun(buildRun(scenario, final, report, Boolean(replay))))
      if (replay) {
        setBranch({ state: final, score: report })
        setPhase('compare')
      } else {
        setBaseline({ state: final, score: report })
        setBaselineSnaps(snapsRef.current)
        setPhase('debrief')
      }
    },
    [replay, scenario],
  )

  const send = useCallback(
    async (payload: { userText: string; explicitOffer?: Deal }) => {
      if (busy || state.status !== 'active') return
      setBusy(true)
      setPending(payload.userText)
      setIntro(false)
      setRestored(false)
      const before = { ...state.deal }
      const visibleBefore = [...state.visibleIssues]
      setSnapshots((prev) => [...prev, { turnIndex: state.transcript.length, state }])
      try {
        const res = await fetch('/api/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioId: scenario.id,
            config: configCode,
            state,
            userText: payload.userText,
            explicitOffer: payload.explicitOffer,
            factPlayed: pendingFact,
            adaptation,
            forceOffline: mode === 'offline',
          }),
        })
        if (!res.ok) throw new Error('turn failed')
        const data = await res.json()
        setPrevDeal(before)
        setNewIssues((data.state.visibleIssues as string[]).filter((i) => !visibleBefore.includes(i)))
        setState(data.state)
        setPending(null)
        setOffline(data.source === 'offline')
        if (data.fallbackReason) {
          console.warn('[арена] ответ пришёл от офлайн-движка:', data.fallbackReason)
        }
        setPendingFact(undefined)
        // Сделку закрывает игрок, а не первый принятый пакет. Пока раунды не
        // кончились, после согласия предлагается выбор: зафиксировать или
        // продолжить обсуждение — остальные условия ещё на столе.
        const outOfRounds = data.state.round > scenario.maxRounds
        if (data.state.status === 'deal' && !outOfRounds) {
          setPendingDeal(true)
        } else if (data.state.status !== 'active') {
          setClosing(true)
          setTimeout(() => finish(data.state), 900)
        }
        if (data.hint) setHint({ text: data.hint, probeId: data.hintProbe })
      } catch {
        setPending(null)
        setHint({ text: 'Связь прервалась, ответ не дошёл. Отправьте реплику ещё раз.' })
      } finally {
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [adaptation, busy, configCode, finish, mode, pendingFact, scenario.id, scenario.maxRounds, state],
  )

  const setConfidence = (id: string, confidence: number) => {
    setState((s) => {
      const hypotheses = [...s.hypotheses]
      const found = hypotheses.find((h) => h.id === id)
      const probe = scenario.beliefProbes.find((p) => p.id === id)
      if (found) found.confidence = confidence
      else hypotheses.push({ id, text: probe?.text ?? '', confidence })
      return { ...s, hypotheses }
    })
  }

  if (phase === 'debrief' && baseline) {
    return (
      <Debrief
        scenario={scenario}
        state={baseline.state}
        score={baseline.score}
        candidates={rewindCandidates(scenario, baseline.state)}
        history={history}
        onRewind={(turnIndex) => {
          const snap = baselineSnaps.find((x) => x.turnIndex === turnIndex)
          if (!snap) return
          const originalLine =
            baseline.state.transcript.find((t) => t.index === turnIndex && t.role === 'user')?.text ?? ''
          setReplay({ turnIndex, before: originalLine })
          setState(snap.state)
          setSnapshots(baselineSnaps.filter((x) => x.turnIndex < turnIndex))
          setLastOffer(undefined)
          setPendingDeal(false)
          setPrevDeal({})
          setNewIssues([])
          setHint(null)
          setClosing(false)
          setPhase('live')
        }}
      />
    )
  }

  if (phase === 'compare' && baseline && branch && replay) {
    return (
      <Compare
        scenario={scenario}
        baseline={baseline}
        branch={branch}
        replayedLine={{
          before: replay.before,
          after: branch.state.transcript.find((t) => t.index === replay.turnIndex && t.role === 'user')?.text ?? '',
        }}
        onRewindAnother={() => {
          setReplay(null)
          setBranch(null)
          setPhase('debrief')
        }}
      />
    )
  }

  // Метка развилки: где именно откатились переговоры.
  const branchMark = replay ? (
    <div className="rise flex flex-col gap-2.5 py-1">
      <div className="flex items-center gap-2.5">
        <span className="lbl whitespace-nowrap text-ink3">Возврат к раунду {Math.floor(replay.turnIndex / 2) + 1}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      {replay.before && (
        <div className="flex justify-end">
          <div className="max-w-[520px] rounded-lg rounded-br-sm border border-dashed border-line px-3.5 py-2.5 text-small leading-relaxed text-ink3 line-through decoration-line-strong">
            {replay.before}
          </div>
        </div>
      )}
    </div>
  ) : null

  const renderDeal = (className?: string) => (
    <DealPanel
      scenario={scenario}
      state={state}
      previousDeal={prevDeal}
      newIssues={newIssues}
      tab={tab}
      onTab={setTab}
      onCompose={() => setSheet(true)}
      className={className}
    >
      <Dossier scenario={scenario} state={state} onSetConfidence={setConfidence} />
    </DealPanel>
  )

  // Левая колонка нужна в двух местах: в сетке на широком экране и в шторке на узком.
  const briefColumn = (
    <div
      className={`flex min-h-0 flex-col border-r border-line bg-rail ${
        tour === 0 ? 'outline outline-2 -outline-offset-2 outline-accent' : ''
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 lg:p-[18px]">
        <div>
          <div className="lbl mb-[7px] flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
            </svg>
            Цель
          </div>
          <div className="text-small leading-snug">{scenario.userGoal}</div>
        </div>

        <div>
          <div className="lbl mb-[7px] flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 20H5a1 1 0 01-1-1V5a1 1 0 011-1h5" /><path d="M15 16l4-4-4-4" /><path d="M19 12H9" />
            </svg>
            Запасной вариант
          </div>
          <div className="text-small leading-snug text-ink2">{scenario.userBatna.label}</div>
        </div>

        <div>
          <div className="lbl mb-[9px] flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" />
            </svg>
            Факты · осталось {hand.filter((f) => !state.playedFacts.includes(f.id)).length}
          </div>
          <div className="flex flex-col gap-2">
            {hand.map((f) => {
              const used = state.playedFacts.includes(f.id)
              const armed = pendingFact === f.id
              return (
                <button
                  key={f.id}
                  disabled={used || state.status !== 'active'}
                  onClick={() => setPendingFact(armed ? undefined : f.id)}
                  className={`press rounded-md border px-3 py-[11px] text-left ${
                    used
                      ? 'border-line bg-transparent opacity-45'
                      : armed
                        ? 'border-accent bg-accent-soft shadow-[0_1px_2px_rgba(26,28,25,0.04)]'
                        : 'border-line bg-surface hover:border-accent-line'
                  }`}
                >
                  <div className="mb-2 text-small leading-snug">{f.detail}</div>
                  <div className={`text-caption font-semibold ${used ? 'text-ink3' : 'text-accent'}`}>
                    {used ? 'уже использован' : armed ? 'приложен к ответу' : 'Приложить к ответу'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line/70 p-4 lg:p-[18px] lg:pt-4">
        {confirmExit ? (
          <div className="rise rounded-md border border-danger/40 bg-surface p-3">
            <p className="text-small leading-snug text-ink2">
              Выйти из переговоров без сделки? Если сделка оказалась бы хуже вашего запасного варианта, выход — правильное решение.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setConfirmExit(false)
                  // Момент выхода — тоже точка возврата: разбор предлагает его переиграть.
                  setSnapshots((prev) => [...prev, { turnIndex: state.transcript.length, state }])
                  const final = walkAway(state)
                  setState(final)
                  setClosing(true)
                  setTimeout(() => finish(final), 500)
                }}
                className="press h-9 flex-1 rounded-md bg-danger text-caption font-semibold text-white"
              >
                Выйти
              </button>
              <button
                onClick={() => setConfirmExit(false)}
                className="press h-9 flex-1 rounded-md border border-line text-caption text-ink2 hover:border-ink3"
              >
                Остаться
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmExit(true)}
            disabled={busy || state.status !== 'active'}
            className="press h-9 w-full shrink-0 rounded-md border border-line text-small text-ink2 hover:border-danger hover:text-danger disabled:opacity-40"
          >
            Выйти из переговоров
          </button>
        )}
      </div>
    </div>
  )

  return (
    <main
      className="flex h-dvh flex-col bg-paper"
      style={{
        opacity: closing ? 0 : 1,
        transform: closing ? 'scale(0.994)' : 'none',
        transition: 'opacity 420ms var(--ease-out), transform 420ms var(--ease-out)',
      }}
    >
      {/* Шапка */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" aria-label="К списку сценариев" className="press shrink-0 rounded-sm p-1 text-ink2 hover:bg-line2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </a>
          <span className="shrink-0 font-semibold">{scenario.title}</span>
          <span className="shrink-0 text-ink3">·</span>
          <span className="truncate text-small text-ink2">ваша роль: {scenario.userRole}</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 lg:gap-[18px]">
          {replay && (
            <span className="flex h-7 items-center gap-[7px] rounded-sm bg-accent-soft px-2.5 text-caption font-semibold text-accent">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /></svg>
              <span className="hidden sm:inline">Тренировочный ход — не в зачёт</span>
              <span className="sm:hidden">Не в зачёт</span>
            </span>
          )}
          <button
            onClick={() => setTour(0)}
            aria-label="Как устроен стол переговоров"
            className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-caption font-semibold text-ink2 hover:border-accent hover:bg-accent-soft hover:text-accent"
          >
            ?
          </button>
          <span className="num whitespace-nowrap text-small text-ink3">
            раунд {Math.min(state.round, scenario.maxRounds)} из {scenario.maxRounds}
          </span>
        </div>
      </header>

      {/* На узком экране боковые панели вызываются кнопками. */}
      <div className="flex shrink-0 gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
        <button
          onClick={() => setPanel('brief')}
          className="press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-line text-small text-ink2"
        >
          Цель и факты
          <span className="num text-caption text-ink3">
            {hand.filter((f) => !state.playedFacts.includes(f.id)).length}
          </span>
        </button>
        <button
          onClick={() => setPanel('deal')}
          className="press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-line text-small text-ink2"
        >
          Соглашение
          <span className="num text-caption text-ink3">
            {scenario.issues.filter((i) => state.visibleIssues.includes(i.id) && state.deal[i.id] !== i.defaultOptionId).length}
            /{scenario.issues.length}
          </span>
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(180px,224px)_minmax(0,1fr)_minmax(280px,324px)] xl:grid-cols-[264px_minmax(0,1fr)_368px] 2xl:grid-cols-[284px_minmax(0,1fr)_384px]">
        {/* Левая колонка: на узком экране открывается кнопкой */}
        <div className="hidden md:contents">{briefColumn}</div>

        {/* Разговор */}
        <div className="flex min-h-0 flex-col bg-surface">
          <div ref={feedRef} className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-[22px] lg:px-10">
            {intro && (
              <div className="line-in rounded-lg border border-line bg-paper px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="lbl mb-2">С чего начинается разговор</div>
                    <p className="text-small leading-relaxed text-ink2">{scenario.userBrief}</p>
                    {adaptation.note && (
                      <p className="mt-2.5 flex items-start gap-2 rounded-md border border-accent-line bg-accent-soft px-3 py-2 text-small leading-relaxed text-ink2">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden>
                          <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
                        </svg>
                        <span>
                          Сегодня будет тяжелее: {adaptation.note}.
                        </span>
                      </p>
                    )}
                    <p className="mt-2.5 text-small leading-relaxed text-ink2">
                      Напротив вас {scenario.persona.name}, {scenario.persona.role}.
                      Позиция второй стороны: {decapitalize(scenario.persona.openingPosition)}. Первое
                      слово за ней.
                    </p>
                  </div>
                  <button
                    onClick={() => setIntro(false)}
                    aria-label="Закрыть"
                    className="press shrink-0 rounded-sm p-1 text-ink3 hover:bg-line2 hover:text-ink"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {state.transcript.map((t, i) => {
              const isLast = i === lastIndex
              if (t.role === 'user') {
                return (
                  <div key={i}>
                    {replay && t.index === replay.turnIndex && branchMark}
                    <div className="flex justify-end">
                      <div className="max-w-[520px] rounded-lg rounded-br-sm border border-line2 bg-paper px-3.5 py-3 leading-relaxed">
                        {t.text}
                      </div>
                    </div>
                  </div>
                )
              }
              // Раскрытие интереса движок записывает в ход игрока — плашка идёт перед ответом.
              const revealedHere = state.transcript[i - 1]?.revealed?.length ?? 0
              return (
                <div key={i} className={isLast ? 'line-in' : undefined}>
                  {revealedHere > 0 && (
                    <div className="mb-4 flex items-center gap-[10px]">
                      <span className="reveal-mark h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="reveal-mark whitespace-nowrap text-caption font-semibold text-accent">
                        Раскрыт интерес
                      </span>
                      <span className="reveal-rule h-px flex-1 bg-accent-line" />
                    </div>
                  )}
                  <div className="flex max-w-[660px] gap-3">
                    <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={32} active={isLast} />
                    <div className="min-w-0">
                      <div className="mb-1 text-caption text-ink3">{scenario.persona.name}</div>
                      <div className={isLast ? 'text-lead tracking-[-0.005em] text-pretty xl:text-reply' : 'leading-relaxed text-ink2'}>
                        {t.text}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {pending && (
              <div className="flex justify-end">
                <div className="line-in max-w-[520px] rounded-lg rounded-br-sm border border-line2 bg-paper px-3.5 py-3 leading-relaxed">
                  {pending}
                </div>
              </div>
            )}

            {/* Развилка в конце ленты: ход ещё не переигран. */}
            {replay && state.transcript.length === replay.turnIndex && branchMark}

            {busy && (
              <div className="flex items-center gap-3 pl-1">
                <Portrait name={scenario.persona.name} file={scenario.persona.portrait} size={32} />
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-faint"
                      style={{ animationDelay: `${i * 0.16}s` }}
                    />
                  ))}
                </span>
              </div>
            )}

            {/* Гипотеза одним кликом */}
            {hint && !busy && (
              <div className="rise ml-11 flex max-w-[600px] flex-wrap items-center gap-x-4 gap-y-2.5 rounded-md border border-line bg-paper px-3.5 py-2.5">
                <span className="min-w-[180px] flex-1 text-small">{hint.text}</span>
                {hint.probeId ? (
                  <div className="ml-auto flex gap-1.5">
                    {[
                      { l: 'Похоже', v: 0.85 },
                      { l: 'Не уверен', v: 0.5 },
                      { l: 'Вряд ли', v: 0.15 },
                    ].map((o) => (
                      <button
                        key={o.l}
                        onClick={() => {
                          setConfidence(hint.probeId!, o.v)
                          setHint(null)
                        }}
                        className="press flex h-7 items-center whitespace-nowrap rounded-sm border border-line-strong bg-surface px-2.5 text-caption text-ink2 hover:border-accent hover:bg-accent-soft hover:text-accent"
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button onClick={() => setHint(null)} className="press ml-auto whitespace-nowrap text-caption text-ink3 hover:text-ink">
                    Понятно
                  </button>
                )}
              </div>
            )}
            {/* Согласие получено: закрыть сделку или торговаться дальше — решает игрок. */}
            {pendingDeal && !busy && (
              <div className="rise ml-11 max-w-[600px] rounded-md border border-accent-line bg-accent-soft px-4 py-3.5">
                <p className="text-small leading-snug">
                  Вторая сторона согласна на этот пакет. Условия уже в соглашении: можно зафиксировать сделку
                  или продолжить обсуждение — {count(scenario.maxRounds - state.round + 1, ['раунд', 'раунда', 'раундов'])} ещё есть.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setPendingDeal(false)
                      setClosing(true)
                      setTimeout(() => finish(state), 600)
                    }}
                    className="press flex h-9 items-center rounded-md bg-accent px-4 text-caption font-semibold text-white hover:bg-accent/92"
                  >
                    Зафиксировать сделку
                  </button>
                  <button
                    onClick={() => {
                      setPendingDeal(false)
                      setState((s) => ({ ...s, status: 'active' }))
                      inputRef.current?.focus()
                    }}
                    className="press flex h-9 items-center rounded-md border border-line bg-surface px-4 text-caption text-ink2 hover:border-accent hover:text-accent"
                  >
                    Продолжить обсуждение
                  </button>
                </div>
              </div>
            )}

            {/* Встречное предложение: условия посчитаны движком, его можно взять в шторку как есть. */}
            {counterView && !busy && (
              <div className="rise ml-11 max-w-[600px] rounded-md border border-line bg-surface px-4 py-3">
                <div className="lbl mb-2">Встречное предложение</div>
                <div className="flex flex-col">
                  {counterView.rows.map((r) => (
                    <div
                      key={r.label}
                      className="flex flex-col gap-0.5 border-b border-line2 py-[7px] last:border-0 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:items-baseline sm:gap-3"
                    >
                      <span className="text-small text-ink2">{r.label}</span>
                      <span className="num flex flex-wrap items-baseline gap-x-[7px] text-small sm:justify-end sm:text-right">
                        <span className="text-ink3 line-through decoration-line-strong">{r.from}</span>
                        <span className="font-semibold">{r.to}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setSheetSeed(counterView.deal)
                    setSheet(true)
                  }}
                  className="press mt-3 flex h-8 items-center gap-1.5 rounded-sm border border-accent-line bg-accent-soft px-3 text-caption font-semibold text-accent hover:border-accent"
                >
                  Открыть в шторке
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            )}
            <div className="h-2 shrink-0" />
          </div>

          {/* Ввод */}
          <div className="flex shrink-0 flex-col gap-[11px] border-t border-line2 px-6 pb-5 pt-[14px] lg:px-10">
            {/* С чего начать. Первый ход решает, куда пойдёт разговор, а человек,
                открывший тренажёр сам, чаще всего пишет «здравствуйте». Это приёмы,
                а не подсказки к ответу: скрытых интересов здесь нет. */}
            {openers.length > 0 && state.round === 1 && !text && !busy && state.status === 'active' && (
              <div className="rise flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="lbl shrink-0">С чего начать</span>
                {openers.map((o) => (
                  <button
                    key={o}
                    onClick={() => {
                      setText(o)
                      inputRef.current?.focus()
                    }}
                    className="press max-w-full truncate rounded-sm border border-line bg-surface px-2.5 py-1 text-caption text-ink2 hover:border-accent hover:bg-accent-soft hover:text-accent"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            {(pendingFact || offline || restored) && (
              <div className="flex items-center gap-3">
                {restored && (
                  <span className="text-caption text-ink-faint">партия восстановлена после перезагрузки</span>
                )}
                {pendingFact && (
                  <span className="num text-caption font-semibold text-accent">факт уйдёт вместе с ответом</span>
                )}
                {offline && (
                  <span
                    className="num text-caption text-ink-faint"
                    title={mode === 'offline'
                      ? 'Включён запасной режим: оппонент играется движком без обращений к сети.'
                      : 'Модель не ответила, ход отыграл запасной движок. Причина — в консоли сервера.'}
                  >
                    {mode === 'offline' ? 'запасной режим' : 'ответил запасной движок'}
                  </span>
                )}
              </div>
            )}
            <div
              className={`flex items-end gap-[10px] rounded-md ${
                tour === 1 ? 'outline outline-2 outline-offset-4 outline-accent' : ''
              }`}
            >
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const v = text.trim()
                    if (v) {
                      setText('')
                      void send({ userText: v })
                    }
                  }
                }}
                rows={1}
                disabled={busy || state.status !== 'active'}
                placeholder="Напишите ответ…"
                className="max-h-32 min-h-[44px] w-full min-w-0 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3.5 py-3 outline-none transition-colors placeholder:text-ink3 focus:border-accent disabled:opacity-50"
              />
              <button
                onClick={() => {
                  const v = text.trim()
                  if (v) {
                    setText('')
                    void send({ userText: v })
                  }
                }}
                disabled={busy || !text.trim() || state.status !== 'active'}
                className="press flex h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92 disabled:opacity-30"
              >
                Отправить
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Соглашение / досье */}
        {renderDeal(`hidden md:flex ${tour === 2 ? 'outline outline-2 -outline-offset-2 outline-accent' : ''}`)}
      </div>

      {/* Панель тура стоит сверху: снизу поле ввода, и подсказка не должна
          закрывать кнопку «Отправить» — иначе она мешает ровно там, где учит. */}
      {tour !== null && (
        <div className="rise fixed inset-x-4 top-24 z-50 mx-auto max-w-[560px] rounded-lg border border-line bg-surface px-5 py-4 shadow-[0_14px_44px_rgba(26,28,25,0.16)] md:top-20">
          <div className="flex items-baseline gap-3">
            <span className="lbl">{TOUR[tour].title}</span>
            <span className="num ml-auto shrink-0 text-caption text-ink3">{tour + 1} из {TOUR.length}</span>
          </div>
          <p className="mt-2 text-small leading-relaxed text-ink2">{TOUR[tour].detail}</p>
          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={() => {
                if (tour + 1 < TOUR.length) {
                  setTour(tour + 1)
                } else {
                  setTour(null)
                  markTourSeen()
                }
              }}
              className="press flex h-9 items-center rounded-md bg-accent px-4 text-caption font-semibold text-white hover:bg-accent/92"
            >
              {tour + 1 < TOUR.length ? 'Дальше' : 'Понятно'}
            </button>
            {tour + 1 < TOUR.length && (
              <button
                onClick={() => {
                  setTour(null)
                  markTourSeen()
                }}
                className="press flex h-9 items-center rounded-md px-3 text-caption text-ink3 hover:text-ink2"
              >
                Пропустить
              </button>
            )}
          </div>
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-40 flex flex-col bg-paper md:hidden">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
            <span className="font-semibold">{panel === 'brief' ? 'Цель и факты' : 'Соглашение'}</span>
            <button onClick={() => setPanel(null)} aria-label="Закрыть" className="press rounded-sm p-1 text-ink2 hover:bg-line2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col [&>aside]:border-l-0 [&>div]:border-r-0">
              {panel === 'brief' ? briefColumn : renderDeal('flex')}
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <OfferSheet
          scenario={scenario}
          state={state}
          initial={sheetSeed ?? lastOffer}
          busy={busy}
          onClose={() => {
            setSheet(false)
            setSheetSeed(undefined)
          }}
          onSend={(offer, argument) => {
            setSheet(false)
            setSheetSeed(undefined)
            // На узком экране ответ на пакет и встречное приходят в ленту — панель
            // соглашения поверх неё закрывается, иначе ответа не видно.
            setPanel(null)
            setLastOffer(offer)
            void send({ userText: argument, explicitOffer: offer })
          }}
        />
      )}

    </main>
  )
}
