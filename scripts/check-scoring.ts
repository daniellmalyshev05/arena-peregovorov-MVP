import { residentAttraction as s } from '../lib/scenarios/resident-attraction'
import { score } from '../lib/engine/scoring'
import { initialDeal } from '../lib/engine/utility'
import type { NegotiationState, Turn } from '../lib/types'

const turn = (i: number, role: Turn['role'], text: string, acts: Turn['acts'], changes: Turn['dealChanges'] = []): Turn => ({
  index: i, role, text, acts, dealChanges: changes, revealed: [], timestamp: 0,
})

const base = (over: Partial<NegotiationState>): NegotiationState => ({
  scenarioId: s.id, round: 8, deal: initialDeal(s), visibleIssues: [], revealedInterests: [],
  mood: { trust: 50, irritation: 20, pressure: 30, flexibility: 50 },
  playedFacts: [], hypotheses: [], transcript: [], status: 'deal',
  unilateralConcessions: 0, conditionalOffers: 0, ...over,
})

const report = (name: string, st: NegotiationState) => {
  const r = score(s, st)
  console.log('\n' + '═'.repeat(74))
  console.log(name.toUpperCase(), '→', r.total, 'из 100')
  console.log('═'.repeat(74))
  console.log(r.headline)
  console.log('  ' + r.rootCause)
  console.log()
  for (const l of r.lines) {
    const bar = '█'.repeat(Math.round((l.earned / l.max) * 18)).padEnd(18, '·')
    console.log('  ' + bar + ' ' + String(l.earned).padStart(5) + '/' + l.max + '  ' + l.label)
  }
  if (r.penalties.length) {
    console.log('\n  штрафы:')
    for (const p of r.penalties) console.log('   −' + p.points + '  ' + p.label)
  }
}

// A. Позиционный торг: отдал землю и объём, ничего не выяснил, гипотезы наивные.
report('Позиционный торг', base({
  deal: { investment: 'inv_09', site: 'site_discount', launch: 'launch_q4_2027', jobs: 'jobs_240', grid: 'grid_standard', local: 'local_none' },
  revealedInterests: [],
  unilateralConcessions: 3,
  conditionalOffers: 0,
  mood: { trust: 35, irritation: 45, pressure: 60, flexibility: 30 },
  hypotheses: [
    { id: 's1_b2', text: '', confidence: 0.9 },
    { id: 's1_b6', text: '', confidence: 0.8 },
  ],
  transcript: [
    turn(1, 'user', 'Готовы обсудить снижение ставки', ['positional_bargaining', 'unilateral_concession'], [{ issueId: 'site', from: 'site_std', to: 'site_discount' }]),
    turn(3, 'user', 'Хорошо, дадим минус сорок', ['unilateral_concession'], [{ issueId: 'investment', from: 'inv_12', to: 'inv_09' }]),
  ],
}))

// B. Интегративный обмен: раскрыл интересы, торговал условиями, гипотезы точные.
report('Интегративный обмен', base({
  deal: { investment: 'inv_15', site: 'site_std', launch: 'launch_q2_2027', jobs: 'jobs_340', grid: 'grid_march', local: 'local_100' },
  revealedInterests: ['gridRisk', 'staffRisk', 'landForBoard'],
  unilateralConcessions: 0,
  conditionalOffers: 3,
  playedFacts: ['altDelay', 'polytech'],
  mood: { trust: 72, irritation: 12, pressure: 25, flexibility: 70 },
  hypotheses: [
    { id: 's1_b1', text: '', confidence: 0.9 },
    { id: 's1_b2', text: '', confidence: 0.15 },
    { id: 's1_b4', text: '', confidence: 0.85 },
    { id: 's1_b6', text: '', confidence: 0.2 },
    { id: 's1_b5', text: '', confidence: 0.1 },
    { id: 's1_b3', text: '', confidence: 0.7 },
  ],
  transcript: [
    turn(2, 'user', 'Что произойдёт, если подключение сдвинется на год?', ['spin_implication']),
    turn(4, 'user', 'Средний срок ТП на гринфилде — 14 месяцев', ['objective_criterion'], [{ issueId: 'grid', from: 'grid_standard', to: 'grid_july' }]),
    turn(6, 'user', 'Гарантируем март, если объём остаётся 1,5 и 320 мест', ['conditional_offer'], [
      { issueId: 'grid', from: 'grid_july', to: 'grid_march' },
      { issueId: 'jobs', from: 'jobs_240', to: 'jobs_340' },
      { issueId: 'local', from: 'local_none', to: 'local_100' },
    ]),
  ],
}))
