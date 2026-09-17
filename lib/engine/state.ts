import type {
  Deal, NegotiationState, Scenario, SpeechAct, Turn,
} from '@/lib/types'
import { initialDeal, optionOf, shiftDirection, surplus, utility } from './utility'
import { NO_ADAPTATION, type Adaptation } from './adaptive'

export function createInitialState(scenario: Scenario): NegotiationState {
  return {
    scenarioId: scenario.id,
    round: 1,
    deal: initialDeal(scenario),
    visibleIssues: scenario.issues.filter((i) => i.visibleFromStart).map((i) => i.id),
    revealedInterests: [],
    mood: { trust: 45, irritation: 15, pressure: 25, flexibility: 45 },
    playedFacts: [],
    hypotheses: [],
    transcript: [
      {
        index: 0,
        role: 'opponent',
        text: scenario.persona.openingLine,
        acts: ['positional_bargaining'],
        dealChanges: [],
        revealed: [],
        timestamp: Date.now(),
      },
    ],
    status: 'active',
    unilateralConcessions: 0,
    conditionalOffers: 0,
  }
}

/**
 * Приводит предложение к тому виду, в котором оно реально может быть применено:
 * выбрасывает неизвестные условия, несуществующие уровни и всё, что ещё не выведено
 * в терм-шит. Вердикт и применение обязаны считаться по ОДНОМУ И ТОМУ ЖЕ набору,
 * иначе оппонент соглашается на одно, а в документ попадает другое.
 */
export function sanitizeOffer(scenario: Scenario, state: NegotiationState, incoming: Partial<Deal>): Deal {
  const proposed: Deal = { ...state.deal }
  for (const [issueId, optionId] of Object.entries(incoming)) {
    if (!optionId) continue
    const issue = scenario.issues.find((i) => i.id === issueId)
    if (!issue) continue
    if (!state.visibleIssues.includes(issueId)) continue
    if (!issue.options.some((o) => o.id === optionId)) continue
    proposed[issueId] = optionId
  }
  return proposed
}

export type OfferVerdict = 'accept' | 'counter' | 'reject'

/**
 * Принимает ли оппонент предложение — решает КОД, а не LLM.
 * Уровень притязаний падает с раундами и растёт от раздражения:
 * оппонент не соглашается на минимум просто потому, что модель захотела быть вежливой.
 */
/**
 * Настройки уровня притязаний по архетипам.
 * Это и есть «вариативность игровых механик»: один и тот же движок ведёт себя
 * по-разному, потому что разные оппоненты по-разному уступают со временем.
 */
const ARCHETYPE = {
  // Жёсткий: держится долго, медленно сдаёт, доверие почти не размягчает.
  hard_negotiator: { base: 16, floor: 3, trust: 0.05, irritation: 0.09, exchangeBonus: 0 },
  // Тревожный: раздражение бьёт сильно, зато доверие быстро открывает дверь.
  anxious_executive: { base: 12, floor: 2, trust: 0.12, irritation: 0.16, exchangeBonus: 0 },
  // Ложная срочность: громко требует много, но к финалу сдувается резко.
  false_urgency: { base: 19, floor: 1, trust: 0.06, irritation: 0.05, exchangeBonus: 0 },
  // Партнёрский: соглашается легче, но только на обмен, а не на голую уступку.
  partner: { base: 10, floor: 2, trust: 0.1, irritation: 0.1, exchangeBonus: 2.5 },
} as const

/**
 * Принимает ли оппонент предложение — решает КОД, а не LLM.
 * Уровень притязаний падает с раундами и растёт от раздражения:
 * оппонент не соглашается на минимум просто потому, что модель захотела быть вежливой.
 */
export function evaluateOffer(
  scenario: Scenario,
  state: NegotiationState,
  proposed: Deal,
  adaptation: Adaptation = NO_ADAPTATION,
): { verdict: OfferVerdict; opponentSurplus: number; aspiration: number } {
  const opponentSurplus = surplus(scenario, proposed, 'opponent')
  const cfg = ARCHETYPE[scenario.archetype] ?? ARCHETYPE.hard_negotiator

  // Профиль игрока поднимает и стартовое притязание, и ту планку,
  // ниже которой оппонент не опустится даже к последнему раунду.
  const base = cfg.base + adaptation.aspiration
  const floor = cfg.floor + adaptation.floor

  const progress = Math.min(1, state.round / scenario.maxRounds)
  let aspiration = base - (base - floor) * progress

  // Он почуял кровь: каждая голая уступка поднимает его аппетит.
  if (adaptation.exploitsConcessions) aspiration += state.unilateralConcessions * 1.5

  aspiration -= (state.mood.trust - 45) * cfg.trust
  aspiration += (state.mood.irritation - 15) * cfg.irritation

  // Партнёрский переговорщик вознаграждает встречное условие, а не уступку.
  if (cfg.exchangeBonus && state.conditionalOffers > state.unilateralConcessions) {
    aspiration -= cfg.exchangeBonus
  }

  aspiration = Math.max(0.5, aspiration)

  let verdict: OfferVerdict
  if (opponentSurplus >= aspiration) verdict = 'accept'
  else if (opponentSurplus >= 0) verdict = 'counter'
  else verdict = 'reject'

  return { verdict, opponentSurplus: round2(opponentSurplus), aspiration: round2(aspiration) }
}

export interface LlmTurnOutput {
  reply: string
  detectedActs: SpeechAct[]
  revealedInterests: string[]
  proposedDeal?: Partial<Deal>
  stateDelta?: { trust?: number; irritation?: number; pressure?: number }
}

export interface ApplyTurnInput {
  scenario: Scenario
  state: NegotiationState
  userText: string
  llm: LlmTurnOutput
  /** Явное предложение из шторки «Собрать предложение» — экономика идёт этим путём. */
  explicitOffer?: Deal
  factPlayed?: string
  /** Гипотезы, зафиксированные игроком к этому моменту. */
  hypothesisUpdate?: { id: string; confidence: number }[]
  /** Вердикт, уже посчитанный вызывающей стороной по тому же предложению. */
  precomputedVerdict?: OfferVerdict
}

export interface ApplyTurnResult {
  state: NegotiationState
  /** Гипотеза, которую стоит ненавязчиво показать игроку на две секунды. */
  hint?: string
  verdict?: OfferVerdict
}

export function applyTurn(input: ApplyTurnInput): ApplyTurnResult {
  const { scenario, llm, userText, explicitOffer, factPlayed, hypothesisUpdate } = input
  const state = clone(input.state)
  const index = state.transcript.length

  // 1. Раскрытие интересов — только если речевой акт реально подходит.
  const newlyRevealed: string[] = []
  for (const id of llm.revealedInterests ?? []) {
    const interest = scenario.hiddenInterests.find((h) => h.id === id)
    if (!interest) continue
    if (state.revealedInterests.includes(id)) continue
    const unlocked = interest.unlockedBy.some((act) => llm.detectedActs.includes(act))
    if (!unlocked) continue
    state.revealedInterests.push(id)
    newlyRevealed.push(id)
    if (interest.revealsIssue && !state.visibleIssues.includes(interest.revealsIssue)) {
      state.visibleIssues.push(interest.revealsIssue)
    }
  }

  // 2. Изменения сделки. Явное предложение приоритетнее того, что послышалось модели.
  const incoming = explicitOffer ?? llm.proposedDeal ?? {}
  const dealChanges: Turn['dealChanges'] = []
  let verdict: OfferVerdict | undefined

  if (Object.keys(incoming).length) {
    const proposed = sanitizeOffer(scenario, state, incoming)
    verdict = input.precomputedVerdict ?? evaluateOffer(scenario, state, proposed).verdict

    // Условия фиксируются, только если оппонент согласился. Иначе это остаётся предложением.
    if (verdict === 'accept') {
      for (const issue of scenario.issues) {
        const from = state.deal[issue.id]
        const to = proposed[issue.id]
        if (from !== to) dealChanges.push({ issueId: issue.id, from, to })
      }
      state.deal = proposed
      state.status = allIssuesSettled(scenario, state) ? 'deal' : 'active'
    }
  }

  // 3. Дисциплина уступок считается кодом по направлению сдвига, а не со слов модели.
  const concessions = dealChanges.filter((c) => shiftDirection(issueById(scenario, c.issueId)!, c.from, c.to) === 'concession')
  const gains = dealChanges.filter((c) => shiftDirection(issueById(scenario, c.issueId)!, c.from, c.to) === 'gain')
  const acts = new Set<SpeechAct>(llm.detectedActs ?? [])
  if (concessions.length && !gains.length) {
    state.unilateralConcessions += 1
    acts.add('unilateral_concession')
    acts.delete('conditional_offer')
  } else if (concessions.length && gains.length) {
    state.conditionalOffers += 1
    acts.add('conditional_offer')
    acts.delete('unilateral_concession')
  }

  // 4. Настроение. Дельты от модели ограничены — она не управляет миром, только подталкивает.
  const d = llm.stateDelta ?? {}
  state.mood.trust = clampRange(state.mood.trust + clampDelta(d.trust), 0, 100)
  state.mood.irritation = clampRange(state.mood.irritation + clampDelta(d.irritation), 0, 100)
  state.mood.pressure = clampRange(state.mood.pressure + clampDelta(d.pressure), 0, 100)
  if (acts.has('personal_attack')) state.mood.irritation = clampRange(state.mood.irritation + 12, 0, 100)
  if (acts.has('active_listening')) state.mood.trust = clampRange(state.mood.trust + 4, 0, 100)
  state.mood.flexibility = clampRange(50 + (state.mood.trust - state.mood.irritation) / 2, 0, 100)

  if (factPlayed && !state.playedFacts.includes(factPlayed)) state.playedFacts.push(factPlayed)

  for (const h of hypothesisUpdate ?? []) {
    const probe = scenario.beliefProbes.find((p) => p.id === h.id)
    if (!probe) continue
    const existing = state.hypotheses.find((x) => x.id === h.id)
    if (existing) existing.confidence = clampRange(h.confidence, 0, 1)
    else state.hypotheses.push({ id: h.id, text: probe.text, confidence: clampRange(h.confidence, 0, 1) })
  }

  // 5. Записываем оба хода.
  state.transcript.push({
    index, role: 'user', text: userText, acts: [...acts],
    dealChanges, revealed: newlyRevealed, factPlayed, timestamp: Date.now(),
  })
  state.transcript.push({
    index: index + 1, role: 'opponent', text: llm.reply, acts: [],
    dealChanges: [], revealed: [], timestamp: Date.now(),
  })

  state.round += 1
  if (state.round > scenario.maxRounds && state.status === 'active') state.status = 'timeout'

  const hint = newlyRevealed.length
    ? scenario.hiddenInterests.find((h) => h.id === newlyRevealed[0])?.hypothesis
    : undefined

  return { state, hint, verdict }
}

export function walkAway(state: NegotiationState): NegotiationState {
  const next = clone(state)
  next.status = 'walkaway'
  return next
}

/** Сделка считается собранной, когда все открытые условия сдвинуты со статус-кво. */
function allIssuesSettled(scenario: Scenario, state: NegotiationState): boolean {
  const visible = scenario.issues.filter((i) => state.visibleIssues.includes(i.id))
  if (visible.length < 3) return false
  const moved = visible.filter((i) => state.deal[i.id] !== i.defaultOptionId)
  return moved.length >= Math.ceil(visible.length * 0.6)
}

/** Развилка: откат к состоянию перед выбранным ходом. */
export function rewindTo(snapshots: NegotiationState[], turnIndex: number): NegotiationState | undefined {
  const snap = snapshots.find((s) => s.transcript.length === turnIndex)
  return snap ? clone(snap) : undefined
}

export function currentUtility(scenario: Scenario, state: NegotiationState) {
  return {
    user: utility(scenario, state.deal, 'user'),
    opponent: utility(scenario, state.deal, 'opponent'),
    userSurplus: surplus(scenario, state.deal, 'user'),
  }
}

export function dealSummary(scenario: Scenario, deal: Deal) {
  return scenario.issues.map((issue) => ({
    issueId: issue.id,
    label: issue.label,
    hint: issue.hint,
    optionLabel: optionOf(issue, deal[issue.id]).label,
    isDefault: deal[issue.id] === issue.defaultOptionId,
  }))
}

const issueById = (s: Scenario, id: string) => s.issues.find((i) => i.id === id)
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const clampDelta = (n?: number) => Math.max(-8, Math.min(8, n ?? 0))
const clampRange = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const round2 = (n: number) => Math.round(n * 100) / 100
