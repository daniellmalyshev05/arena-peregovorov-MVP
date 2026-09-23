/**
 * Страж согласия на уровне маршрута `/api/turn`, с подменённым провайдером.
 *
 * Живую модель отсюда не достать, поэтому ответы провайдера подставляются:
 * так проверяется ровно то, что делает сервер, когда модель согласилась без
 * решения движка, — переспрашивает, а если не помогло, отдаёт реплику
 * запасному движку. Заодно — что условия, названные словами, доходят до хода.
 */
process.env.OPENROUTER_API_KEY = 'test'
delete process.env.DEMO_MODE

import { POST } from '../app/api/turn/route'
import { getScenario } from '../lib/scenarios'
import { createInitialState } from '../lib/engine/state'

let failed = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

const scenario = getScenario('resident-attraction')!
const state = createInitialState(scenario)
const visible = scenario.issues.find((i) => state.visibleIssues.includes(i.id))!
const other = visible.options.find((o) => o.id !== state.deal[visible.id])!

function provider(replies: string[]) {
  const calls: unknown[] = []
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    calls.push(JSON.parse(init?.body ?? '{}'))
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)]
    const content = JSON.stringify({
      reply, detectedActs: ['conditional_offer'], revealedInterests: [],
      userOffer: { [visible.id]: other.id },
    })
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
  }) as typeof fetch
  return calls
}

async function turn() {
  const res = await POST(new Request('http://x/api/turn', {
    method: 'POST',
    body: JSON.stringify({ scenarioId: scenario.id, state, userText: 'Дадим скидку на землю, если вы поднимете инвестиции.' }),
  }))
  return res.json()
}

async function main() {
  console.log('Модель согласилась без пакета, повтор исправил\n')
  {
    const calls = provider(['Скидку по земле я принимаю, дальше обсудим сроки.', 'Скидка по земле — интересное направление. Пришлите предложение целиком.'])
    const data = await turn()
    const reply = data.state.transcript.at(-1).text as string
    check(calls.length === 2, 'был ровно один дозапрос')
    check(!/принимаю/i.test(reply), `в ленту ушла исправленная реплика: «${reply}»`)
    check((data.repairs ?? []).some((r: string) => r.includes('переписана')), 'исправление видно в диагностике (repairs)')
    check(data.source === 'model', 'источник реплики — модель')
    check(data.state.transcript.at(-2).spokenOffer?.[visible.id] === other.id, 'условия, названные словами, дошли до хода')
    const system = (calls[0] as { messages: { content: string }[] }).messages[0].content
    check(system.includes('не прислал пакет'), 'в ходе без пакета модель предупреждена, что согласия быть не может')
  }

  console.log('\nМодель упорствует — реплику говорит запасной движок\n')
  {
    const calls = provider(['Договорились, по рукам.', 'Хорошо, согласен.'])
    const data = await turn()
    const reply = data.state.transcript.at(-1).text as string
    check(calls.length === 2, 'дозапрос был, третьего нет')
    check(!/(договорились|по рукам|согласен)/i.test(reply), `в ленте реплика без согласия: «${reply}»`)
    check((data.repairs ?? []).some((r: string) => r.includes('запасной движок')), 'замена видна в диагностике')
  }

  console.log('\nЧистая реплика не трогается\n')
  {
    const calls = provider(['Скидка интересна, но совет смотрит на сроки.'])
    const data = await turn()
    check(calls.length === 1, 'дозапроса нет')
    check(!data.repairs, 'диагностика пустая')
  }

  console.log('\n' + '═'.repeat(70))
  if (failed) {
    console.log(`✗ провалено проверок: ${failed}`)
    process.exit(1)
  }
  console.log('✓ согласие без решения движка до игрока не доходит')
}
main()
