import type {
  Deal, NegotiationState, Scenario, SpeechAct, Turn,
} from '@/lib/types'
import { initialDeal, optionOf, shiftDirection, surplus, utility } from './utility'
import { NO_ADAPTATION, type Adaptation } from './adaptive'
import { isDirectAsk } from './acts'

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
 * Настройки уровня притязаний по архетипам: один движок, но разные оппоненты
 * по-разному уступают со временем.
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
): { verdict: OfferVerdict; opponentSurplus: number; aspiration: number; counter?: Deal } {
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

  // Своё встречное предложение вторая сторона не отзывает: если игрок вернул
  // ей ровно её условия, а они всё ещё лучше её запасного варианта, это согласие.
  if (verdict !== 'accept' && opponentSurplus >= 0 && state.standingCounter && sameDeal(proposed, state.standingCounter)) {
    verdict = 'accept'
  }

  const counter = verdict === 'accept' ? undefined : counterOffer(scenario, state, proposed, aspiration + COUNTER_MARGIN)

  return { verdict, opponentSurplus: round2(opponentSurplus), aspiration: round2(aspiration), counter }
}

/** Запас над притязанием, с которым считается встречное: настроение за раунд может его немного сдвинуть. */
const COUNTER_MARGIN = 1

/**
 * Встречное предложение второй стороны — считает КОД, как и вердикт.
 *
 * Встречное — ближайший к пакету игрока вариант, который устраивает вторую
 * сторону. Двигаются только условия, уже выведенные в разговор, поэтому
 * встречное, взятое как есть, принимается.
 *
 * Если возможно, встречное строится как обмен (хотя бы одно условие лучше для
 * игрока, чем текущее соглашение): иначе принятие его как есть записалось бы
 * уступкой без встречного условия. Ради обмена допускается на одно изменённое
 * условие больше, чем в самом коротком варианте.
 */
export function counterOffer(scenario: Scenario, state: NegotiationState, proposed: Deal, target: number): Deal | undefined {
  const open = scenario.issues.filter((i) => state.visibleIssues.includes(i.id))
  type Found = { deal: Deal; changes: number; user: number }
  const candidates: Found[] = []

  const walk = (k: number, deal: Deal, changes: number) => {
    if (k === open.length) {
      if (changes === 0) return
      if (surplus(scenario, deal, 'opponent') < target) return
      candidates.push({ deal: { ...deal }, changes, user: utility(scenario, deal, 'user') })
      return
    }
    const issue = open[k]
    for (const o of issue.options) {
      const changed = o.id !== proposed[issue.id] ? 1 : 0
      walk(k + 1, { ...deal, [issue.id]: o.id }, changes + changed)
    }
  }
  walk(0, { ...proposed }, 0)
  if (!candidates.length) return undefined

  const pick = (list: Found[]) =>
    list.reduce((a, b) => (b.changes < a.changes || (b.changes === a.changes && b.user > a.user) ? b : a))
  const shortest = pick(candidates)

  const givesBack = (d: Deal) =>
    open.some((i) => optionOf(i, d[i.id]).valueUser > optionOf(i, state.deal[i.id]).valueUser)
  const exchanges = candidates.filter((c) => c.changes <= shortest.changes + 1 && givesBack(c.deal))
  return (exchanges.length ? pick(exchanges) : shortest).deal
}

export function sameDeal(a: Deal, b: Deal): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}

export interface LlmTurnOutput {
  reply: string
  detectedActs: SpeechAct[]
  revealedInterests: string[]
  proposedDeal?: Partial<Deal>
  /** Условия, названные игроком словами, — сопоставлены моделью, проверяются здесь. */
  userOffer?: Partial<Deal>
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
  /** Встречное предложение, посчитанное движком вместе с вердиктом. */
  counter?: Deal
}

export interface ApplyTurnResult {
  state: NegotiationState
  /** Гипотеза, которую стоит ненавязчиво показать игроку на две секунды. */
  hint?: string
  /** Утверждение из досье, которое стоит оценить прямо сейчас. */
  hintProbe?: string
  verdict?: OfferVerdict
}

export function applyTurn(input: ApplyTurnInput): ApplyTurnResult {
  const { scenario, llm, userText, explicitOffer, factPlayed, hypothesisUpdate } = input
  const state = clone(input.state)
  const index = state.transcript.length

  // Вопрос в лоб актами SPIN не считается, как бы его ни разметила модель.
  const detectedActs = isDirectAsk(userText)
    ? (llm.detectedActs ?? []).filter((a) => !a.startsWith('spin_'))
    : (llm.detectedActs ?? [])

  // 1. Раскрытие интересов — только если речевой акт реально подходит.
  const newlyRevealed: string[] = []
  for (const id of llm.revealedInterests ?? []) {
    const interest = scenario.hiddenInterests.find((h) => h.id === id)
    if (!interest) continue
    if (state.revealedInterests.includes(id)) continue
    const unlocked = interest.unlockedBy.some((act) => detectedActs.includes(act))
    if (!unlocked) continue
    state.revealedInterests.push(id)
    newlyRevealed.push(id)
    if (interest.revealsIssue && !state.visibleIssues.includes(interest.revealsIssue)) {
      state.visibleIssues.push(interest.revealsIssue)
    }
  }

  // 2. Изменения сделки.
  //
  // В соглашение попадает ТОЛЬКО пакет, собранный игроком в шторке.
  // Предложение второй стороны живёт в её реплике, а документ меняется только
  // по соглашению обеих сторон.
  const incoming = explicitOffer ?? {}
  const dealChanges: Turn['dealChanges'] = []
  let verdict: OfferVerdict | undefined

  let offered: Turn['dealChanges'] = []
  if (Object.keys(incoming).length) {
    const proposed = sanitizeOffer(scenario, state, incoming)
    const evaluated = input.precomputedVerdict
      ? { verdict: input.precomputedVerdict, counter: input.counter }
      : evaluateOffer(scenario, state, proposed)
    verdict = evaluated.verdict

    for (const issue of scenario.issues) {
      const from = state.deal[issue.id]
      const to = proposed[issue.id]
      if (from !== to) offered.push({ issueId: issue.id, from, to })
    }

    // Условия фиксируются, только если оппонент согласился. Иначе это остаётся предложением.
    if (verdict === 'accept') {
      dealChanges.push(...offered)
      state.deal = proposed
      state.agreedAtRound = state.round
      state.status = allIssuesSettled(scenario, state) ? 'deal' : 'active'
      delete state.standingCounter
    } else if (evaluated.counter) {
      state.standingCounter = evaluated.counter
    } else {
      // Встречного не нашлось — прежнее тоже снимается, иначе на экране
      // осталось бы предложение, которое вторая сторона уже не повторила.
      delete state.standingCounter
    }
  }

  // 3. Дисциплина уступок считается кодом по направлению сдвига, а не со слов модели.
  //
  // Характер хода определяет сам пакет, даже если его не приняли: предложить
  // условие без встречного — это уже уступка по форме. Но в счётчики, по которым
  // считаются баллы, идёт только то, что попало в соглашение.
  const moveOf = (changes: Turn['dealChanges']) => {
    const concessions = changes.filter((c) => shiftDirection(issueById(scenario, c.issueId)!, c.from, c.to) === 'concession')
    const gains = changes.filter((c) => shiftDirection(issueById(scenario, c.issueId)!, c.from, c.to) === 'gain')
    if (concessions.length && !gains.length) return 'unilateral' as const
    if (concessions.length && gains.length) return 'conditional' as const
    return undefined
  }
  const acts = new Set<SpeechAct>(detectedActs)
  if (offered.length) {
    // Характер хода с пакетом определяет только код, метки модели снимаются.
    acts.delete('unilateral_concession')
    acts.delete('conditional_offer')
    acts.delete('positional_bargaining')
    const move = moveOf(offered)
    if (move === 'unilateral') acts.add('unilateral_concession')
    if (move === 'conditional') acts.add('conditional_offer')
  }
  const applied = moveOf(dealChanges)
  if (applied === 'unilateral') state.unilateralConcessions += 1
  if (applied === 'conditional') state.conditionalOffers += 1

  // 4. Настроение. Дельты от модели ограничены — она не управляет миром, только подталкивает.
  const d = llm.stateDelta ?? {}
  state.mood.trust = clampRange(state.mood.trust + clampDelta(d.trust), 0, 100)
  state.mood.irritation = clampRange(state.mood.irritation + clampDelta(d.irritation), 0, 100)
  state.mood.pressure = clampRange(state.mood.pressure + clampDelta(d.pressure), 0, 100)
  if (acts.has('personal_attack')) state.mood.irritation = clampRange(state.mood.irritation + 12, 0, 100)
  if (acts.has('active_listening')) state.mood.trust = clampRange(state.mood.trust + 4, 0, 100)
  state.mood.flexibility = clampRange(50 + (state.mood.trust - state.mood.irritation) / 2, 0, 100)

  if (factPlayed && !state.playedFacts.includes(factPlayed)) state.playedFacts.push(factPlayed)
  if (factPlayed) acts.add('objective_criterion')
  // Факт из досье без пакета — объективный критерий: метку уступки от модели снимаем.
  if (factPlayed && !offered.length) acts.delete('unilateral_concession')

  for (const h of hypothesisUpdate ?? []) {
    const probe = scenario.beliefProbes.find((p) => p.id === h.id)
    if (!probe) continue
    const existing = state.hypotheses.find((x) => x.id === h.id)
    if (existing) existing.confidence = clampRange(h.confidence, 0, 1)
    else state.hypotheses.push({ id: h.id, text: probe.text, confidence: clampRange(h.confidence, 0, 1) })
  }

  // Условия, названные словами без пакета. Модель лишь сопоставила их с
  // уровнями — здесь проверяется, что условие на столе, уровень существует и
  // он отличается от текущего. В соглашение это не идёт: только в подсказку
  // «соберите пакетом» с уже выбранными уровнями.
  let spokenOffer: Record<string, string> | undefined
  if (!Object.keys(incoming).length && llm.userOffer) {
    for (const [issueId, optionId] of Object.entries(llm.userOffer)) {
      const issue = issueById(scenario, issueId)
      if (!issue || !state.visibleIssues.includes(issueId)) continue
      if (typeof optionId !== 'string' || !issue.options.some((o) => o.id === optionId)) continue
      if (state.deal[issueId] === optionId) continue
      ;(spokenOffer ??= {})[issueId] = optionId
    }
  }

  // 5. Записываем оба хода.
  state.transcript.push({
    index, role: 'user', text: userText, acts: [...acts],
    dealChanges, revealed: newlyRevealed, factPlayed, verdict,
    ...(spokenOffer ? { spokenOffer } : {}),
    timestamp: Date.now(),
  })
  state.transcript.push({
    index: index + 1, role: 'opponent', text: llm.reply, acts: [],
    dealChanges: [], revealed: [], timestamp: Date.now(),
  })

  state.round += 1
  // Раунды кончились. Если пакет уже был согласован, это сделка по нему, а не
  // «соглашения нет»: договорённость не исчезает от того, что разговор шёл дальше.
  if (state.round > scenario.maxRounds && state.status === 'active') {
    state.status = state.agreedAtRound ? 'deal' : 'timeout'
  }

  const { hint, hintProbe } = hintFor(scenario, state, newlyRevealed[0])
  return { state, hint, hintProbe, verdict }
}

/**
 * Что показать игроку в момент раскрытия. Если у интереса есть утверждение из
 * досье и оно ещё не оценено — само утверждение: оценка ставится тут же.
 * Текст обязан быть текстом утверждения, а не вопроса-подсказки: часть
 * утверждений — ловушки, сформулированные наоборот, и «Похоже» на вопрос
 * записалось бы как «Похоже» на противоположное. Сами ловушки здесь не
 * показываются — только в досье.
 */
function hintFor(scenario: Scenario, state: NegotiationState, interestId?: string) {
  const interest = interestId ? scenario.hiddenInterests.find((h) => h.id === interestId) : undefined
  if (!interest) return { hint: undefined, hintProbe: undefined }
  // Ловушку в момент раскрытия не показываем: модель пересказывает раскрытие
  // своими словами, и ловушка может прочитаться как правда. Ловушки
  // оцениваются только в досье.
  const linked = interest.probe ? scenario.beliefProbes.find((p) => p.id === interest.probe) : undefined
  if (linked && !linked.truth) return { hint: undefined, hintProbe: undefined }
  const probe = interest.probe
    ? scenario.beliefProbes.find((p) => p.id === interest.probe && !state.hypotheses.some((h) => h.id === p.id))
    : undefined
  return { hint: probe?.text ?? interest.hypothesis, hintProbe: probe?.id }
}

/**
 * Проговорился — значит раскрыл.
 *
 * Модель может выдать секрет прозой, оставив `revealedInterests` пустым.
 * Детектор утечки это ловит, и проговорённое засчитывается раскрытым: иначе
 * реплика и документ расходятся, а разбор снимает баллы за то, что вторая
 * сторона уже сказала вслух.
 *
 * Состояние здесь уже после хода, поэтому законно раскрытое повторно не берётся.
 */
export function grantLeaked(
  scenario: Scenario,
  state: NegotiationState,
  leaks: { kind: 'interest' | 'issue'; id: string }[],
): { granted: string[]; hint?: string; hintProbe?: string } {
  if (!leaks.length) return { granted: [] }

  const lastUserTurn = [...state.transcript].reverse().find((t) => t.role === 'user')
  const granted: string[] = []

  for (const leak of leaks) {
    if (leak.kind === 'interest') {
      const interest = scenario.hiddenInterests.find((h) => h.id === leak.id)
      if (!interest || state.revealedInterests.includes(interest.id)) continue
      state.revealedInterests.push(interest.id)
      granted.push(interest.id)
      lastUserTurn?.revealed.push(interest.id)
      if (interest.revealsIssue && !state.visibleIssues.includes(interest.revealsIssue)) {
        state.visibleIssues.push(interest.revealsIssue)
      }
    } else if (!state.visibleIssues.includes(leak.id)) {
      // Условие, которое вторая сторона назвала сама, тоже оказывается на столе.
      if (scenario.issues.some((i) => i.id === leak.id)) state.visibleIssues.push(leak.id)
    }
  }

  return { granted, ...hintFor(scenario, state, granted[0]) }
}

/**
 * Игрок закончил партию сам, не выходя из переговоров (выход — отдельный
 * переговорный ход, см. walkAway).
 *
 * Правило исхода то же, что при исчерпании раундов: есть согласованный пакет —
 * это сделка по нему, нет — соглашения нет и итогом остаётся запасной вариант.
 */
export function endNow(state: NegotiationState): NegotiationState {
  const next = clone(state)
  next.status = next.agreedAtRound ? 'deal' : 'timeout'
  if (next.status === 'timeout') next.endedEarly = true
  return next
}

export function walkAway(state: NegotiationState): NegotiationState {
  const next = clone(state)
  next.status = 'walkaway'
  return next
}

/**
 * Насколько стол закрыт договорённостью: сделка собрана, когда со статус-кво
 * сдвинуты 60% открытых условий (и открыто не меньше трёх). Нужна и движку,
 * и экрану: после согласия игрок видит, сколько условий не хватает.
 */
export function settlement(scenario: Scenario, state: NegotiationState) {
  const visible = scenario.issues.filter((i) => state.visibleIssues.includes(i.id))
  const moved = visible.filter((i) => state.deal[i.id] !== i.defaultOptionId).length
  const needed = visible.length < 3 ? Infinity : Math.ceil(visible.length * 0.6)
  return { visible: visible.length, moved, needed, settled: moved >= needed }
}

function allIssuesSettled(scenario: Scenario, state: NegotiationState): boolean {
  return settlement(scenario, state).settled
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
