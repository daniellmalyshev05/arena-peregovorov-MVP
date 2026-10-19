'use client'

import { useMemo } from 'react'
import type { Scenario } from '@/lib/types'
import { enumerateDeals, paretoFrontier, zopa } from '@/lib/engine/utility'
import { num } from '@/lib/text'

const W = 420
const H = 300
const M = { top: 12, right: 16, bottom: 30, left: 36 }

/**
 * Карта достижимых соглашений для администратора.
 *
 * Здесь нет результата игрока — здесь видно само пространство кейса: облако
 * вариантов, граница возможного и зона, где обе стороны выигрывают. Когда
 * администратор двигает сложность, зона сжимается прямо на глазах.
 */
export function ScenarioMap({ scenario }: { scenario: Scenario }) {
  const model = useMemo(() => {
    const all = enumerateDeals(scenario)
    const step = Math.max(1, Math.floor(all.length / 420))
    return {
      cloud: all.filter((_, i) => i % step === 0),
      frontier: paretoFrontier(all),
      share: all.length ? zopa(all).length / all.length : 0,
    }
  }, [scenario])

  const x = (v: number) => M.left + (v / 100) * (W - M.left - M.right)
  const y = (v: number) => H - M.bottom - (v / 100) * (H - M.top - M.bottom)
  const uB = scenario.userBatna.value
  const oB = scenario.opponentBatna.value

  // Зона и пороги рисуются единичными фигурами и ставятся на место transform:
  // так смена сложности проезжает плавно, а не перескакивает.
  const zoneW = Math.max(0, x(100) - x(oB))
  const zoneH = Math.max(0, y(uB) - y(100))

  return (
    <figure>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`Карта достижимых соглашений. Зона, где выигрывают обе стороны, — ${num(model.share * 100)}% вариантов. Запасной вариант игрока — ${uB}, второй стороны — ${oB} из 100.`}>
      <rect x="0" y="0" width="1" height="1" className="map-shift"
        style={{ transform: `translate(${x(oB)}px, ${y(100)}px) scale(${zoneW}, ${zoneH})` }}
        fill="var(--color-accent-soft)" opacity="0.6" />

      {model.cloud.map((p, i) => (
        <circle key={i} cx={x(p.opponent)} cy={y(p.user)} r="1.4" fill="var(--color-line)" />
      ))}

      <polyline points={model.frontier.map((p) => `${x(p.opponent)},${y(p.user)}`).join(' ')}
        fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" opacity="0.6" />

      <line x1={M.left} x2={W - M.right} y1="0" y2="0" className="map-shift" style={{ transform: `translateY(${y(uB)}px)` }}
        stroke="var(--color-ink3)" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="0" x2="0" y1={M.top} y2={H - M.bottom} className="map-shift" style={{ transform: `translateX(${x(oB)}px)` }}
        stroke="var(--color-ink3)" strokeWidth="1" strokeDasharray="4 4" />

      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--color-line)" />
      <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="var(--color-line)" />
      <text x={(W + M.left) / 2} y={H - 6} fontSize="12" textAnchor="middle" fill="var(--color-ink3)">
        выигрыш оппонента →
      </text>
      <text x="12" y={(H - M.bottom + M.top) / 2} fontSize="12" textAnchor="middle" fill="var(--color-ink3)"
        transform={`rotate(-90 12 ${(H - M.bottom + M.top) / 2})`}>
        выигрыш игрока →
      </text>
    </svg>
    <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink3" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-accent-soft ring-1 ring-accent-line" />
        зона, где выигрывают обе стороны
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t border-dashed border-ink3" />
        запасные варианты сторон
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full bg-accent/60" />
        граница возможного
      </span>
    </figcaption>
    </figure>
  )
}
