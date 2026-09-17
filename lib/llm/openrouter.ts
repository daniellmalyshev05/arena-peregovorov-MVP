const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CallResult {
  content: string | null
  /** Что именно пошло не так. Пишется в консоль сервера: немые падения — худший вид падений. */
  error?: string
  model?: string
}

/**
 * Вызов OpenRouter.
 *
 * Две попытки: сначала со строгим JSON-режимом, затем без него — часть моделей
 * и провайдеров отвергает response_format и отдаёт 400, после чего игра
 * незаметно скатывается в офлайн-заглушку.
 */
export async function callOpenRouter(messages: ChatMessage[]): Promise<CallResult> {
  const key = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL ?? 'google/gemini-3.8-flash-20260902'
  if (!key) return { content: null, error: 'OPENROUTER_API_KEY не задан' }

  const attempts: Array<Record<string, unknown>> = [
    { response_format: { type: 'json_object' } },
    {},
  ]

  let lastError = ''
  for (const [i, extra] of attempts.entries()) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Title': 'Arena Peregovorov',
        },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 800, ...extra }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        lastError = `HTTP ${res.status}${i === 0 ? ' (со строгим JSON)' : ''}: ${body.slice(0, 300)}`
        continue
      }

      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string' && content.trim()) return { content, model }

      lastError = 'провайдер вернул пустой ответ: ' + JSON.stringify(data).slice(0, 300)
    } catch (e) {
      const err = e as Error
      lastError = err.name === 'AbortError' ? 'таймаут 30 с' : `сеть: ${err.message}`
    } finally {
      clearTimeout(timeout)
    }
  }

  return { content: null, error: lastError, model }
}
