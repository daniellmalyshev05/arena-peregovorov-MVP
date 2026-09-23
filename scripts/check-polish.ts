/**
 * Косяки с полного прогона 23 сентября, каждый — отдельной проверкой.
 *
 *   1. Имя из админки доходит до всех текстов кейса, в нужном падеже.
 *   2. Выход из переговоров не засчитывает навык «Сравнение с отказом».
 *   3. Ранний конец разговора не называется «раунды закончились».
 *   4. Отрицательные числа — с типографским минусом.
 */
import { scenarios, getScenario } from '@/lib/scenarios'
import { applyConfig, defaultConfig } from '@/lib/admin/config'
import { isFemaleName, renamer } from '@/lib/admin/rename'
import { createInitialState, endNow, walkAway } from '@/lib/engine/state'
import { score } from '@/lib/engine/scoring'
import { buildRun, skills } from '@/lib/profile'
import { signed } from '@/lib/text'
import { analyze } from '@/lib/engine/utility'

let failed = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

console.log('Имя из админки\n')
for (const sc of scenarios) {
  const female = isFemaleName(sc.persona.name.split(' ')[0])
  const t = applyConfig(sc, { ...defaultConfig(sc), opponentName: female ? 'Анна Петрова' : 'Игорь Лебедев' })
  const json = JSON.stringify({ ...t, persona: { ...t.persona, portrait: undefined } })
  const first = sc.persona.name.split(' ')[0]
  const left = json.match(new RegExp(`(?<![а-яё])${first.slice(0, 4)}[а-яё]*`, 'g')) ?? []
  check(!left.length, `${sc.id}: библиотечного имени не осталось${left.length ? ` (${left.join(', ')})` : ''}`)
}
const r = renamer('Виктор Ремизов', 'Анна Петрова')
check(r('Главный риск Виктора') === 'Главный риск Анны', 'родительный: «риск Виктора» → «риск Анны»')
check(r('Роману нужен') === 'Роману нужен', 'чужое имя не трогается')
check(renamer('Марина Крылова', 'Игорь Лебедев')('Марине выгоднее') === 'Игорю выгоднее', 'дательный: «Марине» → «Игорю»')
check(r('Викторина') === 'Викторина', 'слово, начинающееся с имени, не трогается')
check(isFemaleName('Анна') && !isFemaleName('Илья') && !isFemaleName('Денис'), 'пол имени для подсказки в админке')
for (const sc of scenarios) {
  const female = isFemaleName(sc.persona.name.split(' ')[0])
  const other = female ? 'Игорь Соколов' : 'Анна Петрова'
  const t = applyConfig(sc, { ...defaultConfig(sc), opponentName: other })
  check(
    t.persona.name === sc.persona.name && !JSON.stringify(t).includes(other.split(' ')[0]),
    `${sc.id}: имя другого пола не подставляется — «${other}» остаётся «${sc.persona.name}»`,
  )
}

console.log('\nНавык «Сравнение с отказом»\n')
{
  const sc = getScenario('contractor-delay')!
  const quit = walkAway(createInitialState(sc))
  const run = buildRun(sc, quit, score(sc, quit), false)
  const skill = skills([run, { ...run, at: run.at + 1 }]).find((s) => s.id === 'walkaway')!
  check(skill.status === 'untested', `два выхода там, где договориться было можно, навык не зачитывают (${skill.status})`)

  // Кейс, где отказ сильнее любой сделки: выход там — и есть навык. В
  // библиотеке такого кейса нет, поэтому запасной вариант поднят вручную.
  const hopeless = { ...sc, userBatna: { ...sc.userBatna, value: 99 } }
  check(!analyze(hopeless, createInitialState(hopeless).deal).zopaExists, 'подготовлен кейс без зоны соглашения')
  const right = walkAway(createInitialState(hopeless))
  const good = buildRun(hopeless, right, score(hopeless, right), false)
  const mastered = skills([good, { ...good, at: good.at + 1 }]).find((s) => s.id === 'walkaway')!
  check(mastered.status === 'mastered', `верный выход дважды — навык освоен (${mastered.status})`)
}

console.log('\nРанний конец разговора\n')
{
  const sc = getScenario('retention-offer')!
  const early = endNow(createInitialState(sc))
  const deal = score(sc, early).lines.find((l) => l.key === 'deal')!
  check(!deal.detail.includes('Раунды закончились'), `строка результата: «${deal.detail}»`)
}

console.log('\nЗнак числа\n')
check(signed(-13.4) === '−13,4' && signed(12, 0) === '+12' && signed(-0.3, 0) === '+0', 'минус типографский, ноль с плюсом')

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.log(`✗ провалено проверок: ${failed}`)
  process.exit(1)
}
console.log('✓ косяки полного прогона закрыты')
