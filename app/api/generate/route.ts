import { NextResponse } from 'next/server'
import { buildCase, generationMessages, type Brief } from '@/lib/admin/generate'
import { TONES } from '@/lib/admin/config'
import type { Archetype } from '@/lib/types'

export const runtime = 'nodejs'
/**
 * Кейс целиком модель пишет около минуты. Ответ идёт браузеру потоком:
 * администратор видит, как появляются условия и интересы, а не пустое
 * ожидание. Лимит с запасом; на Vercel он требует Fluid Compute.
 */
export const maxDuration = 180

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 170_000
const PROGRESS_MS = 300

interface GenerateRequest {
  sphere?: unknown
  topic?: unknown
  goal?: unknown
  tone?: unknown
  /** Почему прошлая версия не прошла проверку. */
  problems?: unknown
}

/** Что уходит в браузер: строки JSON, одна на событие. */
export type GenerateEvent =
  | { type: 'progress'; issues: number; interests: number; facts: number; beliefs: number }
  | { type: 'done'; scenario?: import('@/lib/types').Scenario; repairs: string[]; problems: string[]; seconds: number }
  | { type: 'error' }

const line = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const count = (text: string, key: string) => text.split(`"${key}"`).length - 1

/**
 * Запрос к модели с потоковым ответом. Размышления перед ответом сведены
 * к минимуму: кейс пишется по образцу, а лишние токены — это лишние секунды.
 * Если провайдер не принимает это поле, повторяем без него.
 */
async function openStream(body: Record<string, unknown>, signal: AbortSignal) {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Title': 'Arena Peregovorov',
  }
  const withReasoning = { ...body, reasoning: { effort: 'minimal', exclude: true } }
  let res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(withReasoning), signal })
  if (res.status === 400) {
    await res.body?.cancel()
    res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal })
  }
  return res
}

export async function POST(req: Request) {
  if (process.env.DEMO_MODE === 'true' || !process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'generation off' }, { status: 503 })
  }

  let body: GenerateRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const tone = TONES.some((t) => t.value === body.tone) ? (body.tone as Archetype) : 'hard_negotiator'
  const brief: Brief = {
    sphere: line(body.sphere, 120),
    topic: line(body.topic, 120),
    goal: line(body.goal, 400),
    tone,
  }
  if (!brief.sphere && !brief.topic && !brief.goal) {
    return NextResponse.json({ error: 'empty brief' }, { status: 400 })
  }
  const problems = Array.isArray(body.problems)
    ? body.problems.filter((p): p is string => typeof p === 'string').slice(0, 8).map((p) => p.slice(0, 300))
    : undefined

  const model = process.env.OPENROUTER_GEN_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-3.8-flash-20260902'
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  req.signal.addEventListener('abort', () => controller.abort())

  let upstream: Response
  try {
    upstream = await openStream(
      {
        model,
        messages: generationMessages(brief, problems),
        temperature: 0.7,
        max_tokens: 12_000,
        response_format: { type: 'json_object' },
        stream: true,
        usage: { include: true },
      },
      controller.signal,
    )
  } catch (e) {
    clearTimeout(timeout)
    console.error('[generate]', model, (e as Error).message)
    return NextResponse.json({ error: 'model failed' }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout)
    const text = await upstream.text().catch(() => '')
    console.error('[generate]', model, `HTTP ${upstream.status}`, text.slice(0, 300))
    return NextResponse.json({ error: 'model failed' }, { status: 502 })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = upstream.body.getReader()

  const stream = new ReadableStream<Uint8Array>({
    async start(out) {
      const send = (e: GenerateEvent) => out.enqueue(encoder.encode(JSON.stringify(e) + '\n'))
      let raw = ''
      let pending = ''
      let lastProgress = 0
      let usage: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | undefined

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const lines = pending.split('\n')
          pending = lines.pop() ?? ''
          for (const l of lines) {
            if (!l.startsWith('data: ')) continue
            const data = l.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const chunk = JSON.parse(data)
              const delta = chunk?.choices?.[0]?.delta?.content
              if (typeof delta === 'string') raw += delta
              if (chunk?.usage) usage = chunk.usage
              if (chunk?.error) console.error('[generate] поток прервался:', JSON.stringify(chunk.error).slice(0, 300))
            } catch {
              // Обрывок строки придёт целиком со следующим куском.
            }
          }
          const now = Date.now()
          if (now - lastProgress > PROGRESS_MS) {
            lastProgress = now
            send({
              type: 'progress',
              issues: count(raw, 'options'),
              interests: count(raw, 'line'),
              facts: count(raw, 'against'),
              beliefs: count(raw, 'reality'),
            })
          }
        }

        const seconds = Math.round((Date.now() - started) / 100) / 10
        const result = buildCase(raw, brief, `custom-${Date.now().toString(36)}`)
        console.info(
          '[generate]',
          model,
          `${seconds} с`,
          usage ? `токенов ${usage.completion_tokens}, из них размышлений ${usage.completion_tokens_details?.reasoning_tokens ?? 0}` : '',
          result.scenario ? 'кейс принят' : `не прошёл: ${result.problems.join(' | ')}`,
          result.repairs.length ? `правки: ${result.repairs.join('; ')}` : '',
        )
        send({ type: 'done', scenario: result.scenario, repairs: result.repairs, problems: result.problems, seconds })
      } catch (e) {
        console.error('[generate]', model, (e as Error).name === 'AbortError' ? 'таймаут' : (e as Error).message)
        send({ type: 'error' })
      } finally {
        clearTimeout(timeout)
        out.close()
      }
    },
    cancel() {
      controller.abort()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
