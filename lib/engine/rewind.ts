import type { NegotiationState, Scenario } from '@/lib/types'
import { analyze } from './utility'

/**
 * Выбор моментов для переигрывания.
 *
 * Игроку НЕ предлагается откатиться к любой из двадцати реплик: это перегружает
 * выбор и разваливает состояние. Система сама находит два-три хода, где
 * переговоры действительно свернули не туда, и объясняет почему.
 */
export interface RewindCandidate {
  /** Индекс хода игрока в стенограмме: откат происходит в состояние ПЕРЕД ним. */
  turnIndex: number
  kind: 'unilateral' | 'early_offer' | 'weak_package' | 'missed_interest'
  title: string
  why: string
}

export function rewindCandidates(scenario: Scenario, state: NegotiationState): RewindCandidate[] {
  const out: RewindCandidate[] = []
  const userTurns = state.transcript.filter((t) => t.role === 'user')
  const economy = analyze(scenario, state.deal)

  // 1. Уступка без встречного условия — самая дорогая и самая наглядная ошибка.
  const unilateral = userTurns.find((t) => t.acts.includes('unilateral_concession'))
  if (unilateral) {
    out.push({
      turnIndex: unilateral.index,
      kind: 'unilateral',
      title: 'Уступка без встречного условия',
      why: 'Вы отдали условие и не попросили ничего взамен. Здесь ценность утекает быстрее всего.',
    })
  }

  // 2. Предложение до выяснения интересов.
  const early = userTurns.find((t) => t.index <= 2 && t.dealChanges.length > 0)
  if (early && !out.some((c) => c.turnIndex === early.index)) {
    out.push({
      turnIndex: early.index,
      kind: 'early_offer',
      title: 'Предложение до выяснения интересов',
      why: 'Вы начали двигать условия раньше, чем поняли, чего вторая сторона хочет на самом деле.',
    })
  }

  // 3. Раскрытый, но неиспользованный интерес.
  const usedIssues = new Set(state.transcript.flatMap((t) => t.dealChanges.map((c) => c.issueId)))
  const idleInterest = scenario.hiddenInterests.find(
    (h) => state.revealedInterests.includes(h.id) && h.revealsIssue && !usedIssues.has(h.revealsIssue),
  )
  if (idleInterest) {
    const lastOffer = [...userTurns].reverse().find((t) => t.dealChanges.length > 0) ?? userTurns[userTurns.length - 1]
    if (lastOffer && !out.some((c) => c.turnIndex === lastOffer.index)) {
      out.push({
        turnIndex: lastOffer.index,
        kind: 'weak_package',
        title: 'В пакет не попало то, что вы уже знали',
        why: `Вы выяснили: ${idleInterest.label.toLowerCase()} — но не превратили это в условие сделки.`,
      })
    }
  }

  // 4. Интерес, который так и остался нераскрытым.
  const missed = scenario.hiddenInterests.find((h) => !state.revealedInterests.includes(h.id))
  if (missed && out.length < 3) {
    const firstHalf = userTurns[Math.max(0, Math.floor(userTurns.length / 3))]
    if (firstHalf && !out.some((c) => c.turnIndex === firstHalf.index)) {
      out.push({
        turnIndex: firstHalf.index,
        kind: 'missed_interest',
        title: 'Здесь можно было копнуть глубже',
        why: 'Один из интересов второй стороны вы так и не нашли. Вопрос о последствиях открыл бы его.',
      })
    }
  }

  // Если ошибок нет, но ценность осталась на столе — предложить улучшить финал.
  if (!out.length && economy.valueLeftOnTable > 3) {
    const lastOffer = [...userTurns].reverse().find((t) => t.dealChanges.length > 0)
    if (lastOffer) {
      out.push({
        turnIndex: lastOffer.index,
        kind: 'weak_package',
        title: 'Финальный пакет можно было собрать сильнее',
        why: `Существовал вариант, лучший для обеих сторон. Неиспользованной осталась ценность ${economy.valueLeftOnTable.toFixed(1)}.`,
      })
    }
  }

  return out.slice(0, 3).sort((a, b) => a.turnIndex - b.turnIndex)
}

/** Реплики вокруг момента — чтобы показать его в разборе без домысливания. */
export function momentContext(state: NegotiationState, turnIndex: number) {
  const turn = state.transcript.find((t) => t.index === turnIndex && t.role === 'user')
  const before = [...state.transcript]
    .filter((t) => t.index < turnIndex && t.role === 'opponent')
    .pop()
  const after = state.transcript.find((t) => t.index === turnIndex + 1)
  return { turn, before, after }
}
