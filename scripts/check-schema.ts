/**
 * Разбор ответа модели.
 *
 * Образцы здесь не выдуманы: это то, что реально прилетало на прогоне через
 * Vercel — обрыв на полуслове, обрыв внутри реплики, лишний акт, число вместо
 * строки, проза без JSON. Три хода из шести уходили в запасной движок именно
 * на этом, и Виктор отвечал заготовкой невпопад.
 *
 * Правило, которое проверяем: реплика важнее формата. Ход выбрасывается только
 * тогда, когда реплики нет вовсе.
 */
import { parseLlmTurn } from '@/lib/llm/schema'

let failed = 0
const check = (ok: boolean | undefined, what: string) => {
  if (!ok) {
    failed++
    console.log('  ✗', what)
  }
}

console.log('Разбор ответа модели\n')

// 1. Нормальный ответ разбирается без починок.
{
  const raw = JSON.stringify({
    reply: 'Совет не подпишет площадку, где сеть не гарантирована.',
    detectedActs: ['spin_problem'],
    revealedInterests: ['gridRisk'],
    proposedDeal: { grid: 'grid_march' },
    stateDelta: { trust: 2, irritation: -1 },
  })
  const r = parseLlmTurn(raw)
  check(r.turn?.reply.startsWith('Совет не подпишет'), 'целый ответ разобран')
  check(r.turn?.detectedActs[0] === 'spin_problem', 'акт сохранён')
  check(r.turn?.revealedInterests[0] === 'gridRisk', 'раскрытие сохранено')
  check(r.turn?.proposedDeal?.grid === 'grid_march', 'предложение сохранено')
  check(r.repairs.length === 0, 'на целом ответе починок нет')
}

// 2. Обрыв после реплики — закрывающей скобки нет вообще.
{
  const raw = `{
  "reply": "Если мощность придёт позже марта, мы не успеваем к монтажу линии.",
  "detectedActs": ["spin_implication"],
  "revealedInterests": ["gridRisk"`
  const r = parseLlmTurn(raw)
  check(r.turn !== null, 'оборванный ответ не выброшен')
  check(r.turn?.reply.includes('не успеваем к монтажу'), 'реплика из обрывка сохранена целиком')
  check(r.turn?.detectedActs.includes('spin_implication'), 'акт из обрывка подобран')
  check(r.repairs.length > 0, 'починка оборванного ответа записана в лог')
}

// 3. Обрыв посреди JSON — скобка есть, но от вложенного объекта.
{
  const raw = `{
  "reply": "Мне нужно понимать, что через год условия не поедут.",
  "detectedActs": ["authority_check"],
  "proposedDeal": { "jobs": "jobs_340" },
  "stateDelta": { "trust": 3`
  const r = parseLlmTurn(raw)
  check(r.turn !== null, 'битый JSON не выброшен')
  check(r.turn?.reply.includes('условия не поедут'), 'реплика вытащена из битого JSON')
  check(r.turn?.proposedDeal?.jobs === 'jobs_340', 'предложение из битого JSON подобрано')
}

// 4. Обрыв внутри самой реплики — берём по последнюю законченную фразу.
{
  const raw = `{
  "reply": "На прошлой площадке мы год не могли выйти на проектную мощность. Второй раз я в это не пойду. Поэтому для нас кадровый вопрос ва`
  const r = parseLlmTurn(raw)
  check(r.turn !== null, 'обрыв внутри реплики не выброшен')
  check(r.turn?.reply.endsWith('не пойду.') === true, 'реплика обрезана по законченной фразе')
  check(!r.turn?.reply.includes('кадровый вопрос ва'), 'полуслово не показывается игроку')
}

// 5. Проза без JSON — это всё равно реплика, а не повод молчать.
{
  const r = parseLlmTurn('Давайте вернёмся к ставке. Без движения по цене мне не с чем идти к совету.')
  check(r.turn !== null, 'проза без JSON не выброшена')
  check(r.turn?.detectedActs.length === 0, 'актов у прозы нет — и это честно')
  check(r.repairs.some((x) => x.includes('прозой')), 'ответ прозой отмечен в починках')
}

// 6. Обрывок без реплики выбрасывается — притворяться нечем.
{
  const cases = ['', '   ', '{', '{"detectedActs": ["bluff"]}', '{"reply": ""}', '```json\n{\n  "det']
  for (const raw of cases) {
    const r = parseLlmTurn(raw)
    check(r.turn === null, `пустышка «${raw.slice(0, 20)}» не должна становиться ходом`)
    check(!!r.reason, 'у отказа есть причина для лога')
  }
}

// 7. Markdown-обёртка снимается.
{
  const r = parseLlmTurn('```json\n{"reply": "Хорошо, обсудим.", "detectedActs": []}\n```')
  check(r.turn?.reply === 'Хорошо, обсудим.', 'ответ в ```json разобран')
}

// 8. Починки, которые были и раньше, не сломались.
{
  const r = parseLlmTurn(JSON.stringify({
    reply: 'Допустим.',
    detectedActs: ['spin_problem', 'вежливость'],
    proposedDeal: { jobs: 340 },
    stateDelta: { trust: 40 },
  }))
  check(r.turn?.detectedActs.length === 1, 'неизвестный акт выброшен поштучно')
  check(r.turn?.proposedDeal?.jobs === '340', 'уровень числом приведён к строке')
  check(r.turn?.stateDelta?.trust === 8, 'дельта зажата, а не отвергнута')
  check(r.repairs.length === 3, 'все три починки записаны')
}

// 9. Экранированные кавычки внутри реплики переживают спасение.
{
  const raw = '{\n  "reply": "Он сказал: \\"мы не успеваем\\" — и это меня беспокоит.",\n  "detectedActs": ["active_listening"'
  const r = parseLlmTurn(raw)
  check(r.turn !== null, 'реплика с кавычками не потеряна')
  check(r.turn?.reply.includes('«') === false, 'кавычки не подменены')
  check(r.turn?.reply.includes('"мы не успеваем"') === true, 'экранирование снято правильно')
}

console.log(failed === 0 ? '\n✓ реплика доживает до игрока даже из оборванного ответа' : `\n${failed} провалов`)
process.exit(failed === 0 ? 0 : 1)
