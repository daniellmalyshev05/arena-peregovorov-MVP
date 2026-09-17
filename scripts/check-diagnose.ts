/**
 * Главный вывод разбора.
 *
 * Разбор показывает один заголовок крупно — и именно его жюри читает первым.
 * Значит он обязан быть верным во всех исходах, а не только в удачном.
 *
 * Числа в случае «ценность создана, но досталась не вам» взяты с живого
 * прогона через Vercel: 99% созданной ценности, 8,1 выигрыша при справедливой
 * доле 20,1. До этой ветки разбор писал «Сильная сделка» над результатом 45
 * из 100 — то самое несоответствие, которое ловится за секунду.
 */
import { scenarios } from '@/lib/scenarios'
import { createInitialState } from '@/lib/engine/state'
import { score } from '@/lib/engine/scoring'
import { analyze, initialDeal } from '@/lib/engine/utility'
import type { Deal, NegotiationState } from '@/lib/types'

let failed = 0
const check = (ok: boolean | undefined, what: string) => {
  if (!ok) {
    failed++
    console.log('  ✗', what)
  }
}

const s = scenarios[0]

function state(over: Partial<NegotiationState> & { deal?: Deal }): NegotiationState {
  return {
    ...createInitialState(s),
    visibleIssues: s.issues.map((i) => i.id),
    revealedInterests: s.hiddenInterests.map((h) => h.id),
    ...over,
  }
}

console.log('Главный вывод разбора\n')

// 1. Раунды кончились — соглашения нет.
{
  const r = score(s, state({ status: 'timeout', deal: initialDeal(s) }))
  check(r.headline.includes('соглашения нет'), 'таймаут не выдаётся за сделку')
}

// 2. Выход из переговоров.
{
  const r = score(s, state({ status: 'walkaway', deal: initialDeal(s) }))
  check(r.headline.startsWith('Вы вышли из переговоров'), 'выход назван выходом')
}

// 3. Сделка хуже запасного варианта.
{
  const bad: Deal = { ...initialDeal(s), site: 'site_discount', grid: 'grid_march', local: 'local_150', investment: 'inv_09' }
  const r = score(s, state({ status: 'deal', deal: bad, unilateralConcessions: 2 }))
  const e = analyze(s, bad)
  check(e.current.userSurplus < 0, 'проверочная сделка действительно хуже отказа')
  check(r.headline.includes('хуже вашего запасного варианта'), 'убыточная сделка названа убыточной')
}

// 4. Ценность создана, но досталась не вам — исход живого прогона.
{
  const deal: Deal = {
    investment: 'inv_18', site: 'site_discount', launch: 'launch_q4_2027',
    jobs: 'jobs_460', grid: 'grid_march', local: 'local_150',
  }
  const e = analyze(s, deal)
  const fair = e.maxJointSurplus / 2
  check(e.efficiency > 0.9, 'совместная ценность почти максимальна')
  check(e.current.userSurplus > 0 && e.current.userSurplus < fair * 0.6, 'доля игрока заметно ниже справедливой')

  const r = score(s, state({ status: 'deal', deal, unilateralConcessions: 1 }))
  check(r.headline === 'Ценность создана, но досталась не вам', 'перекос в дележе назван прямо')
  check(!r.headline.includes('Сильная сделка'), 'такой исход не выдаётся за сильную сделку')
  check(r.rootCause.includes(fair.toFixed(1)), 'в причине названа справедливая доля')
  check(r.total < 60, 'балл соответствует заголовку')
}

// 5. Действительно сильная сделка остаётся сильной.
{
  const e0 = analyze(s, initialDeal(s))
  const best = e0.frontier
    .filter((d) => d.userSurplus > 0 && d.opponentSurplus > 0)
    .sort((a, b) => Math.abs(a.userSurplus - a.opponentSurplus) - Math.abs(b.userSurplus - b.opponentSurplus))[0]
  check(!!best, 'на границе возможного есть равновесная сделка')
  if (best) {
    const r = score(s, state({ status: 'deal', deal: best.deal, conditionalOffers: 3 }))
    check(r.headline.startsWith('Сильная сделка'), 'равный делёж по границе назван сильной сделкой')
  }
}

console.log(failed === 0 ? '\n✓ заголовок разбора верен во всех исходах' : `\n${failed} провалов`)
process.exit(failed === 0 ? 0 : 1)
