'use client'

import type { NegotiationState, Scenario, SpeechAct } from '@/lib/types'
import type { ScoreReport } from '@/lib/engine/scoring'
import { utility } from '@/lib/engine/utility'

const KEY = 'arena.profile.v1'

export interface RunRecord {
  scenarioId: string
  at: number
  total: number
  userUtility: number
  opponentUtility: number
  status: NegotiationState['status']
  revealed: number
  interests: number
  unilateral: number
  conditional: number
  facts: number
  brier: number | null
  acts: Partial<Record<SpeechAct, number>>
  /** Сессия после отката. Хранится, но в зачёт и в статистику не идёт. */
  training: boolean
}

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRun(run: RunRecord): RunRecord[] {
  const runs = [...loadRuns(), run].slice(-60)
  try {
    localStorage.setItem(KEY, JSON.stringify(runs))
  } catch {
    // Приватный режим или переполненное хранилище — профиль просто не копится.
  }
  return runs
}

export function clearRuns() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* пусто */
  }
}

export function buildRun(
  scenario: Scenario,
  state: NegotiationState,
  score: ScoreReport,
  training: boolean,
): RunRecord {
  const acts: Partial<Record<SpeechAct, number>> = {}
  for (const t of state.transcript) {
    if (t.role !== 'user') continue
    for (const a of t.acts) acts[a] = (acts[a] ?? 0) + 1
  }

  const answered = state.hypotheses.filter((h) => scenario.beliefProbes.some((p) => p.id === h.id))
  const brier = answered.length
    ? answered.reduce((sum, h) => {
        const probe = scenario.beliefProbes.find((p) => p.id === h.id)!
        return sum + (h.confidence - (probe.truth ? 1 : 0)) ** 2
      }, 0) / answered.length
    : null

  return {
    scenarioId: scenario.id,
    at: Date.now(),
    total: score.total,
    userUtility: utility(scenario, state.deal, 'user'),
    opponentUtility: utility(scenario, state.deal, 'opponent'),
    status: state.status,
    revealed: state.revealedInterests.length,
    interests: scenario.hiddenInterests.length,
    unilateral: state.unilateralConcessions,
    conditional: state.conditionalOffers,
    facts: state.playedFacts.length,
    brier,
    acts,
    training,
  }
}

export interface Pattern {
  id: string
  title: string
  detail: string
  tone: 'weak' | 'strong'
}

/**
 * Устойчивые паттерны, а не «уровень 7».
 * Считаются только по зачётным сессиям и только когда их набралось хотя бы два —
 * иначе это не паттерн, а один случай.
 */
export function patterns(runs: RunRecord[]): Pattern[] {
  const scored = runs.filter((r) => !r.training)
  if (scored.length < 2) return []

  const n = scored.length
  const out: Pattern[] = []
  const sum = (f: (r: RunRecord) => number) => scored.reduce((a, r) => a + f(r), 0)
  const act = (a: SpeechAct) => sum((r) => r.acts[a] ?? 0)

  const withUnilateral = scored.filter((r) => r.unilateral > 0).length
  if (withUnilateral / n >= 0.5) {
    out.push({
      id: 'unilateral',
      title: `Уступаете без встречного условия в ${withUnilateral} из ${n} переговоров`,
      detail: 'Самая дорогая привычка: ценность утекает именно здесь. Связывайте уступку с тем, что получаете взамен.',
      tone: 'weak',
    })
  } else if (sum((r) => r.conditional) > sum((r) => r.unilateral) * 2) {
    out.push({
      id: 'exchange',
      title: 'Вы почти всегда просите что-то взамен',
      detail: 'Дисциплина обмена держится стабильно от сессии к сессии.',
      tone: 'strong',
    })
  }

  if (act('spin_implication') === 0) {
    out.push({
      id: 'no_implication',
      title: 'Вы ни разу не спросили о последствиях',
      detail:
        'Вопрос «что произойдёт, если…» заставляет вторую сторону самой назвать цену проблемы. Без него интересы так и остаются закрытыми.',
      tone: 'weak',
    })
  }

  const revealRate = sum((r) => r.revealed) / Math.max(1, sum((r) => r.interests))
  if (revealRate < 0.5) {
    out.push({
      id: 'shallow',
      title: `Вы раскрываете ${Math.round(revealRate * 100)}% скрытых интересов`,
      detail: 'Задавайте больше вопросов до того, как сделаете первое предложение.',
      tone: 'weak',
    })
  } else if (revealRate > 0.75) {
    out.push({
      id: 'digger',
      title: `Вы доходите до ${Math.round(revealRate * 100)}% скрытых интересов`,
      detail: 'Разведка — ваша сильная сторона. Следите, чтобы найденное попадало в предложение.',
      tone: 'strong',
    })
  }

  if (sum((r) => r.facts) / n < 1) {
    out.push({
      id: 'no_facts',
      title: 'Вы почти не используете объективные критерии',
      detail: 'Аргумент, опирающийся на внешний факт, двигает условия сильнее, чем настойчивость.',
      tone: 'weak',
    })
  }

  const briers = scored.map((r) => r.brier).filter((b): b is number => b !== null)
  if (briers.length >= 2) {
    const avg = briers.reduce((a, b) => a + b, 0) / briers.length
    if (avg > 0.3) {
      out.push({
        id: 'calibration',
        title: 'Вы часто уверены там, где не проверяли',
        detail: `Средняя ошибка оценок — ${avg.toFixed(2)}. Не фиксируйте уверенность, пока не получили подтверждение.`,
        tone: 'weak',
      })
    } else if (avg < 0.15) {
      out.push({
        id: 'calibrated',
        title: 'Ваша модель второй стороны точна',
        detail: `Средняя ошибка оценок — ${avg.toFixed(2)}: вы уверены там, где действительно знаете.`,
        tone: 'strong',
      })
    }
  }

  const belowBatna = scored.filter((r) => r.status === 'deal' && r.total < 25).length
  if (belowBatna >= 2) {
    out.push({
      id: 'closer',
      title: `В ${belowBatna} из ${n} сессий сделка вышла хуже отказа`,
      detail: 'Желание договориться перевешивает расчёт. Перед согласием сравнивайте пакет со своим запасным вариантом.',
      tone: 'weak',
    })
  }

  return out
}

/** Какой сценарий стоит пройти следующим — под слабое место, а не по порядку. */
export function suggestScenario(runs: RunRecord[], all: Scenario[]): Scenario | undefined {
  const scored = runs.filter((r) => !r.training)
  const played = new Set(scored.map((r) => r.scenarioId))
  const unplayed = all.find((s) => !played.has(s.id))
  if (unplayed) return unplayed

  const worst = [...scored].sort((a, b) => a.total - b.total)[0]
  return all.find((s) => s.id === worst?.scenarioId)
}
