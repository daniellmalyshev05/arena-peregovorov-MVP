'use client'

import type { NegotiationState, Scenario } from '@/lib/types'
import type { ScoreReport } from '@/lib/engine/scoring'
import { analyze, optionOf, utility } from '@/lib/engine/utility'
import { signed } from '@/lib/text'

/**
 * Развилка: две реальности рядом.
 *
 * Пометка «тренировочная сессия» намеренная: результат после отката
 * не идёт в зачёт, иначе профиль переговорщика теряет смысл.
 *
 * Зелёным подсвечена та ветка, которая действительно вышла лучше, —
 * если переигрывание оказалось хуже, акцент остаётся у первой попытки.
 */
export function Compare({
  scenario,
  baseline,
  branch,
  replayedLine,
  onRewindAnother,
}: {
  scenario: Scenario
  baseline: { state: NegotiationState; score: ScoreReport }
  branch: { state: NegotiationState; score: ScoreReport }
  replayedLine: { before: string; after: string }
  onRewindAnother: () => void
}) {
  const batna = scenario.userBatna.value
  // Без соглашения итог — запасной вариант, а не статус-кво условий на столе.
  // Раньше версия с выходом из переговоров показывала выигрыш по условиям,
  // которые никто не подписывал.
  const agreed = (s: NegotiationState) => s.status === 'deal' || s.status === 'active'
  const pct = (s: NegotiationState) =>
    agreed(s) ? Math.round(((utility(scenario, s.deal, 'user') - batna) / batna) * 100) : 0
  const eff = (s: NegotiationState) => (agreed(s) ? Math.round(analyze(scenario, s.deal).efficiency * 100) : 0)

  const better = pct(branch.state) > pct(baseline.state)
  const worse = pct(branch.state) < pct(baseline.state)

  const column = (
    label: string,
    s: NegotiationState,
    line: string,
    isBranch: boolean,
    other: NegotiationState,
    delay: number,
  ) => {
    // Акцент достаётся лучшему исходу, а не всегда переигранному.
    const leads = better ? isBranch : worse ? !isBranch : false
    return (
      <div
        className="rise flex flex-col gap-[18px] rounded-lg bg-surface px-5 py-5 sm:px-6 sm:py-[22px]"
        style={{
          animationDelay: `${delay}ms`,
          border: leads ? '1.5px solid var(--color-accent)' : '1px solid var(--color-line)',
          boxShadow: leads ? '0 6px 28px rgba(30,92,65,0.09)' : undefined,
        }}
      >
        <div className={`lbl ${leads ? 'text-accent' : ''}`}>{label}</div>

        <div
          className={`border-l-2 pl-3.5 leading-relaxed ${
            isBranch ? 'border-ink3' : 'border-line text-ink2'
          } ${leads ? 'border-accent' : ''}`}
        >
          {line ? `«${line}»` : <span className="text-ink3">Выход из переговоров</span>}
        </div>

        <div className="flex flex-col">
          {scenario.issues.map((issue) => {
            const mine = optionOf(issue, s.deal[issue.id])
            const theirs = optionOf(issue, other.deal[issue.id])
            const changed = isBranch && mine.id !== theirs.id
            return (
              <div
                key={issue.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line2 py-[9px] last:border-0"
              >
                <span className="text-small text-ink2">{issue.label}</span>
                <span className="num flex flex-wrap items-baseline justify-end gap-x-[7px] text-right text-small">
                  {changed && (
                    <span className="text-ink3 line-through decoration-line-strong">{theirs.label}</span>
                  )}
                  <span
                    className={
                      changed
                        ? `font-semibold ${leads ? 'text-accent' : 'text-ink'}`
                        : s.deal[issue.id] === issue.defaultOptionId
                          ? 'text-ink3'
                          : ''
                    }
                  >
                    {mine.label}
                  </span>
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-auto border-t border-line pt-4">
          <div className="mb-[7px] flex items-baseline justify-between gap-3">
            <span className="text-small text-ink2">Выигрыш к запасному варианту</span>
            <span
              className={`num text-title font-semibold ${
                pct(s) < 0 ? 'text-danger' : leads ? 'text-accent' : 'text-ink'
              }`}
            >
              {signed(pct(s), 0)}%
            </span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-line2">
            <div
              className={`h-[5px] rounded-full ${pct(s) < 0 ? 'bg-danger' : leads ? 'bg-accent' : 'bg-ink3'}`}
              style={{ width: `${Math.max(2, Math.min(100, ((utility(scenario, s.deal, 'user') - batna + 22) / 55) * 100))}%` }}
            />
          </div>
          <div className="mt-3 text-caption text-ink2">
            Совместная ценность использована на <span className="num font-semibold">{eff(s)}%</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="flex h-dvh flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-semibold">Развилка</span>
          <span className="text-ink3">·</span>
          <span className="truncate text-small text-ink2">момент переигран</span>
        </div>
        <span className="flex h-7 shrink-0 items-center gap-[7px] rounded-sm bg-line2 px-2.5 text-caption text-ink2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /></svg>
          <span className="hidden sm:inline">Тренировочная сессия — в зачёт не идёт</span>
          <span className="sm:hidden">Не в зачёт</span>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-14">
        <div className="mx-auto max-w-[1180px]">
          <div className="rise max-w-[780px]">
            <div className="lbl mb-2.5">Тот же момент — два исхода</div>
            <h1 className="text-h2 font-semibold tracking-[-0.016em] text-balance">
              {better
                ? 'Другая формулировка изменила экономику сделки'
                : 'Вторая версия вышла не лучше первой'}
            </h1>
            <p className="mt-3 text-body leading-relaxed text-ink2">
              Весь стол был возвращён к тому же раунду: настроение второй стороны, раскрытые
              интересы, условия в соглашении. Изменилось только то, что вы сказали дальше.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">
            {column('Первая версия', baseline.state, replayedLine.before, false, branch.state, 120)}
            {column('Вторая версия', branch.state, replayedLine.after, true, baseline.state, 220)}
          </div>

          <div className="rise mt-6 flex flex-wrap items-center gap-3.5 pb-6" style={{ animationDelay: '320ms' }}>
            <a
              href="/"
              className="press flex h-[42px] items-center rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
            >
              Начать зачётную сессию заново
            </a>
            <button
              onClick={onRewindAnother}
              className="press flex h-[42px] items-center rounded-md border border-line bg-surface px-5 text-ink2 hover:border-accent-line"
            >
              Переиграть другой момент
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
