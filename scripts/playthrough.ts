/** Полный прогон партии через движок: офлайн-оппонент, реальные ходы, финальный разбор. */
import { residentAttraction as s } from '../lib/scenarios/resident-attraction'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import { score } from '../lib/engine/scoring'
import { optionOf } from '../lib/engine/utility'
import type { Deal, NegotiationState } from '../lib/types'

let state: NegotiationState = createInitialState(s)
console.log('ОППОНЕНТ:', state.transcript[0].text, '\n')

const say = (text: string, offer?: Deal, fact?: string) => {
  const normalized = offer ? sanitizeOffer(s, state, offer) : undefined
  const verdict = normalized ? evaluateOffer(s, state, normalized).verdict : undefined
  const llm = offlineTurn(s, state, text, verdict)
  const r = applyTurn({ scenario: s, state, userText: text, llm, explicitOffer: normalized, precomputedVerdict: verdict, factPlayed: fact })
  state = r.state
  console.log('ВЫ:', text)
  console.log('   акты:', llm.detectedActs.join(', ') || '—', verdict ? `| вердикт: ${verdict}` : '')
  if (r.hint) console.log('   гипотеза →', r.hint)
  console.log('ОППОНЕНТ:', llm.reply, '\n')
}

say('Что произойдёт с проектом, если подключение мощности сдвинется за март?')
say('С чем вы столкнулись на предыдущей площадке при наборе персонала?')
say('Правильно ли я понял, что решение принимает совет директоров, а не вы лично?')
say('Что бы вам дало гарантированное подключение к марту — решило бы это вопрос со сроками?')
say(
  'Мы фиксируем подключение к марту и берём на себя целевую подготовку кадров. Взамен объём остаётся 1,5 млрд и 320 рабочих мест.',
  { grid: 'grid_march', local: 'local_100', investment: 'inv_15', jobs: 'jobs_340', launch: 'launch_q2_2027' },
  'gridStats',
)

console.log('─'.repeat(72))
console.log('ТЕРМ-ШИТ')
for (const issue of s.issues) {
  const open = state.visibleIssues.includes(issue.id)
  console.log(' ', (open ? ' ' : '✕') , issue.label.padEnd(26), open ? optionOf(issue, state.deal[issue.id]).label : '— не выведено в обсуждение —')
}
console.log('\nраскрыто интересов:', state.revealedInterests.length, 'из', s.hiddenInterests.length, '→', state.revealedInterests.join(', '))
console.log('условных обменов:', state.conditionalOffers, '| уступок без обмена:', state.unilateralConcessions)

state.hypotheses = [
  { id: 'p_grid', text: '', confidence: 0.9 },
  { id: 'p_land', text: '', confidence: 0.2 },
  { id: 'p_staff', text: '', confidence: 0.85 },
  { id: 'p_alt', text: '', confidence: 0.25 },
  { id: 'p_authority', text: '', confidence: 0.1 },
  { id: 'p_second', text: '', confidence: 0.6 },
]
const r = score(s, state)
console.log('\n' + '─'.repeat(72))
console.log('ИТОГ:', r.total, 'из 100 —', r.headline)
console.log(' ', r.rootCause)
