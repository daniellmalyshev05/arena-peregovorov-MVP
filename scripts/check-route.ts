/**
 * Настройка администратора доходит до сервера: сложность, тон, имя, роль,
 * число раундов и установка администратора учитываются в /api/turn.
 * Проверяется сам обработчик маршрута, а не только applyConfig.
 */
process.env.DEMO_MODE = 'true'

import { POST } from '../app/api/turn/route'
import { scenarios } from '../lib/scenarios'
import { applyConfig, defaultConfig } from '../lib/admin/config'
import { encodeConfig } from '../lib/admin/link'
import { createInitialState, evaluateOffer } from '../lib/engine/state'
import { buildSystemPrompt } from '../lib/llm/prompt'
import { enumerateDeals } from '../lib/engine/utility'
import type { Deal, NegotiationState, Scenario } from '../lib/types'
import { isFemaleName } from '../lib/admin/rename'

let failed = 0
const check = (ok: boolean, text: string) => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

async function turn(scenarioId: string, state: NegotiationState, userText: string, config?: string, explicitOffer?: Deal) {
  const res = await POST(
    new Request('http://local/api/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId, state, userText, config, explicitOffer }),
    }),
  )
  return (await res.json()) as { state: NegotiationState; verdict?: string; error?: string }
}

async function main() {
  for (const base of scenarios) {
    console.log(`\n${base.title}`)

    // 1. Число раундов.
    const short = { ...defaultConfig(base), rounds: 4 }
    const code = encodeConfig(base, short)
    const tuned = applyConfig(base, short)
    let st = createInitialState(tuned)
    for (let i = 0; i < 4; i++) st = (await turn(base.id, st, 'Понимаю. Давайте продолжим.', code)).state
    check(st.status === 'timeout', `4 раунда из настройки — сессия закончилась на четвёртом (${st.status})`)

    let plain = createInitialState(base)
    for (let i = 0; i < 4; i++) plain = (await turn(base.id, plain, 'Понимаю. Давайте продолжим.')).state
    check(plain.status === 'active', 'без настройки те же 4 раунда — сессия продолжается')

    // 2. Сложность меняет вердикт. Ищем пакет, который библиотечный кейс
    // принимает, а жёсткая настройка — нет, и отправляем его через обработчик.
    const hard = { ...defaultConfig(base), difficulty: 5 }
    const hardScenario = applyConfig(base, hard)
    const start = createInitialState(base)
    start.visibleIssues = base.issues.map((i) => i.id)
    const margin = enumerateDeals(base)
      .map((p) => p.deal)
      .find(
        (d) =>
          evaluateOffer(base, start, d).verdict === 'accept' &&
          evaluateOffer(hardScenario, start, d).verdict !== 'accept',
      )
    if (!margin) {
      check(false, 'нашёлся пакет на границе между рабочей и жёсткой сложностью')
    } else {
      const soft = await turn(base.id, start, 'Предлагаю такой пакет целиком.', undefined, margin)
      const strict = await turn(base.id, start, 'Предлагаю такой пакет целиком.', encodeConfig(base, hard), margin)
      check(
        soft.verdict === 'accept' && strict.verdict !== 'accept',
        `один и тот же пакет: без настройки ${soft.verdict}, при сложности 5 — ${strict.verdict}`,
      )
    }

    // 3. Имя и роль доходят до модели.
    const newName = isFemaleName(base.persona.name.split(' ')[0]) ? 'Ирина Соколова' : 'Игорь Соколов'
    const renamed = { ...defaultConfig(base), opponentName: newName, opponentRole: 'директор по продажам' }
    const prompt = buildSystemPrompt(applyConfig(base, renamed), createInitialState(base))
    const who = prompt.split('\n').find((l) => l.startsWith(newName)) ?? ''
    check(who.startsWith(newName + ', директор по продажам'), 'имя и роль из настройки — в строке «кто ты» промпта')
    check(!prompt.includes(`${base.persona.name},`), 'библиотечного имени в строке «кто ты» нет')

    // 4. Испорченная настройка не роняет ход.
    const broken = await turn(base.id, createInitialState(base), 'Добрый день.', '%%%не-base64%%%')
    check(!broken.error && broken.state?.round === 2, 'испорченная строка настройки — играется библиотечный кейс')
  }

  console.log('\n' + '═'.repeat(70))
  if (failed) {
    console.error(`ОШИБОК: ${failed}`)
    process.exit(1)
  }
  console.log('✓ настройка администратора меняет то, что считает сервер, а не только экран участника')
}

void main()
