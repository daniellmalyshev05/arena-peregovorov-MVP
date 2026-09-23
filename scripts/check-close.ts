/**
 * Сделку закрывает игрок, а не первый принятый пакет.
 *
 * После согласия игрок выбирает — зафиксировать или торговаться дальше,
 * а исчерпание раундов при уже согласованном пакете считается сделкой по нему.
 */
import { scenarios } from '../lib/scenarios'
import { applyTurn, createInitialState, endNow, evaluateOffer, sanitizeOffer } from '../lib/engine/state'
import { score } from '../lib/engine/scoring'
import { enumerateReachable } from '../lib/engine/utility'
import type { NegotiationState } from '../lib/types'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

const neutral = { reply: 'Хорошо.', detectedActs: [], revealedInterests: [] }

for (const s of scenarios) {
  console.log(`\n${s.title}`)

  // Согласованный пакет: щедрый к второй стороне, чтобы согласие было получено
  // уже в первом раунде, когда её притязания ещё высоки.
  let st: NegotiationState = createInitialState(s)
  st.visibleIssues = s.issues.map((i) => i.id)
  const best = enumerateReachable(s, st.visibleIssues)
    .filter((p) => p.userSurplus > 0)
    .reduce((a, b) => (b.opponentSurplus > a.opponentSurplus ? b : a))
  const proposed = sanitizeOffer(s, st, best.deal)
  const v = evaluateOffer(s, st, proposed)
  check(v.verdict === 'accept', `пакет с максимальной совместной ценностью принят (${v.verdict})`)
  st = applyTurn({ scenario: s, state: st, userText: 'Пакет.', llm: neutral, explicitOffer: proposed, precomputedVerdict: v.verdict, counter: v.counter }).state
  check(st.agreedAtRound === 1, 'раунд согласия записан в состояние')

  // Игрок решил продолжить: состояние снова живое, условия остаются в документе.
  const continued: NegotiationState = { ...st, status: 'active' }
  check(
    s.issues.every((i) => continued.deal[i.id] === proposed[i.id]),
    'после «продолжить обсуждение» согласованные условия остаются в соглашении',
  )

  // Раунды кончились: это сделка по согласованному, а не «соглашения нет».
  let out = continued
  for (let i = 0; i < s.maxRounds + 1 && out.status === 'active'; i++) {
    out = applyTurn({ scenario: s, state: out, userText: 'Продолжаем.', llm: neutral }).state
  }
  check(out.status === 'deal', `исчерпание раундов при согласованном пакете — сделка (${out.status})`)
  const r = score(s, out)
  check(!r.headline.includes('соглашения нет'), `разбор не называет это отсутствием соглашения: «${r.headline}»`)

  // Закончить партию самому — не то же самое, что выйти из переговоров.
  // Правило исхода то же, что при исчерпании раундов.
  const endedAgreed = endNow(continued)
  check(endedAgreed.status === 'deal', `закончить при согласованном пакете — сделка (${endedAgreed.status})`)
  check(
    !score(s, endedAgreed).headline.includes('соглашения нет'),
    'разбор после досрочного завершения не называет сделку отсутствием соглашения',
  )
  const endedEmpty = endNow(createInitialState(s))
  check(endedEmpty.status === 'timeout', `закончить без договорённости — соглашения нет (${endedEmpty.status})`)
  check(endedEmpty.status !== 'walkaway', 'досрочное завершение не выдаётся за осознанный выход из переговоров')
  check(endedEmpty.endedEarly === true, 'состояние помнит, что партию закончил игрок, а не таймер')
  check(
    !score(s, endedEmpty).headline.includes('Раунды закончились'),
    `разбор не говорит «раунды закончились» тому, кто нажал «Закончить»: «${score(s, endedEmpty).headline}»`,
  )
  const ranOut = { ...createInitialState(s), status: 'timeout' as const }
  check(
    score(s, ranOut).headline.includes('Раунды закончились'),
    'а исчерпанным раундам заголовок оставлен прежним',
  )

  // Без согласия всё как было: исчерпание раундов — не сделка.
  let empty: NegotiationState = createInitialState(s)
  for (let i = 0; i < s.maxRounds + 1 && empty.status === 'active'; i++) {
    empty = applyTurn({ scenario: s, state: empty, userText: 'Давайте подумаем.', llm: neutral }).state
  }
  check(empty.status === 'timeout', `без согласованного пакета раунды кончаются без сделки (${empty.status})`)
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ сделку закрывает решение игрока, а согласованный пакет не теряется')
