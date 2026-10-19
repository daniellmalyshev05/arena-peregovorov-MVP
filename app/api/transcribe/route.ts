import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const ENDPOINT = 'https://openrouter.ai/api/v1/audio/transcriptions'
/** Запасная модель, если основная недоступна у провайдера. */
const FALLBACK_MODEL = 'openai/whisper-1'
/** Минута речи в opus весит ~250 КБ, в AAC — до мегабайта. Лимит Vercel на тело — 4,5 МБ. */
const MAX_BYTES = 4_000_000
const TIMEOUT_MS = 15_000

/**
 * Whisper на тишине и шуме дописывает фразы из субтитров, на которых учился.
 * Такой ответ целиком — не речь игрока.
 */
const PHANTOM = /^(субтитры .*|продолжение следует\.*|спасибо за просмотр!?\.*|редактор субтитров .*)$/i
/**
 * На шуме и музыке модель выдаёт английскую «болванку» вроде «The quick brown fox».
 * Реплика в русских переговорах без единой кириллической буквы — не речь игрока.
 */
const CYRILLIC = /[а-яё]/i

function formatOf(type: string): string | null {
  if (type.includes('webm')) return 'webm'
  if (type.includes('ogg')) return 'ogg'
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a'
  if (type.includes('wav')) return 'wav'
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3'
  return null
}

/**
 * Распознавание реплики, сказанной голосом.
 *
 * Браузер присылает запись как есть, сервер отдаёт её в OpenRouter тем же
 * ключом, что и для модели собеседника. В ответ — только текст: он падает
 * в поле ввода, отправляет игрок.
 */
export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY
  if (process.env.DEMO_MODE === 'true' || !key) {
    return NextResponse.json({ error: 'voice off' }, { status: 503 })
  }

  const format = formatOf(req.headers.get('content-type') ?? '')
  if (!format) return NextResponse.json({ error: 'unsupported audio' }, { status: 415 })

  const audio = Buffer.from(await req.arrayBuffer())
  if (!audio.length) return NextResponse.json({ error: 'empty audio' }, { status: 400 })
  if (audio.length > MAX_BYTES) return NextResponse.json({ error: 'too long' }, { status: 413 })

  const primary = process.env.OPENROUTER_STT_MODEL || 'openai/gpt-4o-transcribe'
  const models = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL]
  const data = audio.toString('base64')

  let lastError = ''
  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Title': 'Arena Peregovorov',
        },
        body: JSON.stringify({ model, input_audio: { data, format }, language: 'ru', temperature: 0 }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        lastError = `${model}: HTTP ${res.status} ${body.slice(0, 300)}`
        continue
      }
      const json = (await res.json()) as { text?: unknown }
      const text = typeof json.text === 'string' ? json.text.trim() : ''
      return NextResponse.json({ text: PHANTOM.test(text) || !CYRILLIC.test(text) ? '' : text })
    } catch (e) {
      const err = e as Error
      lastError = `${model}: ${err.name === 'AbortError' ? `таймаут ${TIMEOUT_MS / 1000} с` : `сеть: ${err.message}`}`
    } finally {
      clearTimeout(timeout)
    }
  }

  console.error('[transcribe]', lastError)
  return NextResponse.json({ error: 'transcription failed' }, { status: 502 })
}
