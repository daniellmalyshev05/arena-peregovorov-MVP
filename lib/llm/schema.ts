import { z } from 'zod'

export const SPEECH_ACTS = [
  'spin_situation', 'spin_problem', 'spin_implication', 'spin_needpayoff',
  'active_listening', 'objective_criterion', 'conditional_offer',
  'unilateral_concession', 'positional_bargaining', 'personal_attack',
  'bluff', 'authority_check', 'walkaway_signal',
] as const

export const speechActEnum = z.enum(SPEECH_ACTS)

export interface LlmTurn {
  reply: string
  detectedActs: (typeof SPEECH_ACTS)[number][]
  revealedInterests: string[]
  proposedDeal?: Record<string, string>
  /** Условия, которые игрок назвал словами. Модель только сопоставляет их с уровнями, проверяет код. */
  userOffer?: Record<string, string>
  stateDelta?: { trust?: number; irritation?: number; pressure?: number }
}

export interface ParseOutcome {
  turn: LlmTurn | null
  /** Почему не получилось — уходит в лог сервера. */
  reason?: string
  /** Что пришлось поправить в ответе модели. Тоже в лог: видно, где модель систематически нарушает формат. */
  repairs: string[]
}

/**
 * Разбор ответа модели.
 *
 * Принцип: реплика важнее формата. Всё, что можно починить, чинится
 * (лишний речевой акт, число вне диапазона); выбрасывается только то,
 * что движок не имеет права принять.
 */
export function parseLlmTurn(raw: string): ParseOutcome {
  const repairs: string[] = []

  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{')

  let o: Record<string, unknown> | null = null

  if (start !== -1) {
    const end = cleaned.lastIndexOf('}')
    if (end > start) {
      try {
        const data = JSON.parse(cleaned.slice(start, end + 1))
        if (data && typeof data === 'object') o = data as Record<string, unknown>
      } catch {
        // Ниже попробуем вытащить реплику из обрывка.
      }
    }
  }

  // Частая поломка — ответ оборван на полуслове, закрывающей скобки нет.
  // Ход не выбрасываем: реплика в нём обычно уже есть.
  if (!o && start !== -1) o = rescueTruncated(cleaned, repairs)

  // JSON нет вовсе, но есть живая человеческая фраза — это и есть реплика.
  if (!o && start === -1 && looksLikeSpeech(cleaned)) {
    repairs.push('модель ответила прозой без JSON')
    o = { reply: cleaned }
  }

  if (!o) {
    return {
      turn: null,
      reason: start === -1 ? 'в ответе нет ни JSON, ни текста' : 'ответ оборван, реплику вытащить не удалось',
      repairs,
    }
  }

  // Реплика — единственное, без чего ход невозможен.
  let reply = typeof o.reply === 'string' ? o.reply.trim() : ''
  if (!reply && typeof o.message === 'string') {
    reply = o.message.trim()
    repairs.push('реплика пришла в поле message')
  }
  if (!reply) return { turn: null, reason: 'пустая реплика', repairs }
  if (reply.length > 900) {
    reply = reply.slice(0, 900).replace(/\s+\S*$/, '') + '…'
    repairs.push('реплика обрезана')
  }

  // Неизвестные акты выбрасываем поштучно, а не вместе со всем ходом.
  const rawActs = Array.isArray(o.detectedActs) ? o.detectedActs : []
  const known = new Set<string>(SPEECH_ACTS)
  const detectedActs = rawActs
    .filter((a): a is string => typeof a === 'string')
    .filter((a) => {
      if (known.has(a)) return true
      repairs.push(`выброшен неизвестный акт «${a}»`)
      return false
    })
    .slice(0, 4) as LlmTurn['detectedActs']

  const revealedInterests = (Array.isArray(o.revealedInterests) ? o.revealedInterests : [])
    .filter((x): x is string => typeof x === 'string')
    .slice(0, 2)

  // Уровни условий приводим к строкам: модели любят вернуть число.
  let proposedDeal: Record<string, string> | undefined
  if (o.proposedDeal && typeof o.proposedDeal === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o.proposedDeal as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
      else if (typeof v === 'number') { out[k] = String(v); repairs.push(`уровень «${k}» пришёл числом`) }
    }
    if (Object.keys(out).length) proposedDeal = out
  }

  // Дельты настроения зажимаем, а не отвергаем.
  let userOffer: Record<string, string> | undefined
  if (o.userOffer && typeof o.userOffer === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o.userOffer as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    if (Object.keys(out).length) userOffer = out
  }

  let stateDelta: LlmTurn['stateDelta']
  if (o.stateDelta && typeof o.stateDelta === 'object') {
    const src = o.stateDelta as Record<string, unknown>
    const clamp = (v: unknown, name: string) => {
      if (typeof v !== 'number' || Number.isNaN(v)) return undefined
      const c = Math.max(-8, Math.min(8, v))
      if (c !== v) repairs.push(`${name} зажат с ${v} до ${c}`)
      return c
    }
    stateDelta = {
      trust: clamp(src.trust, 'trust'),
      irritation: clamp(src.irritation, 'irritation'),
      pressure: clamp(src.pressure, 'pressure'),
    }
  }

  return { turn: { reply, detectedActs, revealedInterests, proposedDeal, userOffer, stateDelta }, repairs }
}

/** Похоже на реплику человека, а не на служебный мусор. */
function looksLikeSpeech(text: string): boolean {
  return text.length >= 2 && text.length <= 2000 && /[a-zA-Zа-яёА-ЯЁ]/.test(text)
}

const ACT_PATTERN = new RegExp(`"(${SPEECH_ACTS.join('|')})"`, 'g')

/**
 * Спасение оборванного ответа.
 *
 * Поля идут в том порядке, в каком их просит промпт, и реплика стоит первой —
 * поэтому в обрывке она почти всегда целая. Вытаскиваем её регулярным
 * выражением, добираем то, что успело прийти следом, и отдаём как обычный ход.
 */
function rescueTruncated(text: string, repairs: string[]): Record<string, unknown> | null {
  const unescape = (raw: string) => {
    try {
      return JSON.parse('"' + raw + '"') as string
    } catch {
      return raw.replace(/\\"/g, '"').replace(/\\n/g, ' ')
    }
  }

  let reply = ''
  const whole = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (whole) {
    reply = unescape(whole[1])
    repairs.push('ответ оборван, реплика восстановлена')
  } else {
    // Обрыв пришёлся на саму реплику: берём её по последнюю законченную фразу.
    const open = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)$/)
    if (!open) return null
    const partial = unescape(open[1].replace(/\\+$/, ''))
    const cut = Math.max(partial.lastIndexOf('.'), partial.lastIndexOf('!'), partial.lastIndexOf('?'))
    if (cut < 20) return null
    reply = partial.slice(0, cut + 1)
    repairs.push('ответ оборван посреди реплики, взята последняя законченная фраза')
  }

  if (!reply.trim()) return null

  const tail = text.slice((whole?.index ?? 0) + (whole?.[0].length ?? 0))
  const acts = [...tail.matchAll(ACT_PATTERN)].map((m) => m[1])

  const list = (field: string) => {
    const m = tail.match(new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)\\]`))
    if (!m) return []
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  }

  const dealMatch = tail.match(/"proposedDeal"\s*:\s*\{([^}]*)\}/)
  let proposedDeal: Record<string, string> | undefined
  if (dealMatch) {
    const pairs = [...dealMatch[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)]
    if (pairs.length) proposedDeal = Object.fromEntries(pairs.map((m) => [m[1], m[2]]))
  }

  return {
    reply,
    detectedActs: acts,
    revealedInterests: list('revealedInterests'),
    ...(proposedDeal ? { proposedDeal } : {}),
  }
}
