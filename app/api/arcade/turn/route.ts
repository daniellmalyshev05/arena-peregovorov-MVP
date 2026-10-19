import { NextResponse } from 'next/server'
import { getArcadeOpponent } from '@/lib/arcade/opponents'
import { buildArcadePrompt } from '@/lib/arcade/prompt'
import { applyTurn, evaluateOffer, grantLeaked, sanitizeOffer, type LlmTurnOutput } from '@/lib/engine/state'
import { buildNoOfferInstruction, buildVerdictInstruction, describeCounter } from '@/lib/llm/prompt'
import { consentCorrection, detectConsent, leakCorrection } from '@/lib/llm/consent'
import { parseLlmTurn } from '@/lib/llm/schema'
import { callOpenRouter, type ChatMessage } from '@/lib/llm/openrouter'
import { offlineTurn } from '@/lib/llm/offline'
import { describeLeak, detectLeak } from '@/lib/llm/leak'
import type { Deal, NegotiationState } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ArcadeTurnRequest {
  opponentId: string
  state: NegotiationState
  userText: string
  offer?: Deal
  forceOffline?: boolean
}

/**
 * Ход аркады. Порядок тот же, что у симулятора: вердикт по пакету считает
 * движок до модели, модель только говорит, согласие без решения движка и
 * проговорка скрытого переписываются. Отличается лишь промпт — с характером.
 */
export async function POST(req: Request) {
  let body: ArcadeTurnRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const opponent = getArcadeOpponent(body.opponentId)
  if (!opponent) return NextResponse.json({ error: 'unknown opponent' }, { status: 404 })
  if (!body.state || !body.userText?.trim()) {
    return NextResponse.json({ error: 'missing state or text' }, { status: 400 })
  }
  const scenario = opponent.scenario

  let verdict: ReturnType<typeof evaluateOffer> | undefined
  let offer: Deal | undefined
  if (body.offer && Object.keys(body.offer).length) {
    offer = sanitizeOffer(scenario, body.state, body.offer)
    verdict = evaluateOffer(scenario, body.state, offer)
  }
  const counter = verdict?.counter && offer ? { offered: offer, counter: verdict.counter } : undefined
  const fallback = () => offlineTurn(scenario, body.state, body.userText, verdict?.verdict, undefined, counter)

  let llm: LlmTurnOutput | null = null
  let source: 'model' | 'offline' = 'offline'
  const demo = process.env.DEMO_MODE === 'true' || body.forceOffline === true
  const startedAt = Date.now()
  let convo: { messages: ChatMessage[]; content: string } | undefined

  if (!demo) {
    const counterTerms = counter ? describeCounter(scenario, counter.offered, counter.counter) : undefined
    const system =
      buildArcadePrompt(opponent, body.state) +
      (verdict ? buildVerdictInstruction(verdict.verdict, verdict.opponentSurplus, counterTerms) : buildNoOfferInstruction())
    const history: ChatMessage[] = body.state.transcript.slice(-6).map((t) => ({
      role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: t.role === 'user' ? t.text : JSON.stringify({ reply: t.text }),
    }))
    const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: body.userText }]

    const call = await callOpenRouter(messages)
    if (call.content) {
      convo = { messages, content: call.content }
      const parsed = parseLlmTurn(call.content)
      if (parsed.turn) {
        llm = parsed.turn
        source = 'model'
      } else {
        console.error('[арена · аркада] ответ модели не разобран:', parsed.reason)
      }
    } else {
      console.error('[арена · аркада] обращение к модели не удалось —', call.error ?? 'модель не ответила')
    }

    const consent = llm ? detectConsent(llm.reply, verdict?.verdict) : null
    if (llm && consent && convo) {
      let fixed: string | undefined
      if (Date.now() - startedAt < 30_000) {
        const retry = await callOpenRouter(
          [...convo.messages, { role: 'assistant', content: convo.content }, { role: 'user', content: consentCorrection(verdict?.verdict) }],
          { single: true, timeoutMs: 15_000 },
        )
        const reparsed = retry.content ? parseLlmTurn(retry.content).turn : null
        if (reparsed && !detectConsent(reparsed.reply, verdict?.verdict)) fixed = reparsed.reply
      }
      llm = { ...llm, reply: fixed ?? fallback().reply }
    }
  }

  if (!llm) llm = fallback()

  const play = (turn: LlmTurnOutput) =>
    applyTurn({
      scenario,
      state: body.state,
      userText: body.userText,
      llm: turn,
      explicitOffer: offer,
      precomputedVerdict: verdict?.verdict,
      counter: verdict?.counter,
    })
  let result = play(llm)

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
        llm = candidate
        result = replayed
        leaks = still
      }
    }
  }
  grantLeaked(scenario, result.state, leaks)

  return NextResponse.json({
    state: result.state,
    verdict: result.verdict ?? verdict?.verdict,
    source,
  })
}
