'use client'

import { useEffect, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { loadRuns, patterns, suggestScenario, type RunRecord } from '@/lib/profile'
import { loadConfig } from '@/lib/admin/storage'
import { DIFFICULTY_LABELS } from '@/lib/admin/config'
import { count } from '@/lib/plural'
import { Mark } from './Mark'
import { Portrait } from './Portrait'

const SKILLS: Record<string, string> = {
  'resident-attraction': 'отделять интересы от позиции',
  'contractor-delay': 'менять ресурс на обязательство',
  'resident-default': 'вовремя выходить из переговоров',
  'supplier-hike': 'собирать пакет вместо торга о цене',
}

export function HallView({ scenarios }: { scenarios: Scenario[] }) {
  const [runs, setRuns] = useState<RunRecord[]>([])
  // Настройка администратора живёт в браузере и применяется молча. Холл обязан
  // о ней сказать: иначе карточка обещает библиотечный кейс, а внутри открывается
  // настроенный — с другой сложностью, тоном и второй стороной.
  const [tuned, setTuned] = useState<{ id: string; difficulty: number } | null>(null)
  useEffect(() => {
    setRuns(loadRuns())
    const cfg = loadConfig()
    if (cfg) setTuned({ id: cfg.baseScenarioId, difficulty: cfg.difficulty })
  }, [])

  const scored = runs.filter((r) => !r.training)
  const best = (id: string) => {
    const mine = scored.filter((r) => r.scenarioId === id)
    return mine.length ? Math.max(...mine.map((r) => r.total)) : null
  }
  const weak = patterns(runs).find((p) => p.tone === 'weak')
  const suggested = scored.length ? suggestScenario(runs, scenarios) : undefined
  const passed = scenarios.filter((s) => best(s.id) !== null).length

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-[900px] px-6 py-12 sm:px-8 sm:py-16">
        <div className="rise flex items-center gap-2.5">
          <Mark size={24} />
          <span className="text-lead font-semibold tracking-[0.01em]">Арена</span>
          <a
            href="/admin"
            className="press ml-auto flex items-center gap-1.5 rounded-sm px-2 py-1 text-small text-ink3 hover:bg-line2 hover:text-ink2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
            </svg>
            Настройка симуляции
          </a>
        </div>

        <p className="lbl mt-10">Симулятор деловых переговоров</p>
        <h1 className="mt-3.5 max-w-[620px] text-h1 font-semibold tracking-[-0.02em] text-balance">
          Каждая формулировка меняет экономику сделки
        </h1>
        <p className="mt-4 max-w-[580px] text-lead text-ink2 text-pretty">
          Вторая сторона не назовёт свои настоящие интересы — их придётся выяснять вопросами. Только
          после этого можно собрать соглашение, выгодное обеим сторонам. Любой ход можно вернуть и
          переиграть.
        </p>

        {scored.length > 0 && (
          <a
            href="/profile"
            className="press mt-8 flex items-center gap-4 rounded-md border border-line bg-surface px-5 py-4 hover:border-accent-line"
          >
            <span className="min-w-0">
              <span className="lbl mb-1 block">
                Ваш профиль · {count(scored.length, ['сессия', 'сессии', 'сессий'])}
              </span>
              <span className="block truncate text-small">
                {weak ? weak.title : 'Устойчивых слабых мест пока не видно'}
              </span>
            </span>
            <span className="ml-auto shrink-0 text-ink3">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </a>
        )}

        <section className="mt-14">
          <div className="flex items-baseline gap-4 border-b border-line pb-2">
            <h2 className="lbl">Сценарии</h2>
            <span className="lbl ml-auto shrink-0">
              пройдено {passed} из {scenarios.length}
            </span>
          </div>
          <ul>
            {scenarios.map((s, i) => {
              const score = best(s.id)
              const isNext = suggested?.id === s.id
              const done = score !== null
              const first = i === 0
              const last = i === scenarios.length - 1
              return (
                <li key={s.id} className="rise relative border-b border-line/60" style={{ animationDelay: `${60 + i * 60}ms` }}>
                  {scenarios.length > 1 && (
                    <span
                      aria-hidden
                      className={`absolute left-[13px] w-px bg-line ${
                        first ? 'bottom-0 top-1/2' : last ? 'top-0 h-1/2' : 'inset-y-0'
                      }`}
                    />
                  )}
                  <a
                    href={`/arena/${s.id}`}
                    className="press group -mx-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md px-4 py-5 hover:bg-rail"
                  >
                    <span
                      aria-hidden
                      className={`num relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-caption font-semibold transition-colors ${
                        done
                          ? 'border-accent bg-accent text-white'
                          : isNext
                            ? 'border-accent bg-accent-soft text-accent'
                            : 'border-line-strong bg-surface text-ink3'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="hidden shrink-0 sm:block">
                      <Portrait name={s.persona.name} file={s.persona.portrait} size={38} active={isNext} />
                    </span>
                    <span className="min-w-0 flex-1 basis-[17rem]">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-title font-medium tracking-[-0.01em] transition-colors group-hover:text-accent">
                          {s.title}
                        </span>
                        {isNext && (
                          <span className="lbl rounded-sm bg-accent-soft px-1.5 py-0.5 text-accent">рекомендуем</span>
                        )}
                        {tuned?.id === s.id && (
                          <span className="lbl rounded-sm border border-line-strong px-1.5 py-0.5 text-ink3">
                            настроено · {DIFFICULTY_LABELS[tuned.difficulty]?.toLowerCase() ?? 'сложность изменена'}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-small text-ink2">
                        {s.subtitle} · навык: {SKILLS[s.id] ?? 'вести деловые переговоры'}
                      </span>
                      <span className="mt-1.5 block text-caption text-ink3 text-pretty">
                        {s.persona.name} · {s.persona.role}
                      </span>
                    </span>
                    <span className="flex w-full items-center justify-between gap-4 pl-[42px] sm:ml-auto sm:w-auto sm:justify-end sm:pl-0">
                      {score !== null && (
                        <span className="shrink-0 text-left sm:text-right">
                          <span className="mono block text-lead font-semibold leading-none">{score}</span>
                          <span className="lbl mt-1 block">лучший балл</span>
                        </span>
                      )}
                      <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3.5 text-caption font-semibold text-ink2 transition-colors group-hover:border-accent group-hover:bg-accent-soft group-hover:text-accent">
                        {score !== null ? 'ещё раз' : 'начать'}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </main>
  )
}
