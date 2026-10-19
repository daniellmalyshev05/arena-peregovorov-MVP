'use client'

import { useEffect } from 'react'
import type { NegotiationState, Scenario } from '@/lib/types'
import { optionOf } from '@/lib/engine/utility'
import { IconClose, IconLock } from './icons'

/**
 * Задача игрока: роль, цель и условия на столе — сейчас и как лучше для него.
 * Лучший уровень — это интерес самого игрока, а не секрет соперника.
 * На старте карточка закрывается кнопкой, в игре — крестиком.
 */
export function Brief({
  scenario,
  state,
  mode,
  onClose,
}: {
  scenario: Scenario
  state: NegotiationState
  mode: 'start' | 'help'
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hidden = scenario.issues.filter((i) => !state.visibleIssues.includes(i.id)).length

  return (
    <div className="arc-scrim" onClick={mode === 'help' ? onClose : undefined}>
      <section className="arc-brief" role="dialog" aria-modal="true" aria-labelledby="arc-brief-title" onClick={(e) => e.stopPropagation()}>
        <div className="arc-brief-head">
          <h2 id="arc-brief-title">Ваша задача</h2>
          {mode === 'help' && (
            <button type="button" className="arc-round-btn" aria-label="Закрыть" onClick={onClose}>
              <IconClose size={18} />
            </button>
          )}
        </div>
        <p className="arc-brief-role">{scenario.userRole}</p>
        <p className="arc-brief-goal">{scenario.userGoal}</p>

        <table className="arc-brief-table">
          <caption>На столе</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Условие</span>
              </th>
              <th scope="col">сейчас</th>
              <th scope="col">лучше для вас</th>
            </tr>
          </thead>
          <tbody>
            {scenario.issues
              .filter((i) => state.visibleIssues.includes(i.id))
              .map((issue) => {
                const best = issue.options.reduce((a, b) => (b.valueUser > a.valueUser ? b : a))
                return (
                  <tr key={issue.id}>
                    <th scope="row">{issue.label}</th>
                    <td>{optionOf(issue, state.deal[issue.id]).label}</td>
                    <td className="arc-brief-best">{best.label}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>

        {hidden > 0 && (
          <p className="arc-brief-hidden">
            <IconLock size={16} />
            Ещё одно условие скрыто
          </p>
        )}

        {mode === 'start' && (
          <button type="button" className="arc-btn-main arc-brief-go" onClick={onClose} autoFocus>
            Начать переговоры
          </button>
        )}
      </section>
    </div>
  )
}
