import { residentAttraction as s } from '../lib/scenarios/resident-attraction'
import { analyze, describe, enumerateDeals, initialDeal, paretoFrontier, zopa } from '../lib/engine/utility'
import type { Deal } from '../lib/types'

const fmt = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1)
const line = (t: string) => console.log('\n' + t + '\n' + '─'.repeat(t.length))

const all = enumerateDeals(s)
const inZopa = zopa(all)
const frontier = paretoFrontier(all)

line('СЦЕНАРИЙ: ' + s.title)
console.log('всего комбинаций условий:', all.length)
console.log('BATNA игрока:', s.userBatna.value, '| BATNA оппонента:', s.opponentBatna.value)
console.log('в зоне соглашения (ZOPA):', inZopa.length, `(${((inZopa.length / all.length) * 100).toFixed(1)}% всех вариантов)`)
console.log('точек на границе Парето:', frontier.length)

const show = (name: string, deal: Deal) => {
  const p = describe(s, deal)
  const a = analyze(s, deal)
  console.log(
    `\n${name}\n  игрок ${p.user.toFixed(1)} (${fmt(p.userSurplus)} к BATNA)` +
      `   оппонент ${p.opponent.toFixed(1)} (${fmt(p.opponentSurplus)} к BATNA)` +
      `\n  совместная ценность ${fmt(p.jointSurplus)} из ${fmt(a.maxJointSurplus)}` +
      `   эффективность ${(a.efficiency * 100).toFixed(0)}%` +
      `   осталось на столе ${a.valueLeftOnTable.toFixed(1)}`,
  )
  const verdict = p.userSurplus < 0 ? 'ПОРАЖЕНИЕ: хуже собственной BATNA' : p.opponentSurplus < 0 ? 'оппонент откажется' : 'сделка состоится'
  console.log('  →', verdict)
}

line('КЛЮЧЕВЫЕ ИСХОДЫ')

show('Статус-кво (никто не сдвинулся)', initialDeal(s))

show('Позиционный торг: отдал землю и объём, ничего не выяснил', {
  investment: 'inv_09', site: 'site_discount', launch: 'launch_q4_2027',
  jobs: 'jobs_240', grid: 'grid_standard', local: 'local_none',
})

show('Жёсткая линия: ничего не отдал', {
  investment: 'inv_18', site: 'site_buyout', launch: 'launch_q4_2026',
  jobs: 'jobs_460', grid: 'grid_standard', local: 'local_none',
})

show('Интегративный обмен: отдал подключение и кадры, удержал объём и места', {
  investment: 'inv_15', site: 'site_std', launch: 'launch_q2_2027',
  jobs: 'jobs_340', grid: 'grid_march', local: 'local_100',
})

line('ЛУЧШЕЕ, ЧТО ВООБЩЕ ДОСТИЖИМО')

const bestJoint = all.reduce((a, b) => (b.jointSurplus > a.jointSurplus ? b : a))
console.log('максимальная совместная ценность:', fmt(bestJoint.jointSurplus))
console.log('  игрок', bestJoint.user.toFixed(1), '| оппонент', bestJoint.opponent.toFixed(1))
console.log('  условия:', Object.entries(bestJoint.deal).map(([k, v]) => `${k}=${v}`).join(', '))

const bestForUser = inZopa.reduce((a, b) => (b.userSurplus > a.userSurplus ? b : a))
console.log('\nлучшее для игрока при согласии оппонента:', fmt(bestForUser.userSurplus))
console.log('  условия:', Object.entries(bestForUser.deal).map(([k, v]) => `${k}=${v}`).join(', '))

line('ВЕС УСЛОВИЙ: ГДЕ СПРЯТАНА ВЗАИМНАЯ ВЫГОДА')
console.log('условие'.padEnd(24), 'игрок'.padStart(7), 'оппонент'.padStart(10), '  разрыв приоритетов')
for (const i of s.issues) {
  const gap = i.weightOpponent - i.weightUser
  const marker = gap > 0.12 ? '  ← дёшево отдать, дорого для него' : gap < -0.1 ? '  ← держать' : ''
  console.log(i.label.padEnd(24), i.weightUser.toFixed(2).padStart(7), i.weightOpponent.toFixed(2).padStart(10), marker)
}

const wu = s.issues.reduce((a, i) => a + i.weightUser, 0)
const wo = s.issues.reduce((a, i) => a + i.weightOpponent, 0)
console.log('\nсумма весов — игрок:', wu.toFixed(3), '| оппонент:', wo.toFixed(3))
if (Math.abs(wu - 1) > 0.001 || Math.abs(wo - 1) > 0.001) {
  console.error('ОШИБКА: веса не нормированы')
  process.exit(1)
}
