import { NextResponse } from 'next/server'
import { getScenario } from '@/lib/scenarios'
import { applyConfig } from '@/lib/admin/config'
import { decodeConfig } from '@/lib/admin/link'
import { applyTurn, evaluateOffer, grantLeaked, sanitizeOffer, type LlmTurnOutput } from '@/lib/engine/state'
import { buildNoOfferInstruction, buildSystemPrompt, buildUserMessage, buildVerdictInstruction, describeCounter } from '@/lib/llm/prompt'
import { consentCorrection, detectConsent, leakCorrection } from '@/lib/llm/consent'
import { parseLlmTurn } from '@/lib/llm/schema'
import { callOpenRouter, type ChatMessage } from '@/lib/llm/openrouter'
import { offlineTurn } from '@/lib/llm/offline'
import { describeLeak, detectLeak } from '@/lib/llm/leak'
import type { Deal, NegotiationState } from '@/lib/types'
import { NO_ADAPTATION, type Adaptation } from '@/lib/engine/adaptive'
import { citedFact } from '@/lib/engine/facts'

export const runtime = 'nodejs'
/**
 * Лимит функции выше, чем таймаут клиента OpenRouter (30 с): иначе вместо
 * причины сбоя в логе окажется обрыв соединения.
 */
export const maxDuration = 60

interface TurnRequest {
  scenarioId: string
  /**
   * Настройка администратора в том же виде, что и в ссылке для участников.
   * Разбирается тем же проверяющим декодером: испорченная строка даёт
   * библиотечный кейс, а не вырожденный.
   */
  config?: string
  state: NegotiationState
  userText: string
  explicitOffer?: Deal
  factPlayed?: string
  hypothesisUpdate?: { id: string; confidence: number }[]
  /** Насколько жёстче оппонент из-за профиля игрока. Считается на клиенте. */
  adaptation?: Adaptation
  /** Принудительно играть запасным движком, не обращаясь к модели. */
  forceOffline?: boolean
}

export async function POST(req: Request) {
  let body: TurnRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const base = getScenario(body.scenarioId)
  if (!base) return NextResponse.json({ error: 'unknown scenario' }, { status: 404 })

  // Сервер играет тот же кейс, что видит участник: вердикты и промпт
  // считаются с настройкой администратора (сложность, тон, имя, роль, раунды).
  const decoded = typeof body.config === 'string' ? decodeConfig([base], body.config) : null
  const scenario = decoded ? applyConfig(base, decoded.cfg) : base
  if (!body.state || !body.userText?.trim()) {
    return NextResponse.json({ error: 'missing state or text' }, { status: 400 })
  }

  // Вердикт по предложению считается ДО обращения к модели.
  // Модель получает его как данность и только формулирует ответ.
  const adaptation: Adaptation = body.adaptation ?? NO_ADAPTATION

  let verdict: ReturnType<typeof evaluateOffer> | undefined
  let normalizedOffer: Deal | undefined
  if (body.explicitOffer && Object.keys(body.explicitOffer).length) {
    normalizedOffer = sanitizeOffer(scenario, body.state, body.explicitOffer)
    verdict = evaluateOffer(scenario, body.state, normalizedOffer, adaptation)
  }

  const fact = body.factPlayed ? scenario.facts.find((f) => f.id === body.factPlayed) : undefined
  // Факт, пересказанный своими словами, засчитывается так же, как приложенный.
  const spokenFact = fact ? undefined : citedFact(scenario, body.state, body.userText)
  const factPlayed = fact?.id ?? spokenFact?.id

  let llm: LlmTurnOutput | null = null
  let source: 'model' | 'offline' = 'offline'
  let fallbackReason: string | undefined
  /** Что пришлось починить в ответе модели и с какой попытки он пришёл. */
  let repairs: string[] = []
  let attempt: number | undefined

  // Онлайн — главный режим. Запасной включается переменной окружения,
  // настройкой в админке или при повторе сорвавшегося хода.
  const demo = process.env.DEMO_MODE === 'true' || body.forceOffline === true
  const startedAt = Date.now()
  /** Разговор с моделью в этом ходе — для дозапроса, если реплику придётся переписать. */
  let convo: { messages: ChatMessage[]; content: string } | undefined
  if (!demo) {
    const counterTerms = verdict?.counter && normalizedOffer ? describeCounter(scenario, normalizedOffer, verdict.counter) : undefined
    const system =
      buildSystemPrompt(scenario, body.state, adaptation.instruction) +
      (verdict ? buildVerdictInstruction(verdict.verdict, verdict.opponentSurplus, counterTerms) : buildNoOfferInstruction())
    const history: ChatMessage[] = body.state.transcript.slice(-8).map((t) => ({
      role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: t.role === 'user' ? t.text : JSON.stringify({ reply: t.text }),
    }))
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: buildUserMessage(body.userText, fact?.detail) },
    ]

    // Каждая причина ухода в офлайн пишется в консоль сервера.
    const call = await callOpenRouter(messages)
    if (call.content) convo = { messages, content: call.content }
    if (call.content) {
      const parsed = parseLlmTurn(call.content)
      if (parsed.turn) {
        llm = parsed.turn
        source = 'model'
        repairs = parsed.repairs
        attempt = call.attempt
        if (parsed.repairs.length) {
          console.warn('[арена] ответ модели починен:', parsed.repairs.join('; '))
        }
      } else {
        fallbackReason = `ответ модели не разобран: ${parsed.reason}`
        console.error('[арена] ' + fallbackReason)
        console.error('[арена] сырой ответ:', call.content.slice(0, 400))
      }
    } else {
      fallbackReason = call.error ?? 'модель не ответила'
      console.error('[арена] обращение к модели не удалось —', fallbackReason)
    }

    // Согласие без решения движка. Реплика переписывается одним дозапросом;
    // если времени на него нет или модель упорствует — реплику говорит
    // запасной движок, который по построению соглашается только на `accept`.
    // Разметка хода (акты, раскрытия) остаётся от первого ответа: переписывается
    // только то, что прозвучало вслух.
    const consent = llm ? detectConsent(llm.reply, verdict?.verdict) : null
    if (llm && consent && call.content) {
      console.warn(`[арена] согласие без решения движка («${consent.phrase}»): ${consent.sentence}`)
      let fixed: string | undefined
      if (Date.now() - startedAt < 30_000) {
        const retry = await callOpenRouter(
          [...messages, { role: 'assistant', content: call.content }, { role: 'user', content: consentCorrection(verdict?.verdict) }],
          { single: true, timeoutMs: 15_000 },
        )
        const reparsed = retry.content ? parseLlmTurn(retry.content).turn : null
        if (reparsed && !detectConsent(reparsed.reply, verdict?.verdict)) fixed = reparsed.reply
      }
      if (fixed) {
        llm = { ...llm, reply: fixed }
        repairs.push(`согласие без решения движка («${consent.phrase}»): реплика переписана`)
      } else {
        const safe = offlineTurn(
          scenario, body.state, body.userText, verdict?.verdict, factPlayed,
          verdict?.counter && normalizedOffer ? { offered: normalizedOffer, counter: verdict.counter } : undefined,
        )
        llm = { ...llm, reply: safe.reply }
        repairs.push(`согласие без решения движка («${consent.phrase}»): реплику сказал запасной движок`)
      }
    }
  }

  if (!llm) {
    if (!demo && !fallbackReason) fallbackReason = 'неизвестная причина'
    llm = offlineTurn(
      scenario, body.state, body.userText, verdict?.verdict, factPlayed,
      verdict?.counter && normalizedOffer ? { offered: normalizedOffer, counter: verdict.counter } : undefined,
    )
  }

  const play = (turn: LlmTurnOutput) =>
    applyTurn({
      scenario,
      state: body.state,
      userText: body.userText,
      llm: turn,
      explicitOffer: normalizedOffer,
      precomputedVerdict: verdict?.verdict,
      counter: verdict?.counter,
      factPlayed,
      hypothesisUpdate: body.hypothesisUpdate,
    })
  let result = play(llm)

  // Модель может проговорить секрет прозой, не пометив раскрытие. Реплика
  // с утечкой переписывается одним дозапросом, как и согласие без решения;
  // раскрытым засчитывается только то, что осталось в реплике после него.
  let leaks = source === 'model' ? detectLeak(scenario, result.state, llm.reply) : []
  for (const leak of leaks) console.warn(describeLeak(leak, llm.reply))
  if (leaks.length && convo && Date.now() - startedAt < 30_000) {
    const retry = await callOpenRouter(
      [...convo.messages, { role: 'assistant', content: convo.content }, { role: 'user', content: leakCorrection(leaks.map((l) => l.label)) }],
      { single: true, timeoutMs: 15_000 },
    )
    const reparsed = retry.content ? parseLlmTurn(retry.content).turn : null
    if (reparsed && !detectConsent(reparsed.reply, verdict?.verdict)) {
      const candidate = { ...llm, reply: reparsed.reply }
      const replayed = play(candidate)
      const still = detectLeak(scenario, replayed.state, candidate.reply)
      if (still.length < leaks.length) {
        repairs.push(`проговорка скрытого (${leaks.map((l) => l.id).join(', ')}): реплика переписана`)
        llm = candidate
        result = replayed
        leaks = still
      }
    }
  }

  // Проговорённое засчитывается раскрытым: иначе плашки «Раскрыт интерес» нет,
  // строка в соглашении не появляется, а в разборе игроку снимают баллы за
  // интерес, который вторая сторона назвала сама.
  const leaked = grantLeaked(scenario, result.state, leaks)

  return NextResponse.json({
    state: result.state,
    hint: result.hint ?? leaked.hint,
    hintProbe: result.hint ? result.hintProbe : leaked.hintProbe,
    factCited: spokenFact?.id,
    verdict: result.verdict ?? verdict?.verdict,
    source,
    fallbackReason,
    leaks: leaks.length ? leaks.map((l) => l.label) : undefined,
    leakedGranted: leaked.granted.length ? leaked.granted : undefined,
    repairs: repairs.length ? repairs : undefined,
    attempt,
  })
}
