'use client'

import { useMemo, useState } from 'react'
import type { NegotiationState, Scenario } from '@/lib/types'
import { describe, enumerateDeals, initialDeal, paretoFrontier, utility } from '@/lib/engine/utility'
import { num } from '@/lib/text'
import type { RunRecord } from '@/lib/profile'

const W = 560
const H = 420
const M = { top: 16, right: 24, bottom: 40, left: 48 }

/**
 * Карта арены: где оказалась сделка в пространстве всех возможных соглашений.
 * Опорные точки — стратегии, посчитанные движком на этом же сценарии.
 *
 * Подписи идут с подложкой цвета фона (`.map-label`), чтобы не ложиться
 * на границу возможного и пороги отказа.
 */
export function ArenaMap({
  scenario,
  state,
  history,
}: {
  scenario: Scenario
  state: NegotiationState
  history: RunRecord[]
}) {
  const [asTable, setAsTable] = useState(false)

  const model = useMemo(() => {
    const all = enumerateDeals(scenario)
    const step = Math.max(1, Math.floor(all.length / 600))
    const cloud = all.filter((_, i) => i % step === 0)
    const frontier = paretoFrontier(all)
    const bestJoint = all.reduce((a, b) => (b.jointSurplus > a.jointSurplus ? b : a))

    // Позиционный торг: отдать всё по видимым условиям, не открыв ни одного скрытого.
    const caving = { ...initialDeal(scenario) }
    for (const i of scenario.issues.filter((x) => x.visibleFromStart)) {
      caving[i.id] = i.options.reduce((a, b) => (b.valueOpponent > a.valueOpponent ? b : a)).id
    }
    // Жёсткая линия: не отдать ничего.
    const hard: Record<string, string> = {}
    for (const i of scenario.issues) {
      hard[i.id] = i.options.reduce((a, b) => (b.valueUser > a.valueUser ? b : a)).id
    }

    return {
      cloud,
      frontier,
      refs: [
        { id: 'joint', label: 'максимум совместной ценности', p: bestJoint },
        { id: 'cave', label: 'позиционный торг', p: describe(scenario, caving) },
        { id: 'hard', label: 'жёсткая линия', p: describe(scenario, hard) },
      ],
    }
  }, [scenario])

  const uB = scenario.userBatna.value
  const oB = scenario.opponentBatna.value

  // Без сделки обе стороны остаются при своих запасных вариантах — там и точка.
  const noDeal = state.status !== 'deal'
  const you = noDeal
    ? { user: uB, opponent: oB }
    : { user: utility(scenario, state.deal, 'user'), opponent: utility(scenario, state.deal, 'opponent') }
  const youLabel = noDeal ? 'без сделки' : 'ваша сделка'
  const mine = history
    .filter((r) => r.scenarioId === scenario.id && !r.training)
    .slice(-6)
    .map((r) => (r.status === 'deal' ? r : { ...r, userUtility: uB, opponentUtility: oB }))

  const x = (v: number) => M.left + (v / 100) * (W - M.left - M.right)
  const y = (v: number) => H - M.bottom - (v / 100) * (H - M.top - M.bottom)

  const inZopa = you.user >= uB && you.opponent >= oB
  const youColor = noDeal ? 'var(--color-ink2)' : inZopa ? 'var(--color-accent)' : 'var(--color-danger)'

  if (asTable) {
    return (
      <div>
        <TableToggle on={asTable} onToggle={() => setAsTable(false)} />
        <table className="num w-full text-small">
          <thead>
            <tr className="border-b border-line text-left text-ink3">
              <th className="py-2 font-normal">точка</th>
              <th className="py-2 text-right font-normal">вам</th>
              <th className="py-2 text-right font-normal">второй стороне</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line2 font-semibold">
              <td className="py-2">{youLabel}</td>
              <td className="py-2 text-right">{num(you.user)}</td>
              <td className="py-2 text-right">{num(you.opponent)}</td>
            </tr>
            {model.refs.map((r) => (
              <tr key={r.id} className="border-b border-line2 text-ink2">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right">{num(r.p.user)}</td>
                <td className="py-2 text-right">{num(r.p.opponent)}</td>
              </tr>
            ))}
            <tr className="border-b border-line2 text-ink2">
              <td className="py-2">запасной вариант</td>
              <td className="py-2 text-right">{num(uB)}</td>
              <td className="py-2 text-right">{num(oB)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <TableToggle on={asTable} onToggle={() => setAsTable(true)} />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block w-full"
        style={{ maxHeight: 'min(56vh, 420px)' }}
        role="img"
        aria-label={`Карта сделок. ${noDeal ? 'Без сделки' : 'Ваша сделка'}: ${you.user.toFixed(0)} вам, ${you.opponent.toFixed(0)} второй стороне.`}
      >
        {/* Зона, где обе стороны выигрывают относительно своих альтернатив */}
        <rect
          x={x(oB)} y={y(100)} width={x(100) - x(oB)} height={y(uB) - y(100)}
          fill="var(--color-accent-soft)" opacity="0.55"
        />

        {/* Облако всех достижимых соглашений */}
        {model.cloud.map((p, i) => (
          <circle key={i} cx={x(p.opponent)} cy={y(p.user)} r="1.6" fill="var(--color-line)" />
        ))}

        {/* Граница Парето */}
        <polyline
          points={model.frontier.map((p) => `${x(p.opponent)},${y(p.user)}`).join(' ')}
          fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" opacity="0.55"
        />

        {/* Пороги отказа */}
        <line x1={M.left} x2={W - M.right} y1={y(uB)} y2={y(uB)} stroke="var(--color-ink-faint)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={x(oB)} x2={x(oB)} y1={M.top} y2={H - M.bottom} stroke="var(--color-ink-faint)" strokeWidth="1" strokeDasharray="4 4" />
        <text x={M.left + 4} y={y(uB) - 6} className="map-label" fontSize="10.5" fill="var(--color-ink3)">ваш запасной вариант</text>
        {/* Подпись уходит влево от линии, когда справа для неё нет места. */}
        <text
          x={x(oB) + 168 > W - M.right ? x(oB) - 5 : x(oB) + 5}
          y={M.top + 10}
          textAnchor={x(oB) + 168 > W - M.right ? 'end' : 'start'}
          className="map-label"
          fontSize="10.5"
          fill="var(--color-ink3)"
        >
          запасной вариант второй стороны
        </text>

        {/* Опорные стратегии */}
        {model.refs.map((r) => (
          <g key={r.id}>
            <rect
              x={x(r.p.opponent) - 4} y={y(r.p.user) - 4} width="8" height="8"
              transform={`rotate(45 ${x(r.p.opponent)} ${y(r.p.user)})`}
              fill="var(--color-surface)" stroke="var(--color-ink2)" strokeWidth="1.5"
            >
              <title>{`${r.label}: вам ${num(r.p.user)}, второй стороне ${num(r.p.opponent)}`}</title>
            </rect>
            <text
              className="map-label"
              x={x(r.p.opponent) + (r.id === 'hard' ? 10 : -8)}
              y={y(r.p.user) + (r.id === 'joint' ? -10 : 15)}
              fontSize="10.5" fill="var(--color-ink2)"
              textAnchor={r.id === 'hard' ? 'start' : 'end'}
            >
              {r.label}
            </text>
          </g>
        ))}

        {/* Прошлые попытки */}
        {mine.map((r, i) => (
          <circle key={i} cx={x(r.opponentUtility)} cy={y(r.userUtility)} r="4"
            fill="var(--color-surface)" stroke="var(--color-ink3)" strokeWidth="1.5">
            <title>{`прошлая сессия: ${r.total} из 100`}</title>
          </circle>
        ))}

        {/* Твоя сделка */}
        <g className="map-pop" style={{ transformOrigin: `${x(you.opponent)}px ${y(you.user)}px` }}>
          <circle
            cx={x(you.opponent)} cy={y(you.user)} r="13"
            fill={youColor} opacity="0.14"
          />
          <circle cx={x(you.opponent)} cy={y(you.user)} r="7"
            fill={youColor}
            stroke="var(--color-surface)" strokeWidth="2">
            <title>{`${youLabel}: вам ${num(you.user)}, второй стороне ${num(you.opponent)}`}</title>
          </circle>
          <text x={x(you.opponent)} y={y(you.user) - 17} className="map-label" fontSize="11.5" fontWeight="600"
            textAnchor="middle" fill={youColor}>
            {youLabel}
          </text>
        </g>

        {/* Оси */}
        <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--color-line)" />
        <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="var(--color-line)" />
        <text x={(W + M.left) / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--color-ink3)">
          ценность для второй стороны →
        </text>
        <text x="12" y={(H - M.bottom + M.top) / 2} fontSize="11" textAnchor="middle" fill="var(--color-ink3)"
          transform={`rotate(-90 12 ${(H - M.bottom + M.top) / 2})`}>
          ценность для вас →
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-caption text-ink2">
        <Key>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: youColor }}
          />{' '}
          {youLabel}
        </Key>
        <Key><span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-ink3 bg-surface" /> прошлые сессии</Key>
        <Key><span className="h-2 w-2 rotate-45 border-[1.5px] border-ink2 bg-surface" /> опорные стратегии</Key>
        <Key><span className="h-0.5 w-5" style={{ background: 'var(--color-accent)' }} /> граница возможного</Key>
        <Key><span className="h-2.5 w-4 rounded-sm" style={{ background: 'var(--color-accent-soft)' }} /> обе стороны в выигрыше</Key>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-1.5">{children}</span>
}

function TableToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className="mb-2 flex justify-end">
      <button
        onClick={onToggle}
        className="press flex h-11 items-center rounded-md px-2 text-caption text-ink3 underline decoration-line-strong underline-offset-4 hover:bg-line2 hover:text-ink md:h-7 md:rounded-sm"
      >
        {on ? 'Показать картой' : 'Показать числами'}
      </button>
    </div>
  )
}
