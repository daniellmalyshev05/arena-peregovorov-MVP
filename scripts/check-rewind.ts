/** Полный цикл: слабая партия → разбор → откат в момент ошибки → сильная ветка → сравнение. */
import { residentAttraction as s } from '../lib/scenarios/resident-attraction'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer, walkAway } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import { score } from '../lib/engine/scoring'
import { rewindCandidates, momentContext } from '../lib/engine/rewind'
import { analyze, utility } from '../lib/engine/utility'
import type { Deal, NegotiationState } from '../lib/types'

const batna = s.userBatna.value
const pct = (st: NegotiationState) => Math.round(((utility(s, st.deal, 'user') - batna) / batna) * 100)

function play(start: NegotiationState, moves: { text: string; offer?: Deal }[]) {
  let st = start
  const snaps: { turnIndex: number; state: NegotiationState }[] = []
  for (const m of moves) {
    snaps.push({ turnIndex: st.transcript.length, state: JSON.parse(JSON.stringify(st)) })
    const norm = m.offer ? sanitizeOffer(s, st, m.offer) : undefined
    const verdict = norm ? evaluateOffer(s, st, norm).verdict : undefined
    const llm = offlineTurn(s, st, m.text, verdict)
    st = applyTurn({ scenario: s, state: st, userText: m.text, llm, explicitOffer: norm, precomputedVerdict: verdict }).state
  }
  return { state: st, snaps }
}

const probes = s.beliefProbes.map((p) => ({ id: p.id, text: '', confidence: p.truth ? 0.85 : 0.2 }))

// ── Первая попытка: спросил один раз, потом отдал срок даром ────────────────
const first = play(createInitialState(s), [
  { text: 'Что произойдёт с проектом, если подключение сдвинется за март?' },
  { text: 'Хорошо, зафиксируем двенадцать мегаватт к марту.', offer: { grid: 'grid_march' } },
  { text: 'Тогда на этом и остановимся, оформляем.', offer: { launch: 'launch_q4_2027' } },
])
first.state.hypotheses = probes
const r1 = score(s, first.state)

console.log('╔' + '═'.repeat(70))
console.log('║ ПЕРВАЯ ПОПЫТКА →', r1.total, 'из 100  |  к запасному варианту', (pct(first.state) >= 0 ? '+' : '') + pct(first.state) + '%')
console.log('╚' + '═'.repeat(70))
console.log(r1.headline)
console.log(' ', r1.rootCause)
console.log('  уступок без обмена:', first.state.unilateralConcessions, '| условных обменов:', first.state.conditionalOffers)
console.log('  эффективность:', (analyze(s, first.state.deal).efficiency * 100).toFixed(0) + '%')

const cands = rewindCandidates(s, first.state)
console.log('\nМОМЕНТЫ ДЛЯ ПЕРЕИГРЫВАНИЯ:', cands.length)
for (const c of cands) {
  console.log(`  ход ${Math.floor(c.turnIndex / 2) + 1} — ${c.title}`)
  console.log(`     ${c.why}`)
}
if (!cands.length) { console.error('ОШИБКА: разбор не нашёл ни одной развилки'); process.exit(1) }

// ── Откат в найденный момент и другая формулировка ──────────────────────────
const target = cands[0]
const snap = first.snaps.find((x) => x.turnIndex === target.turnIndex)
if (!snap) { console.error('ОШИБКА: снапшот на этот ход не найден'); process.exit(1) }

const ctx = momentContext(first.state, target.turnIndex)
console.log('\nОТКАТ на ход', Math.floor(target.turnIndex / 2) + 1)
console.log('  было:', ctx.turn?.text)

const second = play(snap.state, [
  { text: 'С чем вы столкнулись на прошлой площадке при наборе персонала?' },
  {
    text: 'Гарантируем март и берём кадры на себя. Взамен фиксируем полтора миллиарда и триста двадцать мест.',
    offer: { grid: 'grid_march', local: 'local_100', investment: 'inv_15', jobs: 'jobs_340', launch: 'launch_q2_2027' },
  },
])
second.state.hypotheses = probes
const r2 = score(s, second.state)

console.log('  стало:', 'Гарантируем март и берём кадры на себя. Взамен фиксируем полтора миллиарда…')

console.log('\n╔' + '═'.repeat(70))
console.log('║ ПОСЛЕ ПЕРЕИГРЫВАНИЯ →', r2.total, 'из 100  |  к запасному варианту', (pct(second.state) >= 0 ? '+' : '') + pct(second.state) + '%')
console.log('╚' + '═'.repeat(70))
console.log(r2.headline)

console.log('\nСРАВНЕНИЕ ВЕТОК')
console.log('  условие'.padEnd(30), 'первая'.padStart(22), 'после отката'.padStart(24))
for (const issue of s.issues) {
  const a = issue.options.find((o) => o.id === first.state.deal[issue.id])!.label
  const b = issue.options.find((o) => o.id === second.state.deal[issue.id])!.label
  console.log('  ' + issue.label.padEnd(28), a.padStart(22), (a === b ? b : '→ ' + b).padStart(24))
}
console.log('\n  баллы'.padEnd(30), String(r1.total).padStart(22), String(r2.total).padStart(24))

if (r2.total <= r1.total) { console.error('\nОШИБКА: переигрывание не улучшило результат'); process.exit(1) }
console.log('\n✓ цикл работает: разбор нашёл ошибку, откат восстановил состояние, вторая ветка сильнее')
