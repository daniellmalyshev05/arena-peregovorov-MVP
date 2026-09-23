import type { Scenario } from '@/lib/types'
import { describe, enumerateDeals, initialDeal, paretoFrontier, zopa, type DealPoint } from './utility'

/**
 * Аудит играбельности сценария: есть ли в кейсе чему учиться — существует ли
 * зона соглашения, наказывается ли позиционный торг, есть ли разрыв приоритетов,
 * не устраивает ли статус-кво обе стороны сразу.
 *
 * То же ядро работает в админке. Считается перебором, детерминированно, без сети.
 */

export type AuditSeverity = 'blocker' | 'warning'

export interface AuditIssue {
  severity: AuditSeverity
  text: string
}

export interface AuditReport {
  playable: boolean
  issues: AuditIssue[]

  /** Доля вариантов, где обе стороны в плюсе относительно своих альтернатив. */
  zopaShare: number
  zopaCount: number
  totalDeals: number

  statusQuo: DealPoint
  /** Что будет, если торговаться только тем, что видно с самого начала. */
  positional: DealPoint
  bestJoint: DealPoint
  bestForUser?: DealPoint
  maxJointSurplus: number

  /** Условие, которое игроку дёшево отдать, а оппоненту дорого получить. */
  cheapestToGive: { label: string; gap: number }
  /** Условие, которое игроку важнее всего удержать. */
  mostImportantToHold: { label: string; gap: number }
  /** Есть ли золото среди скрытых условий — иначе разведка бессмысленна. */
  hiddenGold: boolean

  frontier: DealPoint[]
}

export function auditScenario(scenario: Scenario): AuditReport {
  const all = enumerateDeals(scenario)
  const inZopa = zopa(all)
  const frontier = paretoFrontier(all)
  const statusQuo = describe(scenario, initialDeal(scenario))
  const bestJoint = all.reduce((a, b) => (b.jointSurplus > a.jointSurplus ? b : a))
  const bestForUser = inZopa.length ? inZopa.reduce((a, b) => (b.userSurplus > a.userSurplus ? b : a)) : undefined

  // Позиционный торг: отдать оппоненту всё по видимым условиям, не открыв ни одного скрытого.
  const caving = { ...initialDeal(scenario) }
  for (const i of scenario.issues.filter((x) => x.visibleFromStart)) {
    caving[i.id] = i.options.reduce((a, b) => (b.valueOpponent > a.valueOpponent ? b : a)).id
  }
  const positional = describe(scenario, caving)

  const gaps = scenario.issues
    .map((i) => ({ label: i.label, gap: round2(i.weightOpponent - i.weightUser) }))
    .sort((a, b) => b.gap - a.gap)

  const hiddenGold = scenario.issues
    .filter((i) => !i.visibleFromStart)
    .some((i) => i.weightOpponent - i.weightUser > 0.08)

  const wu = scenario.issues.reduce((a, i) => a + i.weightUser, 0)
  const wo = scenario.issues.reduce((a, i) => a + i.weightOpponent, 0)

  const issues: AuditIssue[] = []
  const blocker = (text: string) => issues.push({ severity: 'blocker', text })
  const warn = (text: string) => issues.push({ severity: 'warning', text })

  if (Math.abs(wu - 1) > 0.001) blocker(`Веса игрока не нормированы: ${wu.toFixed(3)} вместо 1,000`)
  if (Math.abs(wo - 1) > 0.001) blocker(`Веса оппонента не нормированы: ${wo.toFixed(3)} вместо 1,000`)
  if (!inZopa.length) blocker('Зоны соглашения не существует: договориться нельзя ни на каких условиях')
  if (positional.userSurplus >= 0) blocker('Позиционный торг не наказывается — играть можно не думая')
  if (!hiddenGold) blocker('Среди скрытых условий нет дешёвого для игрока и дорогого для оппонента — разведка бессмысленна')

  if (inZopa.length && inZopa.length / all.length > 0.6) {
    warn('Зона соглашения слишком широкая: договориться получится почти любым способом')
  }
  if (statusQuo.userSurplus > 8 && statusQuo.opponentSurplus > 0) {
    warn('Статус-кво устраивает обе стороны — двигаться никому не нужно')
  }
  if (bestJoint.jointSurplus < 15) {
    warn('Создавать почти нечего: взаимной выгоды в кейсе мало')
  }
  if (Math.max(...gaps.map((g) => Math.abs(g.gap))) < 0.1) {
    warn('Приоритеты сторон почти совпадают — обмену условиями неоткуда взяться')
  }

  return {
    playable: !issues.some((i) => i.severity === 'blocker'),
    issues,
    zopaShare: all.length ? inZopa.length / all.length : 0,
    zopaCount: inZopa.length,
    totalDeals: all.length,
    statusQuo,
    positional,
    bestJoint,
    bestForUser,
    maxJointSurplus: bestJoint.jointSurplus,
    cheapestToGive: gaps[0],
    mostImportantToHold: gaps[gaps.length - 1],
    hiddenGold,
    frontier,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
