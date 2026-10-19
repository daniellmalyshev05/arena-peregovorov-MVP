'use client'

import { useEffect, useState } from 'react'
import type { Deal, NegotiationState, Scenario } from '@/lib/types'
import { IconClose } from './icons'

/**
 * Пакет одним экраном: по строке на условие, три уровня кнопками. Стартует с
 * текущих условий или со встречного предложения соперника, если оно на столе.
 */
export function OfferPad({
  scenario,
  state,
  onClose,
  onSend,
}: {
  scenario: Scenario
  state: NegotiationState
  onClose: () => void
  onSend: (offer: Deal) => void
}) {
  const visible = scenario.issues.filter((i) => state.visibleIssues.includes(i.id))
  const [draft, setDraft] = useState<Deal>(() => ({ ...state.deal, ...(state.standingCounter ?? {}) }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const offer = Object.fromEntries(visible.map((i) => [i.id, draft[i.id]]))

  return (
    <div className="arc-scrim" onClick={onClose}>
      <div className="arc-pad" role="dialog" aria-modal="true" aria-labelledby="arc-pad-title" onClick={(e) => e.stopPropagation()}>
        <div className="arc-pad-head">
          <h2 id="arc-pad-title">Ваш пакет</h2>
          <button type="button" className="arc-round-btn" aria-label="Закрыть" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </div>
        {visible.map((issue) => (
          <fieldset key={issue.id} className="arc-pad-row">
            <legend>{issue.label}</legend>
            <div>
              {issue.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={draft[issue.id] === o.id}
                  onClick={() => setDraft((d) => ({ ...d, [issue.id]: o.id }))}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <button type="button" className="arc-btn-main arc-pad-send" onClick={() => onSend(offer)}>
          Отправить пакет
        </button>
      </div>
    </div>
  )
}
