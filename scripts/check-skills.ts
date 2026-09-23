/**
 * Навыки-допуски.
 *
 * ТЗ (§2.4) просит прогрессию и развитие персонажа. Проверяется то, ради чего
 * навык вообще введён: он не выдаётся за одну удачную сессию, появляется
 * ровно на второй подтверждающей и показывается игроку один раз — в разборе
 * той сессии, которая его закрыла.
 */
import { newlyMastered, skills, type RunRecord } from '../lib/profile'
import { computeAdaptation, forecastAdaptation } from '../lib/engine/adaptive'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  scenarioId: 'resident-attraction',
  at: Date.now(),
  total: 70,
  userUtility: 60,
  opponentUtility: 55,
  status: 'deal',
  revealed: 4,
  interests: 4,
  unilateral: 0,
  conditional: 2,
  facts: 2,
  belowBatna: false,
  brier: 0.1,
  acts: {},
  training: false,
  ...over,
})

const status = (runs: RunRecord[], id: string) => skills(runs).find((s) => s.id === id)?.status

console.log('Навык не выдаётся за одну сессию')
check(skills([]).every((s) => s.status === 'untested'), 'пустой профиль — все навыки не проверялись')
check(status([run()], 'discovery') === 'seen', 'одна сильная сессия навык не закрывает, но не прячется')
check(status([run(), run()], 'discovery') === 'mastered', 'две подтверждающие сессии — навык освоен')

console.log('\nНавык требует именно повторяемости')
check(status([run(), run({ revealed: 1 })], 'discovery') === 'learning', 'одна сильная и одна слабая — «в работе»')
check(status([run({ unilateral: 2 }), run({ unilateral: 1 })], 'exchange') === 'learning', 'уступки без обмена не дают дисциплину')
check(status([run({ facts: 0 }), run({ facts: 1 })], 'criteria') === 'learning', 'один факт за сессию — ещё не опора на факты')
check(status([run({ belowBatna: true }), run()], 'walkaway') === 'learning', 'сделка хуже отказа ломает сравнение с отказом')

console.log('\nТренировочные сессии в зачёт не идут')
check(status([run(), run({ training: true }), run({ training: true })], 'discovery') === 'seen', 'ветки после возврата навык не закрывают')

console.log('\nМодель второй стороны считается только по оценённым сессиям')
check(status([run({ brier: null }), run({ brier: null })], 'model') === 'untested', 'без оценок в досье навык не проверялся')
check(status([run({ brier: 0.05 }), run({ brier: 0.1 })], 'model') === 'mastered', 'две точные сессии — навык освоен')
check(status([run({ brier: 0.5 }), run({ brier: 0.4 })], 'model') === 'learning', 'самоуверенные оценки навык не дают')

console.log('\nУведомление показывается один раз')
{
  const two = [run(), run()]
  const fresh = newlyMastered(two).map((s) => s.id)
  check(fresh.includes('discovery') && fresh.includes('exchange'), 'сессия, закрывшая навык, показывает его в разборе')
  check(newlyMastered([...two, run()]).length === 0, 'следующая сессия тот же навык повторно не объявляет')
  check(newlyMastered([run()]).length === 0, 'первая сессия ничего не объявляет')
}

console.log('\nПосле одной сессии профиль говорит по существу')
{
  const one = skills([run()])
  check(one.every((sk) => sk.status !== 'untested' || sk.id === 'model'), 'ни один сыгранный навык не остаётся «не проверялся»')
  check(one.every((sk) => sk.detail.trim().length > 0), 'у каждого навыка есть, что сказать')
  const weakRun = skills([run({ revealed: 0, facts: 0, unilateral: 2, belowBatna: true, brier: 0.6 })])
  check(weakRun.every((sk) => sk.status === 'seen'), 'слабая первая сессия тоже описана, а не спрятана')
  check(
    weakRun.find((sk) => sk.id === 'walkaway')!.detail.includes('хуже вашего запасного варианта'),
    'провал назван своими словами',
  )
  check(skills([run({ brier: null })]).find((sk) => sk.id === 'model')!.status === 'untested', 'без оценок в досье навык честно не проверялся')

  const fc = forecastAdaptation([run({ unilateral: 2, revealed: 0, facts: 0 })])
  check(fc.targets.length > 0, `прогноз оппонента строится по одной сессии (${fc.targets.join(', ')})`)
  check(forecastAdaptation([run(), run()]).targets.length === 0, 'со второй сессии прогноз уступает место настоящей адаптации')
  check(computeAdaptation([run({ unilateral: 2 })]).targets.length === 0, 'порог адаптации не сдвинут: одна сессия оппонента не меняет')
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ навыки закрываются повторяемостью и объявляются один раз')
