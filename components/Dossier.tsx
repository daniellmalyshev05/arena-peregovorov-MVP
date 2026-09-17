'use client'

import type { NegotiationState, Scenario } from '@/lib/types'

const LEVELS = [
  { label: 'Похоже', value: 0.85 },
  { label: 'Не уверен', value: 0.5 },
  { label: 'Вряд ли', value: 0.15 },
]

/**
 * Досье: модель оппонента, которую игрок строит сам.
 *
 * Утверждения намеренно смешаны — часть из них ловушки. Система нигде
 * не подсказывает, где правда: сверка происходит только в разборе.
 */
export function Dossier({
  scenario,
  state,
  onSetConfidence,
}: {
  scenario: Scenario
  state: NegotiationState
  onSetConfidence: (id: string, confidence: number) => void
}) {
  const revealed = scenario.hiddenInterests.filter((h) => state.revealedInterests.includes(h.id))

  return (
    <div className="px-4 py-4 lg:px-[18px]">
      <div className="lbl mb-1">Гипотезы о второй стороне</div>
      <p className="mb-4 text-caption leading-snug text-ink3">
        Отмечайте по ходу разговора. В разборе оценки сверятся с тем, как было на самом деле.
      </p>

      <div className="flex flex-col">
        {scenario.beliefProbes.map((probe) => {
          const current = state.hypotheses.find((h) => h.id === probe.id)?.confidence
          return (
            <div key={probe.id} className="border-t border-line2 py-[14px]">
              <div className="mb-[9px] text-small leading-snug">{probe.text}</div>
              <div className="flex flex-wrap gap-[5px]">
                {LEVELS.map((l) => {
                  const active = current === l.value
                  return (
                    <button
                      key={l.label}
                      onClick={() => onSetConfidence(probe.id, l.value)}
                      className={`press flex h-7 items-center whitespace-nowrap rounded-sm px-2.5 text-caption ${
                        active
                          ? 'border border-accent bg-accent-soft font-semibold text-accent'
                          : 'border border-line-strong bg-surface text-ink2 hover:border-accent-line hover:bg-rail'
                      }`}
                    >
                      {l.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {revealed.length > 0 && (
        <div className="mt-6">
          <div className="lbl mb-[10px]">Раскрытые интересы</div>
          <div className="flex flex-col gap-2">
            {revealed.map((h) => (
              <div
                key={h.id}
                className="term-enter rounded-md border border-accent-line bg-accent-soft px-3 py-[10px] text-small leading-snug"
              >
                {h.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
