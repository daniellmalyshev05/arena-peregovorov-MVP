'use client'

import { useMemo } from 'react'
import type { Scenario } from '@/lib/types'
import { enumerateDeals, paretoFrontier } from '@/lib/engine/utility'

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
    return { cloud: all.filter((_, i) => i % step === 0), frontier: paretoFrontier(all) }
  }, [scenario])

  const x = (v: number) => M.left + (v / 100) * (W - M.left - M.right)
  const y = (v: number) => H - M.bottom - (v / 100) * (H - M.top - M.bottom)
  const uB = scenario.userBatna.value
  const oB = scenario.opponentBatna.value

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label="Карта достижимых соглашений: чем выше сложность, тем уже зона, где выигрывают обе стороны">
      <rect x={x(oB)} y={y(100)} width={Math.max(0, x(100) - x(oB))} height={Math.max(0, y(uB) - y(100))}
        fill="var(--color-accent-soft)" opacity="0.6" />

      {model.cloud.map((p, i) => (
        <circle key={i} cx={x(p.opponent)} cy={y(p.user)} r="1.4" fill="var(--color-line)" />
      ))}

      <polyline points={model.frontier.map((p) => `${x(p.opponent)},${y(p.user)}`).join(' ')}
        fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" opacity="0.6" />

      <line x1={M.left} x2={W - M.right} y1={y(uB)} y2={y(uB)} stroke="var(--color-ink3)" strokeWidth="1" strokeDasharray="4 4" />
      <line x1={x(oB)} x2={x(oB)} y1={M.top} y2={H - M.bottom} stroke="var(--color-ink3)" strokeWidth="1" strokeDasharray="4 4" />

      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--color-line)" />
      <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="var(--color-line)" />
      <text x={(W + M.left) / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--color-ink3)">
        выигрыш оппонента →
      </text>
      <text x="10" y={(H - M.bottom + M.top) / 2} fontSize="10" textAnchor="middle" fill="var(--color-ink3)"
        transform={`rotate(-90 10 ${(H - M.bottom + M.top) / 2})`}>
        выигрыш игрока →
      </text>
    </svg>
  )
}
