/**
 * Сцена собеседника:
 *
 *   1. Закрытая карта не несёт текста интереса — ни в каком виде.
 *   2. Раскрытая карта показывает ровно то, что раскрыл движок.
 *   3. Настрой на старте нейтральный, хорошие вопросы его поднимают, выпады опускают.
 *   4. Согласие на пакет — всегда готовность договориться.
 */
import { scenarios } from '@/lib/scenarios'
import { residentAttraction as s1 } from '@/lib/scenarios/resident-attraction'
import { applyTurn, createInitialState } from '@/lib/engine/state'
import { offlineTurn } from '@/lib/llm/offline'
import { moodBand, xrayCards } from '@/lib/stage'
import type { NegotiationState } from '@/lib/types'

let failed = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

console.log('Карты\n')
for (const sc of scenarios) {
  const st = createInitialState(sc)
  const closed = xrayCards(sc, st)
  const json = JSON.stringify(closed)
  const leaks = sc.hiddenInterests.filter((h) => json.includes(h.label) || json.includes(h.revealLine))
  check(closed.length === sc.hiddenInterests.length && closed.every((c) => !c.open && !('text' in c)), `${sc.id}: на старте все карты закрыты и без текста`)
  check(leaks.length === 0, `${sc.id}: текст закрытых интересов не попадает в данные карт`)

  const one = sc.hiddenInterests[0]
  const opened = xrayCards(sc, { ...st, revealedInterests: [one.id] })
  const card = opened.find((c) => c.id === one.id)
  check(card?.open === true && card.text === one.label, `${sc.id}: раскрытая карта показывает раскрытый интерес`)
  check(opened.filter((c) => c.open).length === 1, `${sc.id}: остальные карты остаются закрытыми`)
  check(moodBand(st) === 'neutral', `${sc.id}: на старте настрой нейтральный`)
}

console.log('\nНастрой\n')
const play = (lines: string[]) => {
  let state: NegotiationState = createInitialState(s1)
  for (const text of lines) {
    const llm = offlineTurn(s1, state, text, undefined)
    state = applyTurn({ scenario: s1, state, userText: text, llm }).state
  }
  return state
}

const good = play([
  'Что произойдёт с проектом, если подключение мощности сдвинется за март?',
  'С чем вы столкнулись на предыдущей площадке при наборе персонала?',
  'Что бы вам дало гарантированное подключение к марту — решило бы это вопрос со сроками?',
  'Правильно ли я понял, что решение принимает совет директоров, а не вы лично?',
])
check(moodBand(good) === 'warming', `хорошие вопросы дают потепление (сейчас: ${moodBand(good)})`)
check(moodBand({ ...good, mood: { ...good.mood, trust: 100, irritation: 0 } }) !== 'ready', 'без согласия на пакет готовности нет, как бы ни росло доверие')

const bad = play([
  'Вы вообще понимаете, о чём говорите? Это несерьёзно.',
  'Вы просто тянете время, это непрофессионально.',
  'Хватит упираться, вы ничего не понимаете в этом бизнесе.',
])
check(['irritated', 'wary'].includes(moodBand(bad)), `выпады опускают настрой (сейчас: ${moodBand(bad)})`)

const agreed = { ...createInitialState(s1), agreedAtRound: 3 }
agreed.mood = { ...agreed.mood, irritation: 70 }
check(moodBand(agreed) === 'ready', 'согласие на пакет — готовность договориться, даже при раздражении')

console.log(failed ? `\n✗ провалено: ${failed}` : '\n✓ всё в порядке')
if (failed) process.exit(1)
