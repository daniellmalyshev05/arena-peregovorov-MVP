'use client'

import { useEffect, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { loadRuns, patterns, suggestScenario, type RunRecord } from '@/lib/profile'
import { loadConfig } from '@/lib/admin/storage'
import { DIFFICULTY_LABELS } from '@/lib/admin/config'
import { count } from '@/lib/plural'
import { Mark } from './Mark'
import { Portrait } from './Portrait'

/**
 * Как это работает — тремя шагами на первом экране, рядом с кнопкой «Начать».
 * Вместо модального онбординга.
 */
const STEPS = [
  {
    title: 'Спрашивайте',
    detail: 'Интересы второй стороны закрыты. Верный вопрос открывает интерес — и вместе с ним новое условие сделки.',
  },
  {
    title: 'Собирайте пакет',
    detail: 'Условия предлагаются пакетом. Ещё до отправки видно, что вы отдаёте и что просите взамен.',
  },
  {
    title: 'Возвращайтесь',
    detail: 'После разбора любой раунд можно вернуть и сказать иначе. Две версии сделки встанут рядом.',
  },
]

const SKILLS: Record<string, string> = {
  'resident-attraction': 'отделять интересы от позиции',
  'contractor-delay': 'менять ресурс на обязательство',
  'resident-default': 'сравнивать сделку с отказом',
  'supplier-hike': 'собирать пакет вместо торга о цене',
  'it-budget': 'искать, что стоит за цифрой',
  'retention-offer': 'торговаться не только деньгами',
  'client-discount': 'продавать ценность вместо скидки',
}

export function HallView({ scenarios }: { scenarios: Scenario[] }) {
  const [runs, setRuns] = useState<RunRecord[]>([])
  // Если для кейса есть настройка администратора, холл помечает это на карточке.
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
  // Куда ведёт главная кнопка: рекомендованный кейс, иначе первый непройденный,
  // иначе первый в библиотеке.
  const entry = suggested ?? scenarios.find((s) => best(s.id) === null) ?? scenarios[0]

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-[900px] px-6 py-12 sm:px-8 sm:py-16">
        <div className="rise flex items-center gap-2.5">
          <Mark size={24} animate />
          <span className="text-lead font-semibold tracking-[0.01em]">Арена</span>
          <a
            href="/how"
            className="press ml-auto flex min-h-11 items-center gap-1.5 rounded-md px-2 text-small text-ink3 hover:bg-line2 hover:text-ink2 md:min-h-0 md:py-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 013.9-.8c1 .9.8 2.1-.2 2.8-.7.5-1.3.9-1.3 1.9" /><path d="M12 17h.01" />
            </svg>
            Как это устроено
          </a>
          <a
            href="/admin"
            className="press flex min-h-11 items-center gap-1.5 rounded-md px-2 text-small text-ink3 hover:bg-line2 hover:text-ink2 md:min-h-0 md:py-1"
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

        {/* Одна главная кнопка входа вместо выбора из списка кейсов. */}
        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
          <a
            href={`/arena/${entry.id}`}
            className="press flex h-12 items-center gap-2.5 rounded-md bg-accent px-6 font-semibold text-white hover:bg-accent/92"
          >
            {scored.length ? 'Продолжить' : 'Начать переговоры'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
          <span className="text-small text-ink2">
            {entry.title} · {entry.persona.name}, {entry.persona.role}
          </span>
        </div>

        {/* Подсказка для первого визита: что делать, сколько займёт, чем закончится. */}
        {scored.length === 0 && (
          <p className="rise mt-4 max-w-[580px] text-small leading-relaxed text-ink2 text-pretty">
            Если вы здесь впервые — нажмите кнопку выше, настраивать ничего не нужно. Партия занимает
            пять-десять минут и заканчивается разбором: где вы отдали лишнее и что можно было сказать
            иначе.
          </p>
        )}

        <ul className="mt-9 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line pt-7 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rise flex gap-3" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span className="num mt-[3px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-caption font-semibold text-accent">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{s.title}</span>
                <span className="mt-1 block text-small leading-snug text-ink2 text-pretty">{s.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Модель играет человека, исход считает код — на первом экране, не только в справке. */}
        <div className="rise mt-9 rounded-lg border border-accent-line bg-accent-soft px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-lead font-semibold text-balance">
            Исход переговоров считает код
          </p>
          <p className="mt-2 max-w-[640px] text-small leading-relaxed text-ink2 text-pretty">
            У каждого условия свой вес, у обеих сторон — свой запасной вариант. Выгодность вашего
            пакета для второй стороны считается до того, как модель увидит ход: она получает
            решение готовым и может только сказать его словами. Модель играет человека напротив —
            характер, интонацию, реакцию. Баллов она не ставит.
          </p>
          <a
            href="/how"
            className="press mt-2 inline-flex min-h-11 items-center gap-1.5 text-small font-semibold text-accent hover:underline md:mt-3 md:min-h-0"
          >
            Как считается результат
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </div>

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
