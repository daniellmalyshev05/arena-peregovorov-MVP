/**
 * Модель говорит только то, что решил код.
 *
 * Три дыры с живого прогона 23 сентября:
 *   1. вторая сторона сказала «принимаю» в ходе без пакета — соглашение не
 *      изменилось, а человек услышал, что договорились;
 *   2. условия, названные в чате, пропадали молча — ни в соглашении, ни в
 *      подсказке;
 *   3. «Скажите прямо, чего вы хотите?» открыло скрытый интерес как вопрос SPIN.
 */
import { detectConsent } from '@/lib/llm/consent'
import { isDirectAsk } from '@/lib/engine/acts'
import { applyTurn, createInitialState } from '@/lib/engine/state'
import { getScenario } from '@/lib/scenarios'

let failed = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

console.log('Согласие без решения движка\n')
const consent: [string, 'accept' | 'counter' | 'reject' | undefined, boolean][] = [
  ['Скидку по земле я принимаю, но поднимать планку совет не утвердит.', undefined, true],
  ['Хорошо, договорились, фиксируйте.', 'counter', true],
  ['Меня устраивает такой график.', 'reject', true],
  ['Договорились. Пакет готов выносить на совет.', 'accept', false],
  ['По мощности к марту мы договоримся. Но запуск во II квартале рискован.', 'counter', false],
  ['Остальные условия нас устраивают, но срок нужен другой.', 'counter', false],
  ['Согласен, что сроки важны. Но цена должна выдерживать сравнение.', undefined, false],
  ['Если дадите гарантию к марту — я согласен.', undefined, false],
  ['Я не согласен с такой ставкой.', undefined, false],
  ['Принимаю ваши доводы, но совет смотрит на цифры.', undefined, false],
]
for (const [text, verdict, expected] of consent) {
  const hit = detectConsent(text, verdict)
  check(!!hit === expected, `${expected ? 'ловит' : 'пропускает'} [${verdict ?? 'без пакета'}] «${text}»`)
}

console.log('\nВопрос в лоб — не SPIN\n')
const asks: [string, boolean][] = [
  ['Скажите прямо, чего вы на самом деле хотите от площадки?', true],
  ['Чего вы хотите?', true],
  ['Какие у вас настоящие интересы в этой сделке?', true],
  ['Что для вас будет самым болезненным, если проект сдвинется?', false],
  ['Расскажите, как вы выбираете площадку — на что смотрите в первую очередь?', false],
  ['Что вам нужно, чтобы защитить решение перед советом?', false],
]
for (const [text, expected] of asks) check(isDirectAsk(text) === expected, `${expected ? 'в лоб' : 'вопрос'}: «${text}»`)

const scenario = getScenario('resident-attraction')!
const start = createInitialState(scenario)
const target = scenario.hiddenInterests.find((h) => h.unlockedBy.includes('spin_situation'))!
const blunt = applyTurn({
  scenario, state: start, userText: 'Скажите прямо, чего вы на самом деле хотите от площадки?',
  llm: { reply: '…', detectedActs: ['spin_situation'], revealedInterests: [target.id] },
})
check(!blunt.state.revealedInterests.includes(target.id), 'вопрос в лоб не открывает интерес, даже если модель разметила его как SPIN')
check(!blunt.state.transcript.at(-2)!.acts.some((a) => a.startsWith('spin_')), 'и в ленте он не помечен как приём SPIN')
const honest = applyTurn({
  scenario, state: start, userText: 'Расскажите, как вы выбираете площадку?',
  llm: { reply: '…', detectedActs: ['spin_situation'], revealedInterests: [target.id] },
})
check(honest.state.revealedInterests.includes(target.id), 'настоящий ситуационный вопрос открывает интерес как раньше')

console.log('\nУсловия, названные в чате\n')
const visible = scenario.issues.find((i) => start.visibleIssues.includes(i.id))!
const hidden = scenario.issues.find((i) => !start.visibleIssues.includes(i.id))!
const other = visible.options.find((o) => o.id !== start.deal[visible.id])!
const spoken = applyTurn({
  scenario, state: start, userText: 'Давайте так: вы нам одно, мы вам другое.',
  llm: {
    reply: '…', detectedActs: ['conditional_offer'], revealedInterests: [],
    userOffer: { [visible.id]: other.id, [hidden.id]: hidden.options[0].id, nonsense: 'x', [visible.id + '_']: 'y' },
  },
})
const said = spoken.state.transcript.at(-2)!
check(said.spokenOffer?.[visible.id] === other.id, 'условие со стола с настоящим уровнем записано')
check(!said.spokenOffer || !(hidden.id in said.spokenOffer), 'условие, которого нет на столе, выброшено')
check(Object.keys(said.spokenOffer ?? {}).length === 1, 'выдуманные условия и уровни выброшены')
check(JSON.stringify(spoken.state.deal) === JSON.stringify(start.deal), 'соглашение от слов не меняется')

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.log(`✗ провалено проверок: ${failed}`)
  process.exit(1)
}
console.log('✓ модель говорит только то, что решил код, а слова без пакета не теряются')
