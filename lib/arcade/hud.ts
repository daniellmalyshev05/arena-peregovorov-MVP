import type { NegotiationState, SpeechAct } from '@/lib/types'
import { createInitialState, evaluateOffer } from '@/lib/engine/state'
import { surplus } from '@/lib/engine/utility'
import type { ArcadeOpponent } from './opponents'

/**
 * Полоска соперника — его притязание из движка: сколько выгоды сверх своего
 * запасного варианта он ещё хочет получить. Считается той же функцией, что
 * решает судьбу пакета, только для текущих условий и без изменения состояния.
 * Доля берётся от притязания в начале переговоров.
 */
export function appetite(opponent: ArcadeOpponent, state: NegotiationState): number {
  const s = opponent.scenario
  const now = evaluateOffer(s, state, state.deal).aspiration
  const start = evaluateOffer(s, createInitialState(s), createInitialState(s).deal).aspiration
  return Math.max(0, Math.min(1, now / start))
}

export type StrikeKind = 'question' | 'exchange' | 'criterion' | 'listening' | 'pressure' | 'bluff' | 'concession'

export interface Strike {
  kind: StrikeKind
  good: boolean
  label: string
}

const STRIKE: Partial<Record<SpeechAct, Strike>> = {
  spin_situation: { kind: 'question', good: true, label: 'Вопрос' },
  spin_problem: { kind: 'question', good: true, label: 'Вопрос' },
  spin_implication: { kind: 'question', good: true, label: 'Вопрос' },
  spin_needpayoff: { kind: 'question', good: true, label: 'Вопрос' },
  authority_check: { kind: 'question', good: true, label: 'Вопрос' },
  conditional_offer: { kind: 'exchange', good: true, label: 'Обмен' },
  objective_criterion: { kind: 'criterion', good: true, label: 'Критерий' },
  active_listening: { kind: 'listening', good: true, label: 'Слушание' },
  personal_attack: { kind: 'pressure', good: false, label: 'Давление' },
  positional_bargaining: { kind: 'pressure', good: false, label: 'Давление' },
  bluff: { kind: 'bluff', good: false, label: 'Блеф' },
  unilateral_concession: { kind: 'concession', good: false, label: 'Уступка без условия' },
}

/** Приёмы одной реплики игрока — по разметке движка, без повторов. */
export function strikesOf(acts: SpeechAct[]): Strike[] {
  const seen = new Set<StrikeKind>()
  const out: Strike[] = []
  for (const act of acts) {
    const strike = STRIKE[act]
    if (!strike || seen.has(strike.kind)) continue
    seen.add(strike.kind)
    out.push(strike)
  }
  return out.sort((a, b) => Number(b.good) - Number(a.good))
}

export function lastStrikes(state: NegotiationState): Strike[] {
  const turn = [...state.transcript].reverse().find((t) => t.role === 'user')
  return turn ? strikesOf(turn.acts) : []
}

/** Точные удары за весь разговор. */
export function accurateStrikes(state: NegotiationState): number {
  return state.transcript
    .filter((t) => t.role === 'user')
    .reduce((n, t) => n + strikesOf(t.acts).filter((s) => s.good).length, 0)
}

/** Заряд ульты — раскрытые интересы. */
export function charge(opponent: ArcadeOpponent, state: NegotiationState) {
  return { filled: state.revealedInterests.length, total: opponent.scenario.hiddenInterests.length }
}

/** Выигрыш игрока к запасному варианту по итоговым условиям. */
export function gain(opponent: ArcadeOpponent, state: NegotiationState): number {
  return Math.round(surplus(opponent.scenario, state.deal, 'user'))
}
