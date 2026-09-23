/**
 * Гипотезы и факты больше не прячут баллы.
 *
 * 1. Каждый скрытый интерес связан с утверждением из досье, и в момент
 *    раскрытия игроку предлагается оценить именно его — текстом утверждения,
 *    а не вопроса (часть утверждений — ловушки, сформулированные наоборот).
 * 2. Факт, пересказанный своими словами, засчитывается; пустая вежливость,
 *    торг по открытой цифре и чужие факты — нет.
 */
import { scenarios } from '../lib/scenarios'
import { residentAttraction } from '../lib/scenarios/resident-attraction'
import { supplierHike } from '../lib/scenarios/supplier-hike'
import { contractorDelay } from '../lib/scenarios/contractor-delay'
import { applyTurn, createInitialState } from '../lib/engine/state'
import { citedFact } from '../lib/engine/facts'
import type { Scenario } from '../lib/types'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

console.log('Гипотеза в момент раскрытия')
for (const s of scenarios) {
  const linked = s.hiddenInterests.filter((h) => h.probe && s.beliefProbes.some((p) => p.id === h.probe))
  check(linked.length === s.hiddenInterests.length, `${s.title}: интересов с утверждением из досье ${linked.length} из ${s.hiddenInterests.length}`)
  const ids = linked.map((h) => h.probe)
  check(new Set(ids).size === ids.length, `${s.title}: утверждения не повторяются`)

  // Карточка в момент раскрытия — только для верного утверждения; ловушки живут в досье.
  const h = s.hiddenInterests.find((x) => s.beliefProbes.find((p) => p.id === x.probe)?.truth)!
  const trap = s.hiddenInterests.find((x) => s.beliefProbes.find((p) => p.id === x.probe)?.truth === false)
  if (trap) {
    const t = applyTurn({
      scenario: s, state: createInitialState(s), userText: 'Вопрос.',
      llm: { reply: 'Ответ.', detectedActs: [trap.unlockedBy[0]], revealedInterests: [trap.id] },
    })
    check(!t.hint && !t.hintProbe && t.state.revealedInterests.includes(trap.id), `${s.title}: ловушка в момент раскрытия не показывается, интерес раскрыт`)
  }
  const st = createInitialState(s)
  const r = applyTurn({
    scenario: s, state: st, userText: 'Вопрос.',
    llm: { reply: 'Ответ.', detectedActs: [h.unlockedBy[0]], revealedInterests: [h.id] },
  })
  const probe = s.beliefProbes.find((p) => p.id === h.probe)!
  check(r.hintProbe === probe.id && r.hint === probe.text, `${s.title}: подсказка — текст утверждения, оценка ставится в один клик`)

  // Уже оценённое повторно не предлагается.
  st.hypotheses = [{ id: probe.id, text: probe.text, confidence: 0.85 }]
  const again = applyTurn({
    scenario: s, state: st, userText: 'Вопрос.',
    llm: { reply: 'Ответ.', detectedActs: [h.unlockedBy[0]], revealedInterests: [h.id] },
  })
  check(!again.hintProbe, `${s.title}: оценённое утверждение повторно не предлагается`)
}

console.log('\nФакт своими словами')
const cited = (s: Scenario, text: string) => citedFact(s, createInitialState(s), text)?.id
const expect = (s: Scenario, text: string, id: string | undefined) => {
  const got = cited(s, text)
  check(got === id, `«${text}» → ${got ?? 'не факт'}${got === id ? '' : `, ожидалось ${id ?? 'не факт'}`}`)
}
expect(residentAttraction, 'У альтернативной площадки подключение мощности придёт на 14 месяцев позже.', 'altDelay')
expect(residentAttraction, 'Мы можем гарантировать 12 МВт к марту 2027 года.', 'gridMarch')
expect(residentAttraction, 'Подготовку кадров под запуск возьмёт на себя Колледж при ОЭЗ, найм не придётся начинать после стройки.', 'polytech')
expect(residentAttraction, 'Добрый день, рад, что доехали.', undefined)
expect(residentAttraction, 'Давайте обсудим цену земли и аренду по ставке.', undefined)
expect(supplierHike, 'Отраслевой индекс сырья вырос на 8,4%, а не на пятнадцать.', 'index')
expect(supplierHike, '15% — это слишком много для нас.', undefined)
expect(supplierHike, 'У нас есть другой поставщик на плюс 9% к текущей цене.', 'altSupplier')
expect(contractorDelay, 'Семь недель из отставания даёт один инженерный субподрядчик.', 'bottleneck')
expect(contractorDelay, 'Нам нужен новый график, давайте без штрафов.', undefined)

// Использованный факт повторно не засчитывается.
{
  const st = createInitialState(residentAttraction)
  st.playedFacts = ['altDelay']
  check(!citedFact(residentAttraction, st, 'Альтернативная площадка подключит мощность на 14 месяцев позже.'), 'уже использованный факт повторно не засчитывается')
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ гипотезы оцениваются в момент раскрытия, факты засчитываются и словами')
