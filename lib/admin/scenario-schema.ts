import { z } from 'zod'
import type { Scenario } from '@/lib/types'
import { SPEECH_ACTS } from '@/lib/llm/schema'
import { auditScenario } from '@/lib/engine/audit'
import { LAYERS } from './draft'

/**
 * Проверка сгенерированного кейса, который пришёл извне: из браузера с ходом,
 * из хранилища, из ссылки или из файла.
 *
 * Кейс библиотеки сервер знает сам, сгенерированный — нет, поэтому каждый
 * раз проверяет его заново: схема, пределы размера, играбельность. Пределы
 * держат перебор вариантов сделки в тех же тысячах, что у библиотеки.
 */

const text = (max: number) => z.string().min(1).max(max)
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
const value = z.number().min(0).max(100)
const weight = z.number().min(0).max(1)

const MAX_DEALS = 4096

export const CUSTOM_PREFIX = 'custom-'

const scenarioSchema = z.object({
  id: z.string().regex(/^custom-[a-z0-9]{4,20}$/),
  title: text(120),
  subtitle: text(160),
  archetype: z.enum(['hard_negotiator', 'anxious_executive', 'false_urgency', 'partner']),
  userRole: text(200),
  userBrief: text(1200),
  userGoal: text(400),
  userBatna: z.object({ label: text(400), value }),
  opponentBatna: z.object({ label: text(400), value }),
  issues: z
    .array(
      z.object({
        id,
        label: text(100),
        hint: z.string().max(60).optional(),
        options: z.array(z.object({ id, label: text(120), valueUser: value, valueOpponent: value })).min(2).max(5),
        defaultOptionId: id,
        visibleFromStart: z.boolean(),
        weightUser: weight,
        weightOpponent: weight,
      }),
    )
    .min(3)
    .max(7),
  hiddenInterests: z
    .array(
      z.object({
        id,
        label: text(400),
        hypothesis: text(300),
        probe: z.string().max(40).optional(),
        unlockedBy: z.array(z.enum(SPEECH_ACTS)).min(1).max(6),
        revealLine: text(600),
        revealsIssue: id.optional(),
        layer: z.enum(LAYERS),
      }),
    )
    .min(1)
    .max(6),
  facts: z
    .array(z.object({ id, label: text(120), detail: text(600), strongAgainst: z.array(id).min(1).max(7) }))
    .max(6),
  beliefProbes: z.array(z.object({ id, text: text(400), truth: z.boolean(), reality: text(500) })).max(8),
  persona: z.object({
    name: text(80),
    role: text(140),
    company: text(140),
    portrait: z.string().max(80).optional(),
    speechStyle: text(1200),
    openingPosition: text(400),
    openingLine: text(600),
  }),
  fallbackLines: z.object({
    neutral: text(500),
    vague: text(500),
    pressure: text(500),
    concession: text(500),
    exchange: text(500),
    accept: text(500),
    counter: text(500),
    reject: text(500),
  }),
  maxRounds: z.number().int().min(4).max(24),
  openers: z.array(text(240)).max(4).optional(),
  organizerNote: z.string().max(400).optional(),
  organizerContext: z.string().max(300).optional(),
})

/**
 * Кейс годится, если схема сходится, ссылки внутри кейса целы и аудит не нашёл
 * блокеров. Аудит перебирает все варианты сделки, поэтому при чтении своего же
 * хранилища его можно пропустить: туда кейс попал уже проверенным.
 */
export function checkCustomScenario(raw: unknown, { audit = true }: { audit?: boolean } = {}): Scenario | null {
  const parsed = scenarioSchema.safeParse(raw)
  if (!parsed.success) return null
  const s = parsed.data as Scenario

  const issueIds = new Set(s.issues.map((i) => i.id))
  if (issueIds.size !== s.issues.length) return null
  for (const i of s.issues) {
    if (!i.options.some((o) => o.id === i.defaultOptionId)) return null
  }
  if (!s.issues.some((i) => i.visibleFromStart)) return null
  if (s.issues.reduce((p, i) => p * i.options.length, 1) > MAX_DEALS) return null
  for (const h of s.hiddenInterests) if (h.revealsIssue && !issueIds.has(h.revealsIssue)) return null
  for (const f of s.facts) if (f.strongAgainst.some((x) => !issueIds.has(x))) return null

  return !audit || auditScenario(s).playable ? s : null
}
