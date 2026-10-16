'use client'

/**
 * Момент подписания: короткая пауза между столом и разбором. Знак
 * дорисовывается, под ним раунд, в котором договорились.
 */
export function DealSeal({ round, maxRounds }: { round: number; maxRounds: number }) {
  return (
    <div role="status" className="scrim-in fixed inset-0 z-50 flex items-center justify-center bg-paper/80 backdrop-blur-sm">
      <div className="sheet-in flex flex-col items-center gap-4 text-center">
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
          <circle cx="48" cy="48" r="42" stroke="var(--color-accent-line)" strokeWidth="2" />
          <circle
            className="seal-ring"
            cx="48"
            cy="48"
            r="42"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
          />
          <path className="seal-check" d="M33 49l10 10 20-21" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex flex-col gap-1">
          <span className="text-h2 font-semibold tracking-[-0.01em]">Сделка подписана</span>
          <span className="num text-small text-ink3">раунд {Math.min(round, maxRounds)} из {maxRounds}</span>
        </div>
      </div>
    </div>
  )
}
