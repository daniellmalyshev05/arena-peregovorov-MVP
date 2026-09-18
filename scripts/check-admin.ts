/** Настройки администратора должны РЕАЛЬНО менять сценарий, а не только подписи. */
import { scenarios, getScenario } from '../lib/scenarios'
import { decapitalize } from '@/lib/text'
import { applyConfig, defaultConfig } from '../lib/admin/config'
import { auditScenario } from '../lib/engine/audit'

const base = getScenario('resident-attraction')!
console.log('БАЗА:', base.title)
console.log('─'.repeat(70))
console.log('сложность   зона соглашения   позиционный торг   играбелен')

const shares: number[] = []
for (let d = 1; d <= 5; d++) {
  const tuned = applyConfig(base, { ...defaultConfig(base), difficulty: d })
  const a = auditScenario(tuned)
  shares.push(a.zopaShare)
  console.log(
    String(d).padEnd(11),
    ((a.zopaShare * 100).toFixed(1) + '%').padStart(15),
    ((a.positional.userSurplus >= 0 ? '+' : '') + a.positional.userSurplus.toFixed(1)).padStart(18),
    (a.playable ? '  да' : '  НЕТ: ' + a.issues.filter((i) => i.severity === 'blocker')[0]?.text).padStart(11),
  )
}

console.log('\nТОН МЕНЯЕТ ПОВЕДЕНИЕ, А НЕ ПОДПИСЬ')
for (const tone of ['hard_negotiator', 'partner'] as const) {
  const tuned = applyConfig(base, { ...defaultConfig(base), tone })
  console.log(' ', tone.padEnd(20), 'архетип в сценарии →', tuned.archetype)
}

console.log('\nВСЯ БИБЛИОТЕКА ПЕРЕЖИВАЕТ НАСТРОЙКУ')
let bad = 0
for (const s of scenarios) {
  for (let d = 1; d <= 5; d++) {
    const a = auditScenario(applyConfig(s, { ...defaultConfig(s), difficulty: d }))
    if (!a.playable) { bad++; console.log(`  ✗ ${s.title}, сложность ${d}: ${a.issues[0]?.text}`) }
  }
}
if (!bad) console.log('  ✓ 4 сценария × 5 уровней сложности — все играбельны')

console.log('\nКОНТЕКСТ НЕ ПЕРЕИМЕНОВЫВАЕТ КЕЙС')
/**
 * Регрессия, из-за которой ссылка администратора отдавала участнику несвязный
 * экран: слова из полей «сфера», «тема» и «чего он добивается» подменяли
 * заголовок, подзаголовок и публичную позицию. Шапка говорила про ИТ-бюджет,
 * вторая сторона представлялась финансовым директором, а первой репликой
 * торговалась цена земли. Контекст выбирает кейс, а не переписывает его.
 */
let renamed = 0
for (const s of scenarios) {
  const tuned = applyConfig(s, {
    ...defaultConfig(s),
    sphere: 'ИТ',
    topic: 'Бюджет ИТ-департамента на 2027 год',
    opponentGoal: 'Срезать бюджет на 20% и не обсуждать это',
  })
  const same =
    tuned.title === s.title &&
    tuned.subtitle === s.subtitle &&
    tuned.userBrief === s.userBrief &&
    tuned.persona.openingPosition === s.persona.openingPosition &&
    tuned.persona.openingLine === s.persona.openingLine
  if (!same) { renamed++; console.log(`  ✗ ${s.id}: подписи кейса переписаны контекстом администратора`) }
  if (tuned.organizerNote !== 'Срезать бюджет на 20% и не обсуждать это') {
    renamed++
    console.log(`  ✗ ${s.id}: цель второй стороны не доехала до модели отдельной установкой`)
  }
}
if (!renamed) console.log('  ✓ заголовок, бриф и первая реплика остаются от подобранного кейса')

console.log('\nПОДСТАНОВКА В СЕРЕДИНУ ПРЕДЛОЖЕНИЯ НЕ ЛОМАЕТ АББРЕВИАТУРЫ')
let caps = 0
for (const [input, expected] of [
  ['По земле вы дороже двух других вариантов', 'по земле вы дороже двух других вариантов'],
  ['ИТ-бюджет срезать не дам', 'ИТ-бюджет срезать не дам'],
  ['ОЭЗ должна пойти навстречу', 'ОЭЗ должна пойти навстречу'],
  ['', ''],
] as const) {
  const got = decapitalize(input)
  if (got !== expected) { caps++; console.log(`  ✗ «${input}» → «${got}», ожидалось «${expected}»`) }
}
if (!caps) console.log('  ✓ первая буква строчная, аббревиатура в начале не трогается')

console.log('\n' + '═'.repeat(70))
const fails: string[] = []
if (caps) fails.push('подстановка ломает аббревиатуры')
if (renamed) fails.push('контекст администратора переписывает подписи кейса')
if (!(shares[0] > shares[4])) fails.push('сложность не сужает зону соглашения')
if (shares[0] - shares[4] < 0.05) fails.push('разница между лёгкой и жёсткой сложностью почти незаметна')
if (bad) fails.push(`вырожденных комбинаций: ${bad}`)
if (fails.length) { console.error('ОШИБКИ:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('✓ настройки администратора меняют математику сценария, а не только текст')
