import type { Deal, Issue, Scenario, Side } from '@/lib/types'

/** Полезность набора условий для одной стороны, 0..100. */
export function utility(scenario: Scenario, deal: Deal, side: Side): number {
  let total = 0
  for (const issue of scenario.issues) {
    const optionId = deal[issue.id] ?? issue.defaultOptionId
    const option = issue.options.find((o) => o.id === optionId)
    if (!option) continue
    const weight = side === 'user' ? issue.weightUser : issue.weightOpponent
    const value = side === 'user' ? option.valueUser : option.valueOpponent
    total += weight * value
  }
  return round2(total)
}

/** Выигрыш относительно BATNA. Отрицательный — сторона рационально должна выйти. */
export function surplus(scenario: Scenario, deal: Deal, side: Side): number {
  const batna = side === 'user' ? scenario.userBatna.value : scenario.opponentBatna.value
  return round2(utility(scenario, deal, side) - batna)
}

export interface DealPoint {
  deal: Deal
  user: number
  opponent: number
  userSurplus: number
  opponentSurplus: number
  jointSurplus: number
}

/** Полный перебор всех комбинаций уровней. Условий ~6, уровней ~4 — это тысячи вариантов, не миллионы. */
export function enumerateDeals(scenario: Scenario): DealPoint[] {
  const combos: Deal[] = [{}]
  for (const issue of scenario.issues) {
    const next: Deal[] = []
    for (const partial of combos) {
      for (const option of issue.options) {
        next.push({ ...partial, [issue.id]: option.id })
      }
    }
    combos.length = 0
    combos.push(...next)
  }
  return combos.map((deal) => describe(scenario, deal))
}

export function describe(scenario: Scenario, deal: Deal): DealPoint {
  const user = utility(scenario, deal, 'user')
  const opponent = utility(scenario, deal, 'opponent')
  const userSurplus = round2(user - scenario.userBatna.value)
  const opponentSurplus = round2(opponent - scenario.opponentBatna.value)
  return {
    deal,
    user,
    opponent,
    userSurplus,
    opponentSurplus,
    jointSurplus: round2(userSurplus + opponentSurplus),
  }
}

/** Зона возможного соглашения: обе стороны в плюсе относительно своей BATNA. */
export function zopa(points: DealPoint[]): DealPoint[] {
  return points.filter((p) => p.userSurplus >= 0 && p.opponentSurplus >= 0)
}

/** Граница Парето: варианты, которые нельзя улучшить одной стороне, не ухудшив другой. */
export function paretoFrontier(points: DealPoint[]): DealPoint[] {
  const frontier = points.filter(
    (p) => !points.some((q) => q.user >= p.user && q.opponent >= p.opponent && (q.user > p.user || q.opponent > p.opponent)),
  )
  return frontier.sort((a, b) => a.user - b.user)
}

export interface EconomyReport {
  current: DealPoint
  /** Лучший достижимый выигрыш игрока при условии, что оппонент тоже в плюсе. */
  maxUserSurplusInZopa: number
  /** Максимальная совместно созданная ценность. */
  maxJointSurplus: number
  /** Доля созданной ценности от максимально возможной, 0..1. */
  efficiency: number
  /** Сколько совместной ценности осталось на столе. */
  valueLeftOnTable: number
  /** Существовал ли вариант, строго лучший для обеих сторон одновременно. */
  paretoImprovementExisted: boolean
  /** Была ли вообще зона соглашения. Если нет — выход из переговоров является победой. */
  zopaExists: boolean
  frontier: DealPoint[]
  zopaPoints: DealPoint[]
}

export function analyze(scenario: Scenario, deal: Deal): EconomyReport {
  const all = enumerateDeals(scenario)
  const inZopa = zopa(all)
  const frontier = paretoFrontier(all)
  const current = describe(scenario, deal)

  const maxJointSurplus = Math.max(...all.map((p) => p.jointSurplus))
  const maxUserSurplusInZopa = inZopa.length ? Math.max(...inZopa.map((p) => p.userSurplus)) : 0

  const paretoImprovementExisted = all.some(
    (p) =>
      p.user > current.user &&
      p.opponent > current.opponent,
  )

  return {
    current,
    maxUserSurplusInZopa,
    maxJointSurplus,
    efficiency: maxJointSurplus > 0 ? clamp01(current.jointSurplus / maxJointSurplus) : 0,
    valueLeftOnTable: round2(Math.max(0, maxJointSurplus - current.jointSurplus)),
    paretoImprovementExisted,
    zopaExists: inZopa.length > 0,
    frontier,
    zopaPoints: inZopa,
  }
}

/** Стартовый набор условий — статус-кво, то есть открывающая позиция оппонента. */
export function initialDeal(scenario: Scenario): Deal {
  const deal: Deal = {}
  for (const issue of scenario.issues) deal[issue.id] = issue.defaultOptionId
  return deal
}

export function optionOf(issue: Issue, optionId: string) {
  return issue.options.find((o) => o.id === optionId) ?? issue.options[0]
}

/**
 * Направление изменения условия с точки зрения игрока.
 * Нужно, чтобы отличить уступку от встречного требования без участия LLM.
 */
export function shiftDirection(issue: Issue, from: string, to: string): 'gain' | 'concession' | 'neutral' {
  const a = optionOf(issue, from).valueUser
  const b = optionOf(issue, to).valueUser
  if (b > a) return 'gain'
  if (b < a) return 'concession'
  return 'neutral'
}

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
