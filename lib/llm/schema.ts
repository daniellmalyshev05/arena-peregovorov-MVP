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
  stateDelta?: { trust?: number; irritation?: number; pressure?: number }
}

export interface ParseOutcome {
  turn: LlmTurn | null
  /** Почему не получилось — уходит в лог сервера, чтобы падения не были немыми. */
  reason?: string
  /** Что пришлось поправить в ответе модели. Тоже в лог: видно, где она систематически врёт формату. */
  repairs: string[]
}

/**
 * Разбор ответа модели.
 *
 * Принцип: реплика важнее формата. Раньше схема была строгой и отвергала весь
 * ответ целиком из-за одного лишнего речевого акта или числа вне диапазона —
 * а движок молча подменял его офлайн-заглушкой, и разговор рассыпался.
 * Теперь всё, что можно починить, чинится; выбрасывается только то,
 * что движок не имеет права принять.
 */
export function parseLlmTurn(raw: string): ParseOutcome {
  const repairs: string[] = []

  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) {
    return { turn: null, reason: 'в ответе нет JSON-объекта', repairs }
  }

  let data: unknown
  try {
    data = JSON.parse(cleaned.slice(start, end + 1))
  } catch (e) {
    return { turn: null, reason: 'JSON не разобрался: ' + (e as Error).message, repairs }
  }
  if (typeof data !== 'object' || data === null) {
    return { turn: null, reason: 'ответ не объект', repairs }
  }
  const o = data as Record<string, unknown>

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

  return { turn: { reply, detectedActs, revealedInterests, proposedDeal, stateDelta }, repairs }
}
