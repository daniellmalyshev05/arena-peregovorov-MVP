/** Аудит всех сценариев библиотеки. Тот же движок, что работает в админке. */
import { scenarios } from '../lib/scenarios'
import { auditScenario } from '../lib/engine/audit'
import { count } from '../lib/plural'

const f = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1)
let failures = 0

for (const s of scenarios) {
  const a = auditScenario(s)
  console.log('\n' + '═'.repeat(74))
  console.log(s.title.toUpperCase(), ' · архетип:', s.archetype)
  console.log('═'.repeat(74))
  console.log(`условий: ${s.issues.length}  комбинаций: ${a.totalDeals}  BATNA ${s.userBatna.value}/${s.opponentBatna.value}`)
  console.log(`зона соглашения: ${a.zopaCount} (${(a.zopaShare * 100).toFixed(1)}%)`)
  console.log(`статус-кво:  игрок ${a.statusQuo.user.toFixed(1)} (${f(a.statusQuo.userSurplus)})   оппонент ${a.statusQuo.opponent.toFixed(1)} (${f(a.statusQuo.opponentSurplus)})`)
  console.log(`максимум совместной ценности: ${f(a.maxJointSurplus)}  (игрок ${a.bestJoint.user.toFixed(1)}, оппонент ${a.bestJoint.opponent.toFixed(1)})`)
  if (a.bestForUser) console.log(`лучшее для игрока при согласии оппонента: ${f(a.bestForUser.userSurplus)}`)
  console.log(`дешевле всего отдать: ${a.cheapestToGive.label} (разрыв ${a.cheapestToGive.gap.toFixed(2)})`)
  console.log(`важнее всего держать: ${a.mostImportantToHold.label} (разрыв ${a.mostImportantToHold.gap.toFixed(2)})`)
  console.log(`позиционный торг по видимым условиям: игрок ${f(a.positional.userSurplus)}, оппонент ${f(a.positional.opponentSurplus)}`)

  if (a.issues.length) {
    console.log('\n  ЗАМЕЧАНИЯ:')
    for (const i of a.issues) console.log(`   ${i.severity === 'blocker' ? '✗' : '!'} ${i.text}`)
  }
  if (!a.playable) failures++
  else console.log('\n  ✓ сценарий сбалансирован')
}

console.log('\n' + '═'.repeat(74))
if (failures) { console.error(`сценариев с блокерами: ${failures} из ${scenarios.length}`); process.exit(1) }
// Подсказки первого раунда: три штуки и без спойлеров. Подсказка, называющая
// неоткрытое условие, отдаёт игроку то, что он должен вытащить вопросом.
{
  let bad = 0
  for (const s of scenarios) {
    const openers = s.openers ?? []
    if (openers.length !== 3) {
      bad++
      console.error(`  ✗ ${s.id}: подсказок первого раунда ${openers.length}, нужно 3`)
    }
    const hidden = s.issues.filter((i) => !i.visibleFromStart)
    for (const o of openers) {
      const said = o.toLowerCase().replace(/ё/g, 'е')
      for (const issue of hidden) {
        const stems = issue.label
          .toLowerCase()
          .replace(/ё/g, 'е')
          .split(/[^а-я]+/)
          .filter((w) => w.length >= 6)
          .map((w) => w.slice(0, 6))
        const hit = stems.find((st) => said.includes(st))
        if (hit) {
          bad++
          console.error(`  ✗ ${s.id}: подсказка «${o}» называет неоткрытое условие «${issue.label}»`)
        }
      }
    }
  }
  if (bad) {
    console.error(`подсказок с проблемами: ${bad}`)
    process.exit(1)
  }
  console.log('подсказки первого раунда на месте и не называют неоткрытых условий')
}

console.log(`все сценарии сбалансированы: ${count(scenarios.length, ['сценарий', 'сценария', 'сценариев'])}`)
