'use client'

import { useEffect, useRef, useState } from 'react'
import type { Archetype, Scenario } from '@/lib/types'
import type { CustomCase } from '@/lib/admin/custom'

/**
 * Новый кейс по описанию администратора.
 *
 * Модель пишет кейс потоком, и по мере ответа видно, сколько условий,
 * интересов и фактов уже готово. Проверку, балансировку и аудит делает
 * сервер в конце; не прошёл — одна повторная попытка со списком замечаний.
 */

type Counts = { issues: number; interests: number; facts: number; beliefs: number }
type Event =
  | ({ type: 'progress' } & Counts)
  | { type: 'done'; scenario?: Scenario; repairs: string[]; problems: string[] }
  | { type: 'error' }

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; step: 0 | 1 | 2 | 3 | 4; counts: Counts; retry: boolean }
  | { kind: 'failed' }

const STEPS = ['Модель пишет кейс', 'Алгоритм проверяет структуру', 'Выверяем экономику сделки', 'Аудит играбельности']
const NONE: Counts = { issues: 0, interests: 0, facts: 0, beliefs: 0 }
/** Проверка на сервере занимает миллисекунды; этапы проходят по очереди, чтобы их можно было прочитать. */
const STEP_MS = 380

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function CaseGenerator({
  brief,
  tone,
  emphasis = false,
  onCreated,
}: {
  brief: { sphere: string; topic: string; goal: string }
  tone: Archetype
  /** Подбор не нашёл близкого кейса — тогда создание нового и есть главный путь. */
  emphasis?: boolean
  onCreated: (entry: CustomCase) => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  const empty = !brief.sphere.trim() && !brief.topic.trim() && !brief.goal.trim()

  useEffect(() => () => abort.current?.abort(), [])

  /** Один заход к модели. Возвращает финальное событие или null, если связь оборвалась. */
  const attempt = async (problems: string[] | undefined, retry: boolean, signal: AbortSignal) => {
    setPhase({ kind: 'running', step: 0, counts: NONE, retry })
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...brief, tone, problems }),
      signal,
    })
    if (!res.ok || !res.body) return null
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let last: Event | null = null
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const e = JSON.parse(line) as Event
        if (e.type === 'progress') {
          const { issues, interests, facts, beliefs } = e
          setPhase({ kind: 'running', step: 0, counts: { issues, interests, facts, beliefs }, retry })
        } else {
          last = e
        }
      }
    }
    return last
  }

  const run = async () => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      let problems: string[] | undefined
      for (let n = 0; n < 2; n++) {
        const result = await attempt(problems, n > 0, controller.signal)
        if (!result || result.type === 'error') break
        if (result.scenario) {
          const scenario = result.scenario
          for (const step of [1, 2, 3, 4] as const) {
            setPhase((p) => (p.kind === 'running' ? { ...p, step } : p))
            await wait(STEP_MS)
          }
          setPhase({ kind: 'idle' })
          onCreated({ scenario, brief, createdAt: Date.now() })
          return
        }
        problems = result.problems
      }
      setPhase({ kind: 'failed' })
    } catch {
      if (!controller.signal.aborted) setPhase({ kind: 'failed' })
    }
  }

  if (phase.kind === 'running') {
    const c = phase.counts
    return (
      <div className="rise mt-4 rounded-md border border-line bg-surface px-4 py-3.5" role="status" aria-live="polite">
        {phase.retry && (
          <p className="mb-3 text-caption leading-snug text-warn">
            Первая версия не прошла проверку — модель пишет заново с учётом замечаний
          </p>
        )}
        <ol className="flex flex-col gap-2.5">
          {STEPS.map((label, i) => {
            const state = i < phase.step ? 'done' : i === phase.step ? 'active' : 'wait'
            return (
              <li key={label} className="flex items-start gap-2.5">
                <StepMark state={state} />
                <div className="min-w-0">
                  <div className={`text-small ${state === 'wait' ? 'text-ink3' : 'text-ink'} ${state === 'active' ? 'font-semibold' : ''}`}>
                    {label}
                  </div>
                  {i === 0 && state === 'active' && (
                    <div className="num mt-0.5 text-caption text-ink3">
                      условия {c.issues} · интересы {c.interests} из 4 · факты {c.facts} · досье {c.beliefs}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {phase.kind === 'failed' && (
        <p className="rise mb-2.5 text-caption leading-snug text-danger" role="status">
          Не получилось собрать играбельный кейс. Выше — ближайший из библиотеки.
        </p>
      )}
      <button
        onClick={run}
        disabled={empty}
        className={`press flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-small font-semibold disabled:border-line disabled:bg-surface disabled:text-ink3 md:h-10 ${
          emphasis
            ? 'border-accent bg-accent text-white hover:opacity-90'
            : 'border-accent-line bg-surface text-accent hover:border-accent hover:bg-accent-soft disabled:hover:bg-surface'
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" />
        </svg>
        {phase.kind === 'failed' ? 'Попробовать ещё раз' : 'Создать новый кейс по описанию'}
      </button>
      {phase.kind === 'idle' && (
        <p className="mt-2 text-caption leading-snug text-ink3">
          Модель напишет кейс под ваше описание, алгоритм проверит его и выверит экономику сделки. Около 30 секунд.
        </p>
      )}
    </div>
  )
}

function StepMark({ state }: { state: 'done' | 'active' | 'wait' }) {
  if (state === 'done') {
    return (
      <span className="step-pop mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-white">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-px shrink-0 animate-spin text-accent" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="var(--color-line)" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  return <span className="mt-px h-[18px] w-[18px] shrink-0 rounded-full border-2 border-line" aria-hidden />
}
