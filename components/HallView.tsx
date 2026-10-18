'use client'

import { useEffect, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { loadRuns, patterns, skills, suggestScenario, type RunRecord } from '@/lib/profile'
import { loadConfig } from '@/lib/admin/storage'
import { DIFFICULTY_LABELS, TONES } from '@/lib/admin/config'
import { count } from '@/lib/plural'
import { Mark } from './Mark'
import { Portrait } from './Portrait'
import { SkillMedal } from './SkillMedal'

/**
 * Как это работает — тремя шагами под сценариями. Первый экран отдан людям.
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

/** Номер кейса в прогрессии — на портрете. */
function ProgressBadge({ n, done, next }: { n: number; done: boolean; next: boolean }) {
  return (
    <span
      aria-hidden
      className={`num absolute -left-1 -top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full text-caption font-semibold shadow-[0_0_0_2px_var(--color-surface)] ${
        done ? 'bg-accent text-white' : next ? 'bg-accent-soft text-accent' : 'bg-line2 text-ink3'
      }`}
    >
      {n}
    </span>
  )
}

/** Характер второй стороны, навык кейса и пометки — одной строкой меток. */
function CaseTags({
  scenario,
  tuned,
  recommended,
}: {
  scenario: Scenario
  tuned: { id: string; difficulty: number } | null
  recommended: boolean
}) {
  const tone = TONES.find((t) => t.value === scenario.archetype)?.label
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {recommended && (
        <span className="lbl rounded-full bg-accent-soft px-2 py-0.5 text-accent">рекомендуем</span>
      )}
      <span className="rounded-md border border-line px-2 py-0.5 text-caption text-ink2">
        навык: {SKILLS[scenario.id] ?? 'вести деловые переговоры'}
      </span>
      {tone && <span className="rounded-full bg-line2 px-2 py-0.5 text-caption text-ink2">{tone}</span>}
      {tuned?.id === scenario.id && (
        <span className="lbl rounded-full border border-line-strong px-2 py-0.5 text-ink3">
          настроено · {DIFFICULTY_LABELS[tuned.difficulty]?.toLowerCase() ?? 'сложность изменена'}
        </span>
      )}
    </span>
  )
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
  const skillList = skills(runs)
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

        {/* Следующие переговоры — главный вход: человек, с которым предстоит договориться. */}
        <a
          href={`/arena/${entry.id}`}
          className="rise press group mt-8 flex flex-col gap-5 rounded-lg bg-surface p-5 shadow-[inset_0_0_0_1px_var(--color-accent-line),0_18px_40px_-28px_rgba(30,92,65,0.55)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-accent),0_18px_40px_-24px_rgba(30,92,65,0.6)] sm:flex-row sm:items-center sm:p-6"
        >
          <span className="flex min-w-0 flex-1 items-start gap-4 sm:items-center sm:gap-5">
            <span className="relative shrink-0">
              <span className="sm:hidden">
                <Portrait name={entry.persona.name} file={entry.persona.portrait} size={64} active />
              </span>
              <span className="hidden sm:block">
                <Portrait name={entry.persona.name} file={entry.persona.portrait} size={104} active />
              </span>
              <ProgressBadge n={scenarios.indexOf(entry) + 1} done={best(entry.id) !== null} next />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-caption text-ink3">
                {entry.persona.name} · {entry.persona.role}
              </span>
              <span className="text-title font-semibold tracking-[-0.01em] text-balance sm:text-h2 sm:leading-tight">
                {entry.title}
              </span>
              <span className="mt-0.5 text-small text-ink2 text-pretty">{entry.subtitle}</span>
              <CaseTags scenario={entry} tuned={tuned} recommended={suggested?.id === entry.id} />
            </span>
          </span>
          <span className="flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-md bg-accent px-6 font-semibold text-white transition-colors group-hover:bg-accent/92">
            {scored.length ? 'Продолжить' : 'Начать переговоры'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </a>

        {/* Подсказка для первого визита: что делать, сколько займёт, чем закончится. */}
        {scored.length === 0 && (
          <p className="rise mt-4 max-w-[580px] text-small leading-relaxed text-ink2 text-pretty">
            Если вы здесь впервые — нажмите кнопку выше, настраивать ничего не нужно. Партия занимает
            пять-десять минут и заканчивается разбором: где вы отдали лишнее и что можно было сказать
            иначе.
          </p>
        )}

        {scored.length > 0 && (
          <a
            href="/profile"
            className="rise press mt-3 flex items-center gap-4 rounded-md border border-line bg-surface px-4 py-3 hover:border-accent-line sm:px-5"
          >
            <span aria-hidden className="hidden shrink-0 gap-1.5 sm:flex">
              {skillList.map((k) => (
                <SkillMedal key={k.id} id={k.id} status={k.status} size={26} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="lbl mb-0.5 block">
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

        <section className="mt-12">
          <div className="flex items-baseline gap-4">
            <h2 className="lbl">Сценарии</h2>
            <span className="lbl ml-auto shrink-0">
              пройдено {passed} из {scenarios.length}
            </span>
          </div>
          {/* Люди, с которыми предстоит договориться. Порядок — прогрессия кейсов,
              поэтому номер остаётся на портрете. Следующий кейс вынесен наверх. */}
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scenarios.map((s, i) => {
              if (s.id === entry.id) return null
              const score = best(s.id)
              const isNext = suggested?.id === s.id
              const done = score !== null
              return (
                <li key={s.id} className="rise" style={{ animationDelay: `${60 + i * 50}ms` }}>
                  <a
                    href={`/arena/${s.id}`}
                    className="press group flex h-full flex-col gap-x-5 gap-y-4 rounded-lg bg-surface p-5 shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-accent-line),0_12px_30px_-20px_rgba(30,92,65,0.5)]"
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-4">
                      <span className="relative shrink-0">
                        <Portrait name={s.persona.name} file={s.persona.portrait} size={64} active={isNext} />
                        <ProgressBadge n={i + 1} done={done} next={isNext} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-caption text-ink3">
                          {s.persona.name} · {s.persona.role}
                        </span>
                        <span className="text-title font-medium tracking-[-0.01em] text-balance transition-colors group-hover:text-accent">
                          {s.title}
                        </span>
                        <span className="mt-0.5 text-small text-ink2 text-pretty">{s.subtitle}</span>
                        <CaseTags scenario={s} tuned={tuned} recommended={isNext} />
                      </span>
                    </span>
                    <span className="mt-auto flex items-end justify-between gap-4">
                      {score !== null ? (
                        <span>
                          <span className="mono block text-lead font-semibold leading-none">{score}</span>
                          <span className="lbl mt-1 block">лучший балл</span>
                        </span>
                      ) : (
                        <span />
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

        <ul className="mt-14 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line pt-8 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
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

        {/* Модель играет человека, исход считает код. */}
        <div className="mt-9 rounded-lg border border-accent-line bg-accent-soft px-5 py-4 sm:px-6 sm:py-5">
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
      </div>
    </main>
  )
}
