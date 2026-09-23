/**
 * Встречное предложение считает движок, и его можно принять как есть.
 *
 * Для каждого кейса перебираются пакеты, на которые вторая сторона отвечает
 * встречным, и проверяется:
 *   1. встречное есть и двигает только условия, выведенные в разговор;
 *   2. тот же пакет, отправленный следующим ходом, принимается — даже если за
 *      этот ход вторая сторона раздражена сильнее всего, что допускает движок;
 *   3. отклонённый пакет не записывается уступкой в счётчики и в соглашение.
 */
import { scenarios } from '../lib/scenarios'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer } from '../lib/engine/state'
import { score } from '../lib/engine/scoring'
import { enumerateReachable } from '../lib/engine/utility'
import type { NegotiationState } from '../lib/types'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

const neutral = { reply: 'Посмотрим.', detectedActs: [], revealedInterests: [] }

for (const s of scenarios) {
  console.log(`\n${s.title}`)
  const start: NegotiationState = createInitialState(s)
  start.visibleIssues = s.issues.map((i) => i.id)
  start.round = 4

  const offers = enumerateReachable(s, start.visibleIssues).map((p) => p.deal)
  let countered = 0
  let honoured = 0
  let movedHidden = 0
  let noCounter = 0
  for (const offer of offers) {
    const proposed = sanitizeOffer(s, start, offer)
    const v = evaluateOffer(s, start, proposed)
    if (v.verdict === 'accept') continue
    if (!v.counter) {
      noCounter++
      continue
    }
    countered++
    if (Object.keys(v.counter).some((k) => v.counter![k] !== proposed[k] && !start.visibleIssues.includes(k))) movedHidden++

    // Ход с отклонённым пакетом, самое сильное раздражение, какое пропускает движок.
    const after = applyTurn({
      scenario: s, state: start, userText: 'Пакет.', llm: { ...neutral, stateDelta: { trust: -8, irritation: 8 } },
      explicitOffer: proposed, precomputedVerdict: v.verdict, counter: v.counter,
    }).state
    const again = evaluateOffer(s, after, sanitizeOffer(s, after, v.counter))
    if (again.verdict === 'accept') honoured++
  }
  check(countered > 0, `встречное посчитано для ${countered} пакетов (без встречного: ${noCounter})`)
  check(movedHidden === 0, 'встречное не трогает условия, которых нет на столе')
  check(honoured === countered, `встречное, взятое как есть, принимается следующим ходом: ${honoured} из ${countered}`)

  // Отклонённая голая уступка: предложена — да, отдана — нет.
  const visible = createInitialState(s)
  const bestForThem = (i: (typeof s.issues)[number]) => i.options.reduce((a, b) => (b.valueOpponent > a.valueOpponent ? b : a)).id
  // Условие на столе, которое ещё не отдано второй стороне целиком.
  const issue =
    s.issues.find((i) => visible.visibleIssues.includes(i.id) && bestForThem(i) !== i.defaultOptionId) ??
    s.issues.find((i) => visible.visibleIssues.includes(i.id))!
  // Отдаём половину пути: целиком такая уступка часто устраивает вторую сторону сразу.
  const order = [...issue.options].sort((a, b) => a.valueOpponent - b.valueOpponent)
  const current = order.findIndex((o) => o.id === visible.deal[issue.id])
  const giveaway = { [issue.id]: order[Math.min(order.length - 1, current + 1)].id }
  const proposed = sanitizeOffer(s, visible, giveaway)
  const v = evaluateOffer(s, visible, proposed)
  const st = applyTurn({ scenario: s, state: visible, userText: 'Отдаём.', llm: neutral, explicitOffer: proposed, precomputedVerdict: v.verdict, counter: v.counter }).state
  if (v.verdict !== 'accept' && proposed[issue.id] !== visible.deal[issue.id]) {
    const turn = st.transcript.find((t) => t.role === 'user')!
    const r = score(s, st)
    check(st.unilateralConcessions === 0 && turn.dealChanges.length === 0, 'непринятая уступка не попала ни в соглашение, ни в счётчик')
    check(!r.penalties.some((p) => p.key === 'unilateral'), 'и не превратилась в штраф «−0»')
    check(turn.verdict === v.verdict, `ответ на пакет записан в ход (${turn.verdict})`)
  } else {
    console.log('  · небольшую уступку по этому условию вторая сторона принимает сразу — проверка счётчика не применима')
  }
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ встречное предложение считает движок, и взятое как есть оно принимается')
