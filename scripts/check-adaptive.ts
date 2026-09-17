/** Оппонент должен реально твердеть под слабости игрока, а не просто получать подпись. */
import { getScenario } from '../lib/scenarios'
import { createInitialState, evaluateOffer, sanitizeOffer } from '../lib/engine/state'
import { computeAdaptation, adaptationLevel, NO_ADAPTATION } from '../lib/engine/adaptive'
import { enumerateDeals, zopa } from '../lib/engine/utility'
import type { RunRecord } from '../lib/profile'

const s = getScenario('resident-attraction')!

const run = (o: Partial<RunRecord>): RunRecord => ({
  scenarioId: s.id, at: 0, total: 50, userUtility: 60, opponentUtility: 60, status: 'deal',
  revealed: 3, interests: 4, unilateral: 0, conditional: 2, facts: 2, brier: 0.1,
  acts: { spin_implication: 1 }, training: false, ...o,
})

// Предложение, которое оппоненту умеренно выгодно.
const state = createInitialState(s)
const offer = sanitizeOffer(s, state, {
  grid: 'grid_july', local: 'local_50', investment: 'inv_15', launch: 'launch_q2_2027',
})

const check = (name: string, runs: RunRecord[]) => {
  const a = computeAdaptation(runs)
  const v = evaluateOffer(s, state, offer, a)
  console.log(
    `${name.padEnd(34)} притязание +${a.aspiration.toFixed(1).padStart(4)}  порог ${v.aspiration.toFixed(1).padStart(5)}  вердикт ${v.verdict.padEnd(7)} [${adaptationLevel(a)}]`,
  )
  if (a.note) console.log(`${' '.repeat(36)}«${a.note}»`)
  return { a, v }
}

console.log('ПРЕДЛОЖЕНИЕ ОДНО И ТО ЖЕ, ОППОНЕНТ РАЗНЫЙ')
console.log('─'.repeat(96))
const clean = check('новый игрок (нет истории)', [run({}), run({})])
const conceder = check('уступает без обмена', [
  run({ unilateral: 2, conditional: 0, acts: {} }),
  run({ unilateral: 1, conditional: 0, acts: {} }),
])
const shallow = check('не копает интересы', [
  run({ revealed: 1, facts: 0, acts: {} }), run({ revealed: 1, facts: 0, acts: {} }),
])
const strong = check('стабильно выигрывает', [run({ total: 82 }), run({ total: 76 })])
const worst = check('всё сразу', [
  run({ unilateral: 3, conditional: 0, revealed: 0, facts: 0, brier: 0.45, acts: {}, total: 15 }),
  run({ unilateral: 2, conditional: 0, revealed: 1, facts: 0, brier: 0.4, acts: {}, total: 20 }),
])

console.log('\nГОЛЫЕ УСТУПКИ ПОДНИМАЮТ ЕГО АППЕТИТ ПО ХОДУ РАЗГОВОРА')
const greedy = computeAdaptation([
  run({ unilateral: 2, conditional: 0, acts: {} }), run({ unilateral: 2, conditional: 0, acts: {} }),
])
for (const n of [0, 1, 2, 3]) {
  const st = { ...createInitialState(s), unilateralConcessions: n }
  console.log(`  уступок в этой сессии: ${n} → порог ${evaluateOffer(s, st, offer, greedy).aspiration.toFixed(1)}`)
}

// Самый жёсткий оппонент всё равно должен быть проходим: к финалу существует
// предложение, которое он примет и которое при этом выгодно игроку.
console.log('\nПРОХОДИМОСТЬ САМОГО ЖЁСТКОГО ОППОНЕНТА')
const endState = { ...createInitialState(s), round: s.maxRounds }
const inZopa = zopa(enumerateDeals(s))
const bestOpp = Math.max(...inZopa.map((p) => p.opponentSurplus))
const finalBar = evaluateOffer(s, endState, offer, worst.a).aspiration
const winnable = inZopa.filter((p) => p.opponentSurplus >= finalBar && p.userSurplus > 0)
console.log(`  планка к финалу ${finalBar.toFixed(1)}, потолок выгоды оппонента в зоне ${bestOpp.toFixed(1)}`)
console.log(`  сделок, которые он примет и которые выгодны игроку: ${winnable.length}`)

console.log('\n' + '═'.repeat(96))
const fails: string[] = []
if (!winnable.length) fails.push('жёсткий оппонент стал непроходимым: выигрышных сделок не осталось')
if (clean.a !== NO_ADAPTATION) fails.push('ровному игроку достался адаптированный оппонент')
if (conceder.v.aspiration <= clean.v.aspiration) fails.push('уступчивость не сделала оппонента жёстче')
if (shallow.v.aspiration <= clean.v.aspiration) fails.push('поверхностность не сделала оппонента жёстче')
if (strong.v.aspiration <= clean.v.aspiration) fails.push('сильный игрок не получил собранного оппонента')
if (worst.a.aspiration > 6) fails.push('оппонент стал непроходимым: притязание ' + worst.a.aspiration)
if (!worst.a.instruction) fails.push('модель не получает инструкцию по стойке')
if (fails.length) { console.error('ОШИБКИ:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('✓ оппонент твердеет адресно, но остаётся проходимым')
