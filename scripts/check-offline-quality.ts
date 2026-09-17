/** Запасной движок должен отвечать ПО СУЩЕСТВУ, а не общими фразами по номеру раунда. */
import { scenarios, getScenario } from '../lib/scenarios'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import type { NegotiationState } from '../lib/types'

const s = getScenario('resident-attraction')!
let st: NegotiationState = createInitialState(s)
const fails: string[] = []

const say = (text: string, opts: { fact?: string; offer?: Record<string, string> } = {}) => {
  const norm = opts.offer ? sanitizeOffer(s, st, opts.offer) : undefined
  const v = norm ? evaluateOffer(s, st, norm).verdict : undefined
  const llm = offlineTurn(s, st, text, v, opts.fact)
  st = applyTurn({ scenario: s, state: st, userText: text, llm, explicitOffer: norm, precomputedVerdict: v, factPlayed: opts.fact }).state
  console.log(`\n▸ ${text}`)
  console.log(`  ← ${llm.reply}`)
  return llm.reply
}

console.log('РАЗГОВОР ПО СУЩЕСТВУ')
console.log('─'.repeat(74))

const r1 = say('Что произойдёт с запуском, если мощность придёт позже марта?')
if (!r1.includes('мегаватт') && !r1.includes('монтаж')) fails.push('сильный вопрос не раскрыл интерес')

const r2 = say('Давайте обсудим объём инвестиций — на что вы готовы?')
if (!r2.toLowerCase().includes('объём инвестиц')) fails.push('вопрос про конкретное условие получил ответ не про него')

const r3 = say('Средний срок подключения на альтернативных площадках — четырнадцать месяцев.', { fact: 'altDelay' })
if (!r3.includes('цифра') && !r3.includes('Цифра')) fails.push('выложенный факт остался без реакции')

const r4 = say('Вы вообще несерьёзно себя ведёте.')
if (r4 !== s.fallbackLines.pressure) fails.push('на переход к личности ответ не из ситуации «давление»')

const r5 = say('Ладно, понятно.')
if (r5 !== s.fallbackLines.vague && r5 !== s.fallbackLines.neutral) fails.push('на пустую реплику ответ не из ситуации «слишком общо»')

const r5b = say('Ну.')
if (!r5b.includes('не понял')) fails.push('бессмыслица не отбита просьбой сформулировать')

const r6 = say('Хорошо, готовы зафиксировать подключение к марту.', { offer: { grid: 'grid_march' } })
if (r6 !== s.fallbackLines.accept && r6 !== s.fallbackLines.counter && r6 !== s.fallbackLines.reject) {
  fails.push('решение по пакету не использовало реплику персонажа')
}

console.log('\n\nРЕПЛИКИ НА ВЕРДИКТ — В ГОЛОСЕ КАЖДОГО ПЕРСОНАЖА')
console.log('─'.repeat(74))
for (const sc of scenarios) {
  console.log(`  ${sc.persona.name.padEnd(18)} «${sc.fallbackLines.accept}»`)
  if (sc.id !== 'resident-attraction' && sc.fallbackLines.accept.includes('на совет вынесу')) {
    fails.push(`${sc.persona.name} говорит чужими словами`)
  }
}

console.log('\n' + '═'.repeat(74))
if (fails.length) { console.error('ОШИБКИ:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('✓ запасной движок отвечает по существу и голосом своего персонажа')
