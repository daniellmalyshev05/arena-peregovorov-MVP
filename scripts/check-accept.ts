/**
 * Согласие второй стороны всегда доходит до игрока — даже когда пакет принят,
 * а стол закрыт меньше чем на нужную долю.
 *
 * Проверяется три вещи:
 *   1. `settlement` и статус после хода говорят одно и то же;
 *   2. при неполном столе разрыв выражается конечным числом условий, которое
 *      можно назвать игроку;
 *   3. закрытие «как есть» даёт полноценный исход, а не поломанный разбор.
 */
import { scenarios } from '../lib/scenarios'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer, settlement } from '../lib/engine/state'
import { score } from '../lib/engine/scoring'
import { enumerateReachable } from '../lib/engine/utility'
import type { NegotiationState } from '../lib/types'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

const neutral = { reply: 'Хорошо.', detectedActs: [], revealedInterests: [] }
let thinSeen = 0

for (const s of scenarios) {
  console.log(`\n${s.title}`)

  const open: NegotiationState = createInitialState(s)
  open.visibleIssues = s.issues.map((i) => i.id)

  const moves = (deal: Record<string, string>) =>
    s.issues.filter((i) => open.visibleIssues.includes(i.id) && deal[i.id] !== i.defaultOptionId).length

  // Самый «тонкий» из принимаемых пакетов: тот, что двигает меньше всего условий.
  const accepted = enumerateReachable(s, open.visibleIssues)
    .map((p) => ({ ...p, deal: sanitizeOffer(s, open, p.deal) }))
    .filter((p) => evaluateOffer(s, open, p.deal).verdict === 'accept')
    .sort((a, b) => moves(a.deal) - moves(b.deal))[0]

  if (!accepted) {
    check(false, 'в сценарии вообще нет принимаемого пакета')
    continue
  }

  const after = applyTurn({
    scenario: s, state: open, userText: 'Пакет.', llm: neutral,
    explicitOffer: accepted.deal, precomputedVerdict: 'accept',
  }).state

  const settle = settlement(s, after)
  check(settle.settled === (after.status === 'deal'), `состояние и арифметика стола согласованы (${after.status}, ${settle.moved}/${settle.needed})`)

  if (!settle.settled) {
    thinSeen++
    check(settle.moved < settle.needed, `игроку есть что назвать: закрыто ${settle.moved}, нужно ${settle.needed}`)

    // Закрытие «как есть»: игрок вправе остановиться на том, о чём договорился.
    const closed: NegotiationState = { ...after, status: 'deal' }
    const r = score(s, closed)
    check(r.total >= 0 && r.total <= 100, `закрытие как есть считается: ${r.total} из 100`)
    check(!r.headline.includes('соглашения нет'), `разбор не называет это отсутствием соглашения: «${r.headline}»`)
  } else {
    console.log(`    (самый тонкий принимаемый пакет закрывает стол сразу: ${settle.moved}/${settle.needed})`)
  }
}

// Ранняя игра: условий на столе меньше трёх, порог бесконечен. Строка для
// игрока в этом случае своя, без «из Infinity».
console.log('\nРанняя игра: стол ещё не раскрыт')
for (const s of scenarios) {
  const early = createInitialState(s)
  const settle = settlement(s, early)
  if (settle.visible >= 3) {
    check(Number.isFinite(settle.needed), `${s.title}: стол открыт сразу (${settle.visible} условий), порог конечен`)
  } else {
    check(!Number.isFinite(settle.needed) && !settle.settled, `${s.title}: ${settle.visible} условия на столе — порога закрытия ещё нет`)
  }
}

console.log('\n' + '═'.repeat(70))
console.log(`сценариев, где согласие приходит до закрытия стола: ${thinSeen} из ${scenarios.length}`)
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ принятый пакет всегда даёт игроку честный следующий шаг')
