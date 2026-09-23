/** Проверка эталонного прохода С1: те ли формулировки раскрывают интересы. */
import { residentAttraction as s } from '../lib/scenarios/resident-attraction'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import { score } from '../lib/engine/scoring'
import { optionOf, utility } from '../lib/engine/utility'
import type { Deal, NegotiationState } from '../lib/types'

let st: NegotiationState = createInitialState(s)
const say = (text: string, offer?: Deal) => {
  const norm = offer ? sanitizeOffer(s, st, offer) : undefined
  const v = norm ? evaluateOffer(s, st, norm).verdict : undefined
  const llm = offlineTurn(s, st, text, v)
  const before = st.visibleIssues.length
  const r = applyTurn({ scenario: s, state: st, userText: text, llm, explicitOffer: norm, precomputedVerdict: v })
  st = r.state
  const opened = st.visibleIssues.length - before
  console.log(`\n▸ ${text}`)
  console.log(`  акты: ${llm.detectedActs.join(', ') || '—'}${v ? ` | вердикт: ${v}` : ''}`)
  if (r.hint) console.log(`  ✓ раскрыт интерес → «${r.hint}»`)
  if (opened) console.log(`  ✓ в соглашении +${opened} условие`)
  if (!r.hint && !opened && !v) console.log('  · интерес не раскрыт')
}

say('Что произойдёт с запуском, если мощность придёт позже марта?')
say('С какими сложностями вы столкнулись с персоналом на прошлой площадке?')
say('Расскажите, как вы сравниваете три площадки — какие сроки для вас критичны?')
say('Правильно ли я понял, что решение по площадке утверждает совет директоров?')
say(
  'Гарантируем двенадцать мегаватт к марту и берём на себя подготовку кадров. Взамен фиксируем полтора миллиарда, триста сорок рабочих мест и запуск во втором квартале.',
  { grid: 'grid_march', local: 'local_100', investment: 'inv_15', jobs: 'jobs_340', launch: 'launch_q2_2027' },
)

console.log('\n' + '─'.repeat(64))
console.log('ТЕРМ-ШИТ')
for (const i of s.issues) {
  const open = st.visibleIssues.includes(i.id)
  console.log(' ', open ? ' ' : '✕', i.label.padEnd(36), open ? optionOf(i, st.deal[i.id]).label : '— не выведено —')
}
st.hypotheses = s.beliefProbes.map((p) => ({ id: p.id, text: '', confidence: p.truth ? 0.85 : 0.15 }))
const r = score(s, st)
const gain = Math.round(((utility(s, st.deal, 'user') - s.userBatna.value) / s.userBatna.value) * 100)
console.log(`\nинтересов: ${st.revealedInterests.length}/${s.hiddenInterests.length}   итог: ${r.total}/100   к запасному варианту: ${gain >= 0 ? '+' : ''}${gain}%`)
console.log(r.headline)
