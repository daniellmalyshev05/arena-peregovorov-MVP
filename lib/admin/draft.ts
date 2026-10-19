import { z } from 'zod'
import type { Archetype, HiddenInterest, Issue, Scenario, SpeechAct } from '@/lib/types'

/**
 * Черновик кейса — то, что пишет модель при генерации.
 *
 * Формат короче сценария движка: уровни условия — кортежи, id уровней
 * и утверждений досье проставляет код. Чем меньше служебного пишет модель,
 * тем реже она в нём ошибается и тем быстрее отвечает.
 */

const text = (max: number) => z.string().trim().min(1).max(max)
const num = z.coerce.number()

export const LAYERS = ['interest', 'constraint', 'fear', 'resource'] as const

/** Чем раскрывается скрытый интерес: только конструктивные приёмы. Давлением секрет не выдаётся. */
export const UNLOCK_ACTS = [
  'spin_situation',
  'spin_problem',
  'spin_implication',
  'spin_needpayoff',
  'active_listening',
  'objective_criterion',
  'conditional_offer',
  'authority_check',
] as const satisfies readonly SpeechAct[]

export const draftSchema = z.object({
  title: text(70),
  subtitle: text(100),
  userRole: text(140),
  userBrief: text(800),
  userGoal: text(260),
  userBatna: z.object({ label: text(260), value: num }),
  opponentBatna: z.object({ label: text(260), value: num }),
  persona: z.object({
    name: text(60),
    role: text(90),
    company: text(90),
    speechStyle: text(800),
    openingPosition: text(260),
    openingLine: text(420),
  }),
  issues: z
    .array(
      z.object({
        id: text(40),
        label: text(70),
        hint: z.string().trim().max(40).optional(),
        visible: z.boolean().default(false),
        start: z.coerce.number().int().default(0),
        wUser: num,
        wOpp: num,
        options: z.array(z.tuple([text(80), num, num])).min(3).max(4),
      }),
    )
    .min(4)
    .max(7),
  interests: z
    .array(
      z.object({
        id: text(40),
        // Пропущенный слой не повод выбрасывать кейс: его доставит сборка.
        layer: z.enum(LAYERS).optional(),
        label: text(260),
        hypothesis: text(180),
        acts: z.array(z.string()).max(4).default([]),
        line: text(420),
        reveals: z.string().trim().optional(),
        belief: z.coerce.number().int().optional(),
      }),
    )
    .min(3)
    .max(5),
  facts: z
    .array(z.object({ id: text(40), label: text(70), detail: text(420), against: z.array(z.string()).min(1).max(4) }))
    .min(3)
    .max(5),
  beliefs: z.array(z.object({ text: text(240), truth: z.boolean(), reality: text(320) })).min(4).max(6),
  fallback: z.object({
    neutral: text(320),
    vague: text(320),
    pressure: text(320),
    concession: text(320),
    exchange: text(320),
    accept: text(320),
    counter: text(320),
    reject: text(320),
  }),
  openers: z.array(text(180)).min(3).max(4),
})

export type Draft = z.infer<typeof draftSchema>

/** Кейс библиотеки в формате черновика — образец для модели. */
export function toDraft(s: Scenario): Draft {
  const beliefNo = (id?: string) => {
    const i = s.beliefProbes.findIndex((b) => b.id === id)
    return i >= 0 ? i + 1 : undefined
  }
  return {
    title: s.title,
    subtitle: s.subtitle,
    userRole: s.userRole,
    userBrief: s.userBrief,
    userGoal: s.userGoal,
    userBatna: s.userBatna,
    opponentBatna: s.opponentBatna,
    persona: {
      name: s.persona.name,
      role: s.persona.role,
      company: s.persona.company,
      speechStyle: s.persona.speechStyle,
      openingPosition: s.persona.openingPosition,
      openingLine: s.persona.openingLine,
    },
    issues: s.issues.map((i) => ({
      id: i.id,
      label: i.label,
      ...(i.hint ? { hint: i.hint } : {}),
      visible: i.visibleFromStart,
      start: i.options.findIndex((o) => o.id === i.defaultOptionId),
      wUser: i.weightUser,
      wOpp: i.weightOpponent,
      options: i.options.map((o) => [o.label, o.valueUser, o.valueOpponent] as [string, number, number]),
    })),
    interests: s.hiddenInterests.map((h) => ({
      id: h.id,
      layer: h.layer,
      label: h.label,
      hypothesis: h.hypothesis,
      acts: [...h.unlockedBy],
      line: h.revealLine,
      ...(h.revealsIssue ? { reveals: h.revealsIssue } : {}),
      ...(beliefNo(h.probe) ? { belief: beliefNo(h.probe) } : {}),
    })),
    facts: s.facts.map((f) => ({ id: f.id, label: f.label, detail: f.detail, against: f.strongAgainst })),
    // Веса после балансировки меняются, поэтому в образце их нет и в пояснениях.
    beliefs: s.beliefProbes.map((b) => ({ text: b.text, truth: b.truth, reality: b.reality.replace(/\s*\(\d+,\d+\)/g, '') })),
    fallback: s.fallbackLines,
    openers: s.openers ?? [],
  }
}

/** Латиница, цифры и подчёркивание — как в id библиотечных кейсов. */
function slug(raw: string, fallback: string, taken: Set<string>): string {
  let base = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
  if (!base || /^\d/.test(base)) base = fallback
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`
  taken.add(id)
  return id
}

const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : min)))

/** Вопросы на старт, если модель в своих назвала то, что игрок должен выяснить сам. */
const SAFE_OPENERS = [
  'Как вы сейчас видите эту ситуацию?',
  'Что для вас в этом вопросе сложнее всего?',
  'Что должно получиться, чтобы решение вас устроило?',
]

/** Произведение уровней — сколько вариантов сделки перебирает движок. Больше — медленнее карта. */
const MAX_DEALS = 4096

/**
 * Черновик → сценарий движка.
 *
 * Здесь только сборка и ремонт структуры: ссылки между частями кейса,
 * границы чисел, число открытых условий. Экономику выравнивает balance.ts.
 */
export function fromDraft(d: Draft, tone: Archetype, id: string): { scenario: Scenario; repairs: string[] } {
  const repairs: string[] = []

  const issueIds = new Set<string>()
  const issueMap = new Map<string, string>()
  let issues: Issue[] = d.issues.map((raw, n) => {
    const iid = slug(raw.id, `issue_${n + 1}`, issueIds)
    issueMap.set(raw.id, iid)
    issueMap.set(raw.id.toLowerCase(), iid)
    const options = raw.options.map(([label, u, o], k) => ({
      id: `${iid}_${k + 1}`,
      label,
      valueUser: clampInt(u, 0, 100),
      valueOpponent: clampInt(o, 0, 100),
    }))
    const start = clampInt(raw.start, 0, options.length - 1)
    if (start !== raw.start) repairs.push(`${iid}: статус-кво за пределами уровней`)
    return {
      id: iid,
      label: raw.label,
      ...(raw.hint ? { hint: raw.hint } : {}),
      options,
      defaultOptionId: options[start].id,
      visibleFromStart: raw.visible,
      weightUser: Math.max(0, raw.wUser),
      weightOpponent: Math.max(0, raw.wOpp),
    }
  })

  // На старте на столе одно-два условия: остальное игрок открывает вопросами.
  const visible = issues.filter((i) => i.visibleFromStart)
  if (!visible.length) {
    issues[0] = { ...issues[0], visibleFromStart: true }
    repairs.push('ни одного условия на столе — открыто первое')
  } else if (visible.length > 2) {
    const keep = new Set(visible.slice(0, 2).map((i) => i.id))
    issues = issues.map((i) => ({ ...i, visibleFromStart: keep.has(i.id) }))
    repairs.push(`на столе было ${visible.length} условия — оставлено два`)
  }

  // Слишком много вариантов: у скрытых условий с четырьмя уровнями убираем средний.
  const deals = () => issues.reduce((p, i) => p * i.options.length, 1)
  while (deals() > MAX_DEALS) {
    const four = issues.findIndex((i) => i.options.length > 3 && !i.visibleFromStart)
    const any = four >= 0 ? four : issues.findIndex((i) => i.options.length > 3)
    if (any < 0) break
    const issue = issues[any]
    const drop = issue.options.findIndex((o, k) => k > 0 && k < issue.options.length - 1 && o.id !== issue.defaultOptionId)
    issues[any] = { ...issue, options: issue.options.filter((_, k) => k !== drop) }
    repairs.push(`${issue.id}: убран лишний уровень`)
  }

  const hidden = new Set(issues.filter((i) => !i.visibleFromStart).map((i) => i.id))
  const issueRef = (raw?: string) => (raw ? issueMap.get(raw) ?? issueMap.get(raw.toLowerCase()) : undefined)

  const beliefIds = d.beliefs.map((_, n) => `b${n + 1}`)
  // Слой без пометки получает первый свободный: на сцене у каждого слоя своя плашка.
  const freeLayers = LAYERS.filter((l) => !d.interests.some((i) => i.layer === l))
  const interestIds = new Set<string>()
  const hiddenInterests: HiddenInterest[] = d.interests.map((raw, n) => {
    const acts = raw.acts.filter((a): a is (typeof UNLOCK_ACTS)[number] => (UNLOCK_ACTS as readonly string[]).includes(a))
    if (acts.length < raw.acts.length) repairs.push(`интерес ${n + 1}: отброшены приёмы, которыми секрет раскрываться не должен`)
    const reveals = issueRef(raw.reveals)
        const probe = raw.belief && raw.belief >= 1 && raw.belief <= beliefIds.length ? beliefIds[raw.belief - 1] : undefined
    return {
      id: slug(raw.id, `interest_${n + 1}`, interestIds),
      label: raw.label,
      hypothesis: raw.hypothesis,
      ...(probe ? { probe } : {}),
      unlockedBy: acts.length ? acts : ['spin_problem'],
      revealLine: raw.line,
      ...(reveals && hidden.has(reveals) ? { revealsIssue: reveals } : {}),
      layer: raw.layer ?? freeLayers.shift() ?? 'interest',
    }
  })

  // Интерес без своего условия получает скрытое условие, которое иначе так и
  // не выйдет на стол: раскрытие должно что-то менять в соглашении.
  const unrevealed = issues.filter(
    (i) => !i.visibleFromStart && !hiddenInterests.some((h) => h.revealsIssue === i.id),
  )
  for (const h of hiddenInterests) {
    if (h.revealsIssue) continue
    const next = unrevealed.shift()
    if (!next) break
    h.revealsIssue = next.id
    repairs.push(`интерес «${h.id}» открывает «${next.label}»`)
  }

  const factIds = new Set<string>()
  const firstOpen = issues.find((i) => i.visibleFromStart)!.id
  const facts = d.facts.map((raw, n) => {
    const against = [...new Set(raw.against.map(issueRef).filter((x): x is string => !!x))]
    return {
      id: slug(raw.id, `fact_${n + 1}`, factIds),
      label: raw.label,
      detail: raw.detail,
      strongAgainst: against.length ? against : [firstOpen],
    }
  })

  // Подсказка на старт не должна называть условие, которое игрок должен вытащить сам.
  const hiddenStems = issues
    .filter((i) => !i.visibleFromStart)
    .flatMap((i) => i.label.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/).filter((w) => w.length >= 6).map((w) => w.slice(0, 6)))
  const openers = d.openers.slice(0, 3).map((o, n) => {
    const said = o.toLowerCase().replace(/ё/g, 'е')
    if (hiddenStems.some((st) => said.includes(st))) {
      repairs.push(`вопрос на старт ${n + 1} называл скрытое условие`)
      return SAFE_OPENERS[n]
    }
    return o
  })

  const scenario: Scenario = {
    id,
    title: d.title,
    subtitle: d.subtitle,
    archetype: tone,
    userRole: d.userRole,
    userBrief: d.userBrief,
    userGoal: d.userGoal,
    userBatna: { label: d.userBatna.label, value: clampInt(d.userBatna.value, 5, 92) },
    opponentBatna: { label: d.opponentBatna.label, value: clampInt(d.opponentBatna.value, 5, 92) },
    issues,
    hiddenInterests,
    facts,
    beliefProbes: d.beliefs.map((b, n) => ({ id: beliefIds[n], text: b.text, truth: b.truth, reality: b.reality })),
    persona: { ...d.persona },
    fallbackLines: d.fallback,
    maxRounds: 10,
    openers,
  }

  return { scenario: withoutOrganizer(scenario), repairs }
}

/** В кейсах организатор не называется — только «ОЭЗ». */
function withoutOrganizer(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s).replace(/(ОЭЗ\s+)?(ППТ\s+)?«?Алабуг[а-яё]*»?/gi, 'ОЭЗ')) as Scenario
}
