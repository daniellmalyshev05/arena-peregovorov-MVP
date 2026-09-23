const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CallResult {
  content: string | null
  /** Что именно пошло не так. Пишется в консоль сервера. */
  error?: string
  model?: string
  /** Какая попытка сработала. Ненулевая означает, что провайдер отверг предыдущую. */
  attempt?: number
}

/**
 * Вызов OpenRouter.
 *
 * Две попытки: строгий JSON, затем без него — часть провайдеров отвергает
 * response_format с ошибкой 400.
 *
 * `max_tokens` = 1600: при 800 ответы обрезались посреди JSON.
 * Поле `reasoning` провайдер отвергает с 400, поэтому его здесь нет.
 */
export interface CallOptions {
  /** Таймаут одной попытки. По умолчанию 20 с — две попытки укладываются в лимит функции. */
  timeoutMs?: number
  /** Одна попытка вместо двух: для дозапросов, у которых свой, меньший бюджет времени. */
  single?: boolean
}

export async function callOpenRouter(messages: ChatMessage[], options: CallOptions = {}): Promise<CallResult> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const key = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL ?? 'google/gemini-3.8-flash-20260902'
  if (!key) return { content: null, error: 'OPENROUTER_API_KEY не задан' }

  const attempts: Array<Record<string, unknown>> = [
    { response_format: { type: 'json_object' } },
    {},
  ].slice(0, options.single ? 1 : 2)

  let lastError = ''
  for (const [i, extra] of attempts.entries()) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Title': 'Arena Peregovorov',
        },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1600, ...extra }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        lastError = `HTTP ${res.status} (попытка ${i + 1}): ${body.slice(0, 300)}`
        continue
      }

      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string' && content.trim()) return { content, model, attempt: i }

      lastError = 'провайдер вернул пустой ответ: ' + JSON.stringify(data).slice(0, 300)
    } catch (e) {
      const err = e as Error
      lastError = err.name === 'AbortError' ? `таймаут ${Math.round(timeoutMs / 1000)} с` : `сеть: ${err.message}`
    } finally {
      clearTimeout(timeout)
    }
  }

  return { content: null, error: lastError, model }
}
