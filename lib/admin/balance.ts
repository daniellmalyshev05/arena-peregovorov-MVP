import type { Issue, Scenario } from '@/lib/types'
import { auditScenario, type AuditReport } from '@/lib/engine/audit'
import { describe, enumerateDeals, initialDeal } from '@/lib/engine/utility'

/**
 * Балансировка сгенерированного кейса.
 *
 * Историю, людей и уровни условий пишет модель, а числа баланса ей не
 * доверяются: веса и запасные варианты выравнивает код, пока аудит не
 * признает кейс играбельным. Критерии те же, что у библиотеки:
 *   — среди скрытых условий есть дешёвое для игрока и дорогое для второй
 *     стороны, иначе разведка ничего не даёт;
 *   — зона соглашения есть, но договориться можно не как угодно;
 *   — позиционный торг по открытым условиям уводит игрока в минус;
 *   — кейс остаётся играбельным на всех пяти уровнях сложности админки.
 */

/** Насколько скрытое «золото» дороже второй стороне, чем игроку. Порог аудита — 0,08. */
const GOLD_GAP = 0.12
const MIN_WEIGHT = 0.03

/** Зона соглашения: у библиотеки 27–49%. */
const ZOPA_MIN = 0.2
const ZOPA_MAX = 0.45
const ZOPA_TARGET = 0.32

/**
 * Где обычно стоят запасные варианты в библиотеке. Число модели — слабая
 * подсказка: слишком слабая альтернатива делает вторую сторону сговорчивой
 * на всё, слишком сильная — глухой.
 */
const BATNA_CENTER = { user: 50, opponent: 42 }

/** Шаги сложности админки (lib/admin/config.ts): ±3 к запасному варианту игрока, ±5 — второй стороны. */
const DIFFICULTY_SHIFTS = [-2, 2]

export interface Balanced {
  scenario: Scenario
  audit: AuditReport
  /** Что пришлось поправить. */
  repairs: string[]
  /** Почему кейс не годится. Пусто — годится. */
  problems: string[]
}

export function balance(input: Scenario): Balanced {
  const repairs: string[] = []
  const problems: string[] = []

  let issues = normalize(input.issues)

  // Золото — среди скрытых условий, которые открывает какой-нибудь интерес:
  // до остальных игрок может не добраться вовсе.
  const reachable = new Set(input.hiddenInterests.map((h) => h.revealsIssue).filter(Boolean))
  const candidates = issues.filter((i) => !i.visibleFromStart && reachable.has(i.id))
  if (!candidates.length) {
    problems.push('Ни один скрытый интерес не открывает скрытое условие: игроку нечего разведывать.')
  } else {
    const gold = candidates.reduce((a, b) => (gap(b) > gap(a) ? b : a))
    if (gap(gold) < GOLD_GAP) {
      const need = GOLD_GAP - gap(gold)
      issues = shift(issues, gold.id, 'weightOpponent', need / 2)
      issues = shift(issues, gold.id, 'weightUser', -need / 2)
      repairs.push(`усилен обменный рычаг: «${gold.label}»`)
    }
  }

  issues = rounded(issues)
  let scenario: Scenario = { ...input, issues }

  const batna = pickBatna(scenario)
  if (!batna) {
    problems.push(
      'Не получилось подобрать запасные варианты: на открытых условиях стороны почти не спорят или выгоду почти нечем создать.',
    )
  } else {
    if (batna.user !== input.userBatna.value || batna.opponent !== input.opponentBatna.value) {
      repairs.push(`запасные варианты: игрок ${input.userBatna.value}→${batna.user}, вторая сторона ${input.opponentBatna.value}→${batna.opponent}`)
    }
    scenario = {
      ...scenario,
      userBatna: { ...scenario.userBatna, value: batna.user },
      opponentBatna: { ...scenario.opponentBatna, value: batna.opponent },
    }
  }

  const audit = auditScenario(scenario)
  for (const i of audit.issues) if (i.severity === 'blocker') problems.push(i.text)

  return { scenario, audit, repairs, problems: [...new Set(problems)] }
}

const gap = (i: Issue) => i.weightOpponent - i.weightUser

/** Веса каждой стороны — в сумме единица, ни одно условие не ничтожно. */
function normalize(issues: Issue[]): Issue[] {
  const fix = (key: 'weightUser' | 'weightOpponent', list: Issue[]) => {
    const raw = list.map((i) => Math.max(MIN_WEIGHT, Number.isFinite(i[key]) ? i[key] : 0))
    const sum = raw.reduce((a, b) => a + b, 0)
    return list.map((i, n) => ({ ...i, [key]: raw[n] / sum }))
  }
  return fix('weightOpponent', fix('weightUser', issues))
}

/** Сдвигает вес одного условия, остальные пропорционально забирают разницу. */
function shift(issues: Issue[], id: string, key: 'weightUser' | 'weightOpponent', delta: number): Issue[] {
  const target = issues.find((i) => i.id === id)!
  const next = Math.min(0.6, Math.max(MIN_WEIGHT, target[key] + delta))
  const rest = 1 - target[key]
  const scale = rest > 0 ? (1 - next) / rest : 1
  return issues.map((i) => ({ ...i, [key]: i.id === id ? next : i[key] * scale }))
}

/**
 * Веса до сотых с точной суммой 1,00: аудит проверяет нормировку до тысячной.
 * Остаток раздаётся по наибольшим дробным частям.
 */
function rounded(issues: Issue[]): Issue[] {
  const fix = (key: 'weightUser' | 'weightOpponent', list: Issue[]) => {
    const exact = list.map((i) => i[key] * 100)
    const floor = exact.map(Math.floor)
    let left = 100 - floor.reduce((a, b) => a + b, 0)
    const order = exact.map((v, n) => [v - floor[n], n] as const).sort((a, b) => b[0] - a[0])
    for (const [, n] of order) {
      if (left <= 0) break
      floor[n] += 1
      left -= 1
    }
    return list.map((i, n) => ({ ...i, [key]: floor[n] / 100 }))
  }
  return fix('weightOpponent', fix('weightUser', issues))
}

/**
 * Запасные варианты сторон перебором.
 *
 * Полезности вариантов от запасных вариантов не зависят, поэтому перебор
 * делается один раз, а пары значений проверяются по готовым числам.
 * Из подходящих пар берётся та, что ближе к нужной ширине зоны и к обычным
 * для библиотеки значениям; предложение модели учитывается слабо.
 */
function pickBatna(s: Scenario): { user: number; opponent: number } | null {
  const deals = enumerateDeals(s)
  const u = deals.map((d) => d.user)
  const o = deals.map((d) => d.opponent)
  const joint = Math.max(...deals.map((d) => d.user + d.opponent))

  const caving = { ...initialDeal(s) }
  for (const i of s.issues.filter((x) => x.visibleFromStart)) {
    caving[i.id] = i.options.reduce((a, b) => (b.valueOpponent > a.valueOpponent ? b : a)).id
  }
  const positional = describe(s, caving).user
  const quo = describe(s, initialDeal(s))

  const share = (ub: number, ob: number) => {
    let n = 0
    for (let k = 0; k < u.length; k++) if (u[k] >= ub && o[k] >= ob) n++
    return n / u.length
  }
  const clamp = (n: number) => Math.max(5, Math.min(92, n))

  let best: { user: number; opponent: number; cost: number } | null = null
  for (let ub = 30; ub <= 75; ub++) {
    // Позиционный торг должен уводить в минус с запасом, и на лёгкой сложности тоже.
    if (positional - ub > -4) continue
    for (let ob = 15; ob <= 72; ob++) {
      if (joint - ub - ob < 15) continue
      if (quo.user - ub > 8 && quo.opponent - ob > 0) continue
      const z = share(ub, ob)
      if (z < ZOPA_MIN || z > ZOPA_MAX) continue
      const robust = DIFFICULTY_SHIFTS.every((step) => {
        const ub2 = clamp(ub + step * 3)
        const ob2 = clamp(ob + step * 5)
        return share(ub2, ob2) > 0 && positional - ub2 < 0
      })
      if (!robust) continue
      const cost =
        Math.abs(z - ZOPA_TARGET) * 100 +
        0.25 * (Math.abs(ub - BATNA_CENTER.user) + Math.abs(ob - BATNA_CENTER.opponent)) +
        0.05 * (Math.abs(ub - s.userBatna.value) + Math.abs(ob - s.opponentBatna.value))
      if (!best || cost < best.cost) best = { user: ub, opponent: ob, cost }
    }
  }
  return best && { user: best.user, opponent: best.opponent }
}
