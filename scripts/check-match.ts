/**
 * Подбор кейса под контекст администратора.
 *
 * Проверяется не «что-то вернулось», а три вещи, из-за которых подбор вообще
 * имеет смысл на защите:
 *   1. типовые формулировки заказчика попадают в нужный кейс;
 *   2. запрос не из библиотеки честно помечается слабым совпадением;
 *   3. подбор объясняет выбор словами запроса, а не молча.
 */
import { scenarios } from '@/lib/scenarios'
import { matchScenarios, pickScenario } from '@/lib/admin/match'

let failed = 0

const expect = (query: string, id: string | null) => {
  const top = pickScenario(scenarios, query)
  const ok = id ? top.scenario.id === id && top.confidence !== 'слабое' : top.confidence === 'слабое'
  if (!ok) failed++
  console.log(
    `  ${ok ? '✓' : '✗'} ${query}`,
  )
  console.log(
    `      → ${top.scenario.title}  [${top.confidence}, вес ${top.score}]` +
      (top.matched.length ? `  совпало: ${top.matched.join(', ')}` : '  совпадений нет'),
  )
  if (!ok) console.log(`      ожидалось: ${id ?? 'слабое совпадение'}`)
}

console.log('Контекст из библиотеки\n')
expect('Промышленность. Привлечение инвестора на площадку особой экономической зоны', 'resident-attraction')
expect('Строительство. Генподрядчик сорвал сроки по корпусу', 'contractor-delay')
expect('Строительство, эскалация по просрочке подрядчика', 'contractor-delay')
expect('Закупки. Поставщик уведомил о повышении цены', 'supplier-hike')
expect('ИТ. Бюджет департамента, поставщик поднимает тариф на лицензии', 'supplier-hike')
expect('Резидент не выполняет инвестиционные обязательства, обсуждаем расторжение', 'resident-default')
expect('Реструктуризация обязательств должника, гарантии и отчётность', 'resident-default')
expect('Инвестиции в новое производство, выбор региона размещения завода', 'resident-attraction')

console.log('\nКонтекст вне промышленного контура\n')
// Ровно тот запрос, на котором подбор сдался на прогоне 19 сентября.
expect('ИТ. Бюджет ИТ-департамента на следующий год, финдиректор хочет срезать бюджет на 20%', 'it-budget')
expect('Финансы. Защита бюджета подразделения перед финансовым директором', 'it-budget')
expect('Переговоры о повышении зарплаты с руководителем отдела кадров', 'retention-offer')
expect('HR. Удержание сотрудника, который получил оффер от конкурента', 'retention-offer')
expect('Продажи. Ключевой клиент требует скидку при продлении контракта', 'client-discount')
expect('B2B, сервисная компания: клиент грозит уйти к конкуренту, если не дадим дисконт', 'client-discount')

console.log('\nКонтекст, которого в библиотеке нет\n')
expect('Переговоры о разделе имущества при разводе', null)
expect('Школьный родительский комитет обсуждает ремонт спортзала', null)
expect('', null)

console.log('\nПодбор объясняет выбор')
{
  const top = pickScenario(scenarios, 'закупки, цена, контракт с поставщиком')
  if (!top.matched.length) {
    failed++
    console.log('  ✗ выбран кейс без единого совпавшего слова')
  } else {
    console.log('  ✓ совпавшие слова возвращаются:', top.matched.join(', '))
  }
}

console.log('\nРанжирование')
{
  const all = matchScenarios(scenarios, 'подрядчик сорвал график строительства')
  const order = all.map((m) => m.scenario.id)
  console.log('  ' + all.map((m) => `${m.scenario.id}:${m.score}`).join('  '))
  if (order[0] !== 'contractor-delay') {
    failed++
    console.log('  ✗ первым идёт не кейс про подрядчика')
  }
  if (all.length !== scenarios.length) {
    failed++
    console.log('  ✗ ранжирование потеряло кейсы')
  }
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ подбор кейса под контекст работает и честно признаётся, когда не нашёл')
