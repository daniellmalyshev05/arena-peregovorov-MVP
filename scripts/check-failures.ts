/** Проверка провальных исходов: бессмыслица, молчание, выход из переговоров. */
import { residentAttraction as s } from '../lib/scenarios/resident-attraction'
import { applyTurn, createInitialState, walkAway } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import { score } from '../lib/engine/scoring'
import type { NegotiationState } from '../lib/types'

const run = (name: string, moves: string[], walk = false) => {
  let st: NegotiationState = createInitialState(s)
  for (const text of moves) {
    const llm = offlineTurn(s, st, text)
    st = applyTurn({ scenario: s, state: st, userText: text, llm }).state
  }
  if (walk) st = walkAway(st)
  const r = score(s, st)
  console.log('\n' + '─'.repeat(66))
  console.log(name, '→', r.total, 'из 100   [статус:', st.status + ']')
  console.log('  ' + r.headline)
  console.log('  ' + r.rootCause)
  return { st, r }
}

// 1. Бессмысленный ввод до конца раундов.
const gibberish = Array.from({ length: 13 }, () => 'фыв ждлп ыва')
const a = run('БЕССМЫСЛИЦА ДО КОНЦА РАУНДОВ', gibberish)
console.log('  последняя реплика оппонента:', a.st.transcript[a.st.transcript.length - 1].text)

// 2. Вежливая болтовня без единого предложения.
const b = run('РАЗГОВОР БЕЗ ЕДИНОГО ПРЕДЛОЖЕНИЯ', [
  'Здравствуйте, рад встрече.',
  'Расскажите, как у вас обстоят дела с проектом?',
  'Понятно, спасибо.',
  'Хорошо.', 'Ясно.', 'Согласен.', 'Да.', 'Понял вас.',
  'Хорошо.', 'Ясно.', 'Согласен.', 'Да.', 'Понял.',
])

// 3. Осознанный выход после выяснения интересов.
const c = run('ВЫХОД ИЗ ПЕРЕГОВОРОВ', [
  'Что произойдёт с проектом, если подключение сдвинется за март?',
  'Понял. Боюсь, на таких условиях мы не сойдёмся.',
], true)

console.log('\n' + '═'.repeat(66))
const fails: string[] = []
if (a.st.status !== 'timeout') fails.push('бессмыслица не привела к таймауту')
if (a.r.headline.toLowerCase().includes('сделка состоялась')) fails.push('провал назван состоявшейся сделкой')
if (a.r.total > 30) fails.push('за бессмыслицу начислено слишком много баллов: ' + a.r.total)
if (b.r.total > 35) fails.push('за пустой разговор начислено слишком много: ' + b.r.total)
if (c.st.status !== 'walkaway') fails.push('выход из переговоров не зафиксирован')
if (c.r.headline.toLowerCase().includes('сделка состоялась')) fails.push('выход назван состоявшейся сделкой')
if (fails.length) { console.error('ОШИБКИ:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('✓ провальные исходы больше не выглядят как успех')
