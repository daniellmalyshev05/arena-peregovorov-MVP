/**
 * Аркада: соперники сбалансированы тем же аудитом, что и кейсы симулятора,
 * полоска соперника читает движок, фазы речи и ловушки зависят от раунда.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { arcadeOpponents, ARCADE_ROUNDS } from '../lib/arcade/opponents'
import { buildArcadePrompt, phaseOf, trapFor } from '../lib/arcade/prompt'
import { appetite, strikesOf } from '../lib/arcade/hud'
import { auditScenario } from '../lib/engine/audit'
import { achievements, BLITZ_SECONDS } from '../lib/arcade/achievements'
import { applyTurn, createInitialState, evaluateOffer } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import { scenarios } from '../lib/scenarios'

let failures = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${text}`)
}

for (const o of arcadeOpponents) {
  const s = o.scenario
  console.log(`\n${s.title}`)
  const audit = auditScenario(s)
  check(audit.playable, `аудит без блокеров${audit.issues.length ? ': ' + audit.issues.map((i) => i.text).join('; ') : ''}`)
  check(s.issues.length === 3 && s.issues.every((i) => i.options.length === 3), 'три условия по три уровня')
  check(s.issues.filter((i) => !i.visibleFromStart).length === 1, 'одно условие скрыто')
  const hidden = s.issues.find((i) => !i.visibleFromStart)!
  check(s.hiddenInterests.some((h) => h.revealsIssue === hidden.id), 'скрытое условие открывается интересом')
  check(s.hiddenInterests.length === 3, 'три скрытых интереса — три деления ульты')
  check(s.maxRounds === ARCADE_ROUNDS, `${ARCADE_ROUNDS} раундов`)
  check((s.openers ?? []).length === 3, 'три подсказки первого хода')
  check(existsSync(join(process.cwd(), 'public', 'arcade', s.persona.portrait!)), `портрет ${s.persona.portrait}`)
  check(scenarios.some((c) => c.id === o.practiceCaseId), `мост в симулятор: ${o.practiceCaseId}`)
  check(!scenarios.some((c) => c.id === s.id), 'соперник не попадает в холл симулятора')

  const start = createInitialState(s)
  check(appetite(o, start) === 1, 'полоска в начале полная')
  const late = { ...start, round: ARCADE_ROUNDS }
  check(appetite(o, late) < 1, 'к последнему раунду полоска ниже')

  // Жадный пакет по открытым условиям в первом раунде не проходит.
  const greedy = Object.fromEntries(s.issues.filter((i) => i.visibleFromStart).map((i) => [i.id, i.options[2].id]))
  check(evaluateOffer(s, start, greedy).verdict !== 'accept', 'жадный пакет в первом раунде не проходит')

  // Разведка окупается: со скрытым условием на столе обмен проходит раньше,
  // чем такой же пакет без него.
  const opened = { ...start, visibleIssues: s.issues.map((i) => i.id) }
  const fair = Object.fromEntries(s.issues.map((i) => [i.id, i.visibleFromStart ? i.options[1].id : i.options[2].id]))
  const acceptedAt = (st: typeof start, deal: Record<string, string>) => {
    for (let r = 1; r <= ARCADE_ROUNDS; r++) if (evaluateOffer(s, { ...st, round: r }, deal).verdict === 'accept') return r
    return Infinity
  }
  const withIntel = acceptedAt(opened, fair)
  const blind = acceptedAt(start, Object.fromEntries(s.issues.map((i) => [i.id, i.visibleFromStart ? i.options[1].id : i.defaultOptionId])))
  check(withIntel <= blind && withIntel <= ARCADE_ROUNDS, `обмен с раскрытым условием проходит не позже (раунд ${withIntel} против ${blind === Infinity ? 'никогда' : blind})`)

  // Партия запасным движком доходит до конца без сбоев.
  let st = start
  for (const line of s.openers ?? []) {
    if (st.status !== 'active') break
    st = applyTurn({ scenario: s, state: st, userText: line, llm: offlineTurn(s, st, line) }).state
  }
  check(st.transcript.length === 7, 'запасной движок отвечает на подсказки')
}

console.log('\nРечь по фазам')
const king = arcadeOpponents.find((o) => o.phases)!
check(phaseOf(1, 6) === 0 && phaseOf(3, 6) === 1 && phaseOf(5, 6) === 2, 'фазы: 1–2 начало, 3–4 середина, 5–6 финал')
const early = buildArcadePrompt(king, { ...createInitialState(king.scenario), round: 1 })
const final = buildArcadePrompt(king, { ...createInitialState(king.scenario), round: 5 })
check(early.includes(king.phases![0]) && !early.includes(king.phases![2]), 'в начале — установка на спешку')
check(final.includes(king.phases![2]) && !final.includes(king.phases![0]), 'в финале — установка без сроков')
check(!!trapFor(king, 2) && !!trapFor(king, 4) && !trapFor(king, 3), 'ловушки во втором и четвёртом раунде')

console.log('\nУдары')
check(strikesOf(['spin_problem', 'spin_situation']).length === 1, 'два вопроса — один удар')
check(strikesOf(['unilateral_concession', 'spin_problem'])[0].good, 'точные удары идут первыми')

console.log('\nАчивки')
{
  const o = arcadeOpponents[0]
  const s = o.scenario
  const turn = (acts: string[], verdict?: 'accept' | 'counter' | 'reject') =>
    ({ index: 0, role: 'user', text: '', acts, dealChanges: [], revealed: [], verdict, timestamp: 0 }) as never
  const base = createInitialState(s)
  const ids = (st: typeof base, deal: boolean, seconds: number, previousBest?: number) =>
    achievements({ opponent: o, state: st, deal, seconds, previousBest }).map((a) => a.id)

  const clean = { ...base, transcript: [turn(['spin_problem']), turn(['conditional_offer'], 'accept')] }
  const got = ids(clean, true, 45)
  check(got.includes('first_package') && got.includes('no_concession') && got.includes('no_pressure'), 'чистая сделка с первого пакета')
  check(!got.includes('blitz') && !got.includes('record'), 'без «Блица» и рекорда, если не заслужены')
  check(ids(clean, true, BLITZ_SECONDS - 1).includes('blitz'), `«Блиц» — быстрее ${BLITZ_SECONDS} секунд`)
  check(!ids(clean, true, 20).includes('record'), 'первая сделка у соперника — не рекорд')
  check(ids(clean, true, 40, 45).includes('record') && !ids(clean, true, 45, 45).includes('record'), 'рекорд — только если побит прежний')

  const two = { ...base, transcript: [turn([], 'counter'), turn(['spin_problem']), turn([], 'accept')] }
  check(!ids(two, true, 45).includes('first_package'), 'со второго пакета — не «С первого пакета»')
  const rude = { ...base, transcript: [turn(['personal_attack']), turn(['spin_problem'], 'accept')] }
  check(!ids(rude, true, 45).includes('no_pressure'), 'давление снимает «Без давления»')
  const gave = { ...base, unilateralConcessions: 1, transcript: [turn(['unilateral_concession']), turn([], 'accept')] }
  check(!ids(gave, true, 45).includes('no_concession'), 'уступка даром снимает «Без единой уступки»')

  const seen = { ...base, revealedInterests: s.hiddenInterests.map((h) => h.id), transcript: [turn(['spin_problem']), turn(['spin_situation'])] }
  const lost = ids(seen, false, 120)
  check(lost.includes('all_revealed') && lost.includes('no_pressure'), 'без сделки — только «Видит насквозь» и «Без давления»')
  check(!lost.some((id) => id === 'first_package' || id === 'no_concession' || id === 'blitz' || id === 'record'), 'сделочные ачивки без сделки не даются')

  const all = { ...seen, transcript: [turn(['spin_problem']), turn([], 'accept')] }
  const top = ids(all, true, 10, 30)
  check(top.length === 3 && top[0] === 'all_revealed', 'не больше трёх, самые редкие первыми')
  check(ids({ ...base, transcript: [turn(['spin_problem'])] }, false, 120).length === 0, 'один ход без находок — без ачивок')
}

console.log()
if (failures) {
  console.error(`провалено проверок: ${failures}`)
  process.exit(1)
}
console.log('аркада в порядке')
