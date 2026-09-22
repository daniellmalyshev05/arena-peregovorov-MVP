/**
 * Вернуть можно всегда.
 *
 * Холл обещает «любой ход можно вернуть и переиграть». На живом прогоне ровная
 * партия закончилась фразой «явных развилок нет», и главная механика продукта
 * осталась невидимой. Проверяется, что:
 *   1. в любой законченной партии есть хотя бы два момента для возврата;
 *   2. отклонённый пакет и выход из переговоров становятся моментами;
 *   3. «копнуть глубже» не ставится на ход, который как раз раскрыл интерес;
 *   4. «в пакет не попало» не говорится, если пакета не было.
 */
import { scenarios } from '../lib/scenarios'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer, walkAway } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import { rewindCandidates } from '../lib/engine/rewind'
import { enumerateReachable } from '../lib/engine/utility'
import type { Deal, NegotiationState, Scenario } from '../lib/types'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

function say(s: Scenario, st: NegotiationState, text: string, offer?: Deal) {
  const norm = offer ? sanitizeOffer(s, st, offer) : undefined
  const v = norm ? evaluateOffer(s, st, norm) : undefined
  const llm = offlineTurn(s, st, text, v?.verdict)
  return applyTurn({ scenario: s, state: st, userText: text, llm, explicitOffer: norm, precomputedVerdict: v?.verdict, counter: v?.counter }).state
}

/** Вопросы, которые открывают все интересы кейса: берутся из того, чем они открываются. */
const QUESTIONS: Record<string, string> = {
  spin_situation: 'Расскажите, как у вас сейчас устроен этот процесс?',
  spin_problem: 'Что вам сейчас больше всего мешает?',
  spin_implication: 'Что произойдёт, если это сдвинется позже?',
  spin_needpayoff: 'Что бы вам дало, если бы этот вопрос был решён?',
  authority_check: 'Кто у вас в итоге утверждает решение?',
  objective_criterion: 'Давайте посмотрим на данные по рынку.',
  active_listening: 'Правильно ли я понимаю, что для вас это главное?',
}

for (const s of scenarios) {
  console.log(`\n${s.title}`)

  // Ровная партия: раскрыть всё, затем лучший для обеих сторон пакет.
  let good = createInitialState(s)
  for (const h of s.hiddenInterests) good = say(s, good, QUESTIONS[h.unlockedBy[0]])
  const best = enumerateReachable(s, good.visibleIssues).reduce((a, b) => (b.jointSurplus > a.jointSurplus ? b : a))
  good = say(s, good, 'Предлагаю так, в обмен.', best.deal)
  if (good.status === 'active') good = walkAway(good)
  const cGood = rewindCandidates(s, good)
  check(cGood.length >= 2, `ровная партия — моментов для возврата: ${cGood.length} (${cGood.map((c) => c.kind).join(', ')})`)
  const revealing = new Set(good.transcript.filter((t) => t.role === 'user' && t.revealed.length).map((t) => t.index))
  check(
    !cGood.some((c) => c.kind === 'missed_interest' && revealing.has(c.turnIndex)),
    '«копнуть глубже» не стоит на ходе, который раскрыл интерес',
  )

  // Отклонённый пакет становится моментом.
  let refused = createInitialState(s)
  refused = say(s, refused, 'Добрый день.')
  const worst = enumerateReachable(s, refused.visibleIssues).reduce((a, b) => (b.opponentSurplus < a.opponentSurplus ? b : a))
  refused = say(s, refused, 'Вот наш пакет.', worst.deal)
  const refusedTurn = refused.transcript.find((t) => t.role === 'user' && t.verdict && t.verdict !== 'accept')
  refused = walkAway(refused)
  const cRefused = rewindCandidates(s, refused)
  if (!refusedTurn) {
    console.log('  · из условий, открытых на старте, вторая сторона принимает любой пакет — проверка неприменима')
  } else {
    check(cRefused.some((c) => c.turnIndex === refusedTurn.index), 'отклонённый пакет — среди моментов для возврата')
  }

  // Выход без единого пакета.
  let exit = createInitialState(s)
  exit = say(s, exit, QUESTIONS[s.hiddenInterests[0].unlockedBy[0]])
  exit = say(s, exit, 'Понятно, спасибо.')
  exit = walkAway(exit)
  const cExit = rewindCandidates(s, exit)
  check(cExit.some((c) => c.kind === 'walkaway' && c.turnIndex === exit.transcript.length), 'выход — момент для возврата, точка возврата — момент выхода')
  check(!cExit.some((c) => c.kind === 'weak_package'), 'без пакета нет «в пакет не попало»')
  check(cExit.length >= 2, `после выхода моментов: ${cExit.length}`)
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ вернуть можно в любой законченной партии, и моменты выбраны честно')
