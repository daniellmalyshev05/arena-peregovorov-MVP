/**
 * Сквозные проверки по всему продукту:
 *   1. ловушка из досье не показывается в момент раскрытия интереса;
 *   2. имя другого пола из админки не применяется;
 *   3. «снизить ставку хранения» не подбирается в кейс про повышение тарифа;
 *   4. переход на личность — отдельный момент разбора, а не «копнуть глубже»;
 *   5. блеф помечен ошибкой по BATNA и разбирается отдельно;
 *   6. «почти всегда просите взамен» — только при повторяемости по сессиям;
 *   7. обоснованный выход стоит не меньше, чем уход от сделки на столе.
 */
import { scenarios, getScenario } from '@/lib/scenarios'
import { applyConfig, defaultConfig, matchQuery } from '@/lib/admin/config'
import { pickScenario } from '@/lib/admin/match'
import { rewindCandidates } from '@/lib/engine/rewind'
import { actTags } from '@/lib/techniques'
import { patterns, type RunRecord } from '@/lib/profile'
import { score } from '@/lib/engine/scoring'
import { applyTurn, createInitialState, walkAway } from '@/lib/engine/state'
import { offlineTurn } from '@/lib/llm/offline'
import type { NegotiationState, Scenario } from '@/lib/types'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

function say(s: Scenario, st: NegotiationState, text: string) {
  return applyTurn({ scenario: s, state: st, userText: text, llm: offlineTurn(s, st, text) }).state
}

console.log('1. Ловушка не подтверждается тем, что её открыло\n')
{
  const s = getScenario('resident-attraction')!
  const interest = s.hiddenInterests.find((h) => h.id === 'landForBoard')!
  const probe = s.beliefProbes.find((p) => p.id === interest.probe)!
  check(!probe.truth, `к «${interest.id}» привязана ловушка`)
  check(!/совет/i.test(probe.text), `ловушка не повторяет слова раскрытия про совет: «${probe.text}»`)
  const r = applyTurn({
    scenario: s, state: createInitialState(s), userText: 'Как вы выбираете площадку?',
    llm: { reply: 'Если цифра выбивается из рынка, проект не пропустят, независимо от остальных плюсов.', detectedActs: ['spin_situation'], revealedInterests: [interest.id] },
  })
  check(!r.hint, 'в момент раскрытия ловушка не показывается — только в досье')
}

console.log('\n2. Имя другого пола не ломает тексты\n')
{
  const s = getScenario('supplier-hike')!
  const t = applyConfig(s, { ...defaultConfig(s), opponentName: 'Игорь Соколов' })
  check(t.persona.name === 'Марина Крылова', 'мужское имя на женском персонаже не применяется')
  check(!JSON.stringify(t).includes('Игор'), 'в текстах кейса нет «Игорь настроена»')
  const ok = applyConfig(s, { ...defaultConfig(s), opponentName: 'Анна Петрова' })
  check(ok.persona.name === 'Анна Петрова', 'имя того же пола применяется')
}

console.log('\n3. Направление в подборе и контекст у участника\n')
{
  const cfg = {
    ...defaultConfig(scenarios[0]),
    sphere: 'Логистика',
    topic: 'Продление договора на складское хранение с крупным клиентом',
    opponentGoal: 'Снизить ставку хранения на 20%, иначе уйдёт к другому оператору',
  }
  const top = pickScenario(scenarios, matchQuery(cfg), cfg.opponentGoal)
  check(top.scenario.id === 'client-discount', `требование снизить ставку → ${top.scenario.id}`)
  const t = applyConfig(top.scenario, cfg)
  check(
    t.organizerContext === 'Логистика · Продление договора на складское хранение с крупным клиентом',
    'участник видит, под какой запрос подобран кейс',
  )
  check(applyConfig(top.scenario, defaultConfig(top.scenario)).organizerContext === undefined, 'без контекста строки нет')
}

console.log('\n4. Выпад в адрес человека — отдельный момент для возврата\n')
{
  const s = getScenario('client-discount')!
  let st = createInitialState(s)
  st = say(s, st, 'Елена, вы вообще понимаете, что несёте? Ваши закупщики ничего не смыслят.')
  const insult = st.transcript.find((t) => t.role === 'user')!
  if (!insult.acts.includes('personal_attack')) insult.acts = [...insult.acts, 'personal_attack']
  st = say(s, st, 'Ладно. Какие у вас сроки?')
  st = walkAway(st)
  const c = rewindCandidates(s, st)
  const at = c.find((x) => x.turnIndex === insult.index)
  check(at?.kind === 'personal_attack', `ход с выпадом: ${at?.title ?? 'не выбран'}`)
  check(!c.some((x) => x.kind === 'missed_interest' && x.turnIndex === insult.index), '«копнуть глубже» не стоит на выпаде')
  let sb = createInitialState(s)
  sb = say(s, sb, 'У нас очередь из трёх сетей крупнее вашей. Скидки не будет — соглашайтесь или уходите.')
  const bl = sb.transcript.find((t) => t.role === 'user')!
  if (!bl.acts.includes('bluff')) bl.acts = [...bl.acts, 'bluff']
  sb = walkAway(sb)
  const cb = rewindCandidates(s, sb)
  check(cb.find((x) => x.turnIndex === bl.index)?.kind === 'bluff', 'блеф — отдельный момент «Здесь вы блефовали»')
  check(!cb.some((x) => x.kind === 'missed_interest' && x.turnIndex === bl.index), '«копнуть глубже» не стоит на блефе')
  const missed = c.find((x) => x.kind === 'missed_interest')
  check(!missed || !missed.why.startsWith('Один из'), `число ненайденных интересов названо верно${missed ? `: «${missed.why}»` : ''}`)
}

console.log('\n5. Блеф не получает метку опоры на запасной вариант\n')
{
  const tags = actTags(['bluff', 'walkaway_signal', 'positional_bargaining'])
  check(!tags.some((t) => t.act === 'walkaway_signal'), 'рядом с блефом нет «опоры на запасной вариант»')
  check(tags.find((t) => t.act === 'bluff')?.tone === 'bad', 'блеф помечен как ошибка')
  check(actTags(['walkaway_signal'])[0]?.tone === 'neutral', 'честный сигнал о выходе остаётся нейтральным')
}

console.log('\n6. «Почти всегда просите взамен» — только когда это правда\n')
{
  const run = (over: Partial<RunRecord>): RunRecord => ({
    scenarioId: 'resident-attraction', at: 0, total: 50, userUtility: 50, opponentUtility: 50, status: 'deal',
    revealed: 2, interests: 4, unilateral: 0, conditional: 0, facts: 1, brier: null, acts: {}, training: false, ...over,
  })
  const one = patterns([run({ conditional: 1 }), run({ status: 'walkaway' })])
  check(!one.some((p) => p.id === 'exchange'), 'один обмен за две партии — не привычка')
  const two = patterns([run({ conditional: 1 }), run({ conditional: 2 })])
  check(two.some((p) => p.id === 'exchange'), 'обмен в обеих партиях — привычка')
}

console.log('\n7. Выход без разведки не дешевле ухода от сделки на столе\n')
{
  const s = getScenario('client-discount')!
  const st = walkAway(createInitialState(s))
  const deal = score(s, st).lines.find((l) => l.key === 'deal')!
  check(deal.earned >= 8, `выход, когда из открытого ничего не складывалось: ${deal.earned} из 25`)
  check(!deal.detail.includes('выйти было правильно'), 'без разведки выход не называется правильным')
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ сквозные проверки пройдены')
