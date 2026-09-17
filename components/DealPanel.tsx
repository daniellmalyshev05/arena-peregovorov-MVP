'use client'

import type { NegotiationState, Scenario } from '@/lib/types'
import { optionOf, utility } from '@/lib/engine/utility'

/**
 * Правая колонка: проект соглашения.
 *
 * Показывает ВСЕ условия сценария, а не только открытые. Серые строки
 * «не обсуждалось» — это карта неисследованной территории: игрок видит,
 * сколько ещё можно вытащить в разговор, но не видит, что там.
 */
export function DealPanel({
  scenario,
  state,
  previousDeal,
  newIssues,
  tab,
  onTab,
  onCompose,
  className = '',
  children,
}: {
  scenario: Scenario
  state: NegotiationState
  previousDeal: Record<string, string>
  newIssues: string[]
  tab: 'deal' | 'dossier'
  onTab: (t: 'deal' | 'dossier') => void
  onCompose: () => void
  className?: string
  children?: React.ReactNode
}) {
  const settled = scenario.issues.filter(
    (i) => state.visibleIssues.includes(i.id) && state.deal[i.id] !== i.defaultOptionId,
  ).length

  const u = utility(scenario, state.deal, 'user')
  const batna = scenario.userBatna.value
  const gainPct = Math.round(((u - batna) / batna) * 100)
  const fill = Math.max(2, Math.min(100, ((u - batna + 22) / 55) * 100))
  const zeroAt = (22 / 55) * 100

  const noted = state.hypotheses.length

  return (
    <aside className={`min-h-0 flex-col border-l border-line bg-surface ${className || 'flex'}`}>
      <div className="flex h-[46px] shrink-0 items-center gap-5 border-b border-line px-4 lg:px-[18px]">
        <button
          onClick={() => onTab('deal')}
          className={`relative flex h-[46px] items-center text-small font-semibold transition-colors ${
            tab === 'deal' ? 'text-ink' : 'text-ink3 hover:text-ink2'
          }`}
        >
          Соглашение
          {tab === 'deal' && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
        </button>
        <button
          onClick={() => onTab('dossier')}
          className={`relative flex h-[46px] items-center gap-[7px] text-small transition-colors ${
            tab === 'dossier' ? 'font-semibold text-ink' : 'text-ink3 hover:text-ink2'
          }`}
        >
          Досье
          {noted > 0 && (
            <span className="num flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-line px-[5px] text-label font-semibold text-ink2">
              {noted}
            </span>
          )}
          {tab === 'dossier' && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
        </button>
        {tab === 'deal' && (
          <span className="num ml-auto whitespace-nowrap text-caption text-ink3">
            согласовано {settled} из {scenario.issues.length}
          </span>
        )}
      </div>

      {tab === 'dossier' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {scenario.issues.map((issue) => {
            const open = state.visibleIssues.includes(issue.id)
            const isNew = newIssues.includes(issue.id)

            if (!open) {
              return (
                <div
                  key={issue.id}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-line2 px-4 py-3 lg:px-[18px]"
                >
                  <span className="text-small text-ink3">{issue.label}</span>
                  <span className="whitespace-nowrap border-b border-dashed border-line-strong text-caption text-ink3">
                    не обсуждалось
                  </span>
                </div>
              )
            }

            const current = optionOf(issue, state.deal[issue.id])
            const prevId = previousDeal[issue.id]
            const prev = prevId && prevId !== current.id ? optionOf(issue, prevId) : undefined

            return (
              <div
                key={issue.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-b border-line2 px-4 py-3 lg:px-[18px] ${
                  isNew ? 'term-enter bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]' : ''
                }`}
              >
                <span className="flex flex-wrap items-center gap-2 text-small">
                  {issue.label}
                  {isNew && (
                    <span className="lbl rounded-sm border border-accent-line px-[5px] py-px text-accent">новое</span>
                  )}
                </span>
                <span className="num flex items-baseline justify-end gap-[7px] text-right text-small text-balance">
                  {prev && (
                    <span className="text-ink3 line-through decoration-danger">{prev.label}</span>
                  )}
                  {prev && <span className="text-ink3">→</span>}
                  <span className="font-semibold">{current.label}</span>
                </span>
              </div>
            )
          })}

          <p className="px-4 py-[14px] text-caption leading-snug text-ink3 lg:px-[18px]">
            Новые условия появляются здесь, когда вы выводите их в разговор.
          </p>
        </div>
      )}

      <div className="shrink-0 border-t border-line px-4 pb-[18px] pt-4 lg:px-[18px]">
        <div className="mb-[6px] flex items-baseline justify-between gap-3">
          <span className="text-small">Ваш выигрыш к запасному варианту</span>
          <span className={`num text-small font-semibold ${gainPct < 0 ? 'text-danger' : 'text-accent'}`}>
            {gainPct >= 0 ? '+' : ''}
            {gainPct}%
          </span>
        </div>
        <div className="relative h-[5px] overflow-hidden rounded-full bg-line2">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${
              gainPct < 0 ? 'bg-danger' : 'bg-accent'
            }`}
            style={{ width: `${fill}%` }}
          />
          <div className="absolute -inset-y-0.5 w-[1.5px] bg-ink2" style={{ left: `${zeroAt}%` }} />
        </div>

        <div className="mb-[6px] mt-[14px] flex items-baseline justify-between gap-3">
          <span className="text-small text-ink2">Выигрыш второй стороны</span>
          <span className="whitespace-nowrap text-caption text-ink3">
            {state.revealedInterests.length ? 'известен частично' : 'пока неизвестен'}
          </span>
        </div>
        <div
          className="h-[5px] rounded-full"
          style={{
            background:
              'repeating-linear-gradient(115deg, var(--color-line2) 0 5px, var(--color-paper) 5px 10px)',
          }}
        />

        <button
          onClick={onCompose}
          disabled={state.visibleIssues.length < 2 || state.status !== 'active'}
          className="press mt-[14px] flex h-[42px] w-full items-center justify-center gap-2 rounded-md border border-accent bg-surface font-semibold text-accent hover:bg-accent-soft disabled:border-line disabled:text-ink3 disabled:hover:bg-surface"
        >
          Собрать предложение
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
