/** Паттерны профиля: появляются только при повторяемости и описывают реальные привычки. */
import { patterns, type RunRecord } from '../lib/profile'

const base = (o: Partial<RunRecord>): RunRecord => ({
  scenarioId: 'resident-attraction', at: 0, total: 50, userUtility: 60, opponentUtility: 60,
  status: 'deal', revealed: 2, interests: 4, unilateral: 0, conditional: 2, facts: 2,
  brier: 0.1, acts: { spin_implication: 1 }, training: false, ...o,
})

const show = (name: string, runs: RunRecord[]) => {
  const p = patterns(runs)
  console.log(`\n${name} → паттернов: ${p.length}`)
  for (const x of p) console.log(`  ${x.tone === 'weak' ? '△' : '✓'} ${x.title}`)
  return p
}

const fails: string[] = []

const one = show('ОДИН ПРОГОН', [base({})])
if (one.length) fails.push('паттерн выведен по одному прогону')

const training = show('ДВА ПРОГОНА, ОБА ТРЕНИРОВОЧНЫЕ', [base({ training: true }), base({ training: true })])
if (training.length) fails.push('тренировочные прогоны попали в статистику')

const conceder = show('УСТУПАЕТ БЕЗ ОБМЕНА', [
  base({ unilateral: 2, conditional: 0, acts: {} }),
  base({ unilateral: 1, conditional: 0, acts: {} }),
  base({ unilateral: 3, conditional: 0, acts: {} }),
])
if (!conceder.some((p) => p.id === 'unilateral')) fails.push('привычка уступать не распознана')
if (!conceder.some((p) => p.id === 'no_implication')) fails.push('отсутствие Implication-вопросов не распознано')

const good = show('СИЛЬНЫЙ ПЕРЕГОВОРЩИК', [
  base({ revealed: 4, conditional: 3, brier: 0.06, facts: 2 }),
  base({ revealed: 4, conditional: 4, brier: 0.08, facts: 3 }),
])
if (!good.some((p) => p.tone === 'strong')) fails.push('сильные стороны не отмечаются')
if (good.some((p) => p.id === 'unilateral')) fails.push('ложная тревога по уступкам')

const closer = show('ЗАКРЫВАЕТ ПЛОХИЕ СДЕЛКИ', [
  base({ total: 12 }), base({ total: 18 }), base({ total: 20 }),
])
if (!closer.some((p) => p.id === 'closer')) fails.push('привычка закрывать сделку хуже отказа не распознана')

console.log('\n' + '═'.repeat(60))
if (fails.length) { console.error('ОШИБКИ:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('✓ профиль считает привычки, а не случайности')
