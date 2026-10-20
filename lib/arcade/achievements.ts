import type { NegotiationState } from '@/lib/types'
import type { ArcadeOpponent } from './opponents'
import { strikesOf } from './hud'

/**
 * Ачивки за одну партию аркады. Считаются только по итогу: движок и рекорды
 * не меняются. Порядок — от редкой к частой: если заработано больше трёх,
 * на экран попадают три самые редкие.
 */
export type AchievementId = 'all_revealed' | 'first_package' | 'no_concession' | 'blitz' | 'record' | 'no_pressure'

export interface Achievement {
  id: AchievementId
  label: string
}

const LABEL: Record<AchievementId, string> = {
  all_revealed: 'Видит насквозь',
  first_package: 'С первого пакета',
  no_concession: 'Без единой уступки',
  blitz: 'Блиц',
  record: 'Новый рекорд',
  no_pressure: 'Без давления',
}

/** Игровое время сделки для «Блица»: таймер стоит, пока отвечает сервер. */
export const BLITZ_SECONDS = 30
const SHOWN = 3

export function achievements(input: {
  opponent: ArcadeOpponent
  state: NegotiationState
  deal: boolean
  /** Игровое время партии в секундах. */
  seconds: number
  /** Лучшее время у этого соперника до этой партии. */
  previousBest?: number
}): Achievement[] {
  const { opponent, state, deal, seconds, previousBest } = input
  const userTurns = state.transcript.filter((t) => t.role === 'user')
  const packages = userTurns.filter((t) => t.verdict)
  const total = opponent.scenario.hiddenInterests.length
  const time = Math.round(seconds)

  const earned: Record<AchievementId, boolean> = {
    all_revealed: total > 0 && state.revealedInterests.length >= total,
    first_package: deal && packages.length === 1,
    no_concession:
      deal && state.unilateralConcessions === 0 && !userTurns.some((t) => t.acts.includes('unilateral_concession')),
    blitz: deal && time < BLITZ_SECONDS,
    // Первая сделка у соперника — ещё не рекорд: побить нужно своё прежнее время.
    record: deal && previousBest !== undefined && time < previousBest,
    no_pressure:
      userTurns.length >= 2 &&
      !userTurns.some((t) => strikesOf(t.acts).some((s) => s.kind === 'pressure' || s.kind === 'bluff')),
  }

  return (Object.keys(LABEL) as AchievementId[])
    .filter((id) => earned[id])
    .slice(0, SHOWN)
    .map((id) => ({ id, label: LABEL[id] }))
}
