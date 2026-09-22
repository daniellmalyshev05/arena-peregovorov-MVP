import type { Deal, NegotiationState, Scenario, SpeechAct } from '@/lib/types'
import { decapitalize } from '@/lib/text'
import type { OfferVerdict } from '@/lib/engine/state'
import type { LlmTurn } from './schema'

/**
 * Детерминированный оппонент на правилах.
 *
 * Нужен для трёх вещей:
 *   1. разработка интерфейса без обращений к API;
 *   2. страховка на защите, если сеть или провайдер откажут;
 *   3. фолбэк, когда модель вернула невалидный JSON дважды.
 *
 * Он заметно проще живой модели, но никогда не падает и не ломает правила мира.
 */

const has = (t: string, ...w: string[]) => w.some((x) => t.includes(x))

/**
 * Распознавание речевых актов.
 *
 * Матчинг устроен двумя приёмами, и оба нужны:
 *   1. основы слов вместо целых форм — «произойдёт», «произойти» и «произойдут»
 *      должны попадать в один акт;
 *   2. совстречаемость двух слов вместо одной фразы — «кто подписывает» и
 *      «кто у вас подписывает» это один и тот же вопрос, а подстрока ловит
 *      только первый.
 *
 * Замер на канонических вопросах из протокола: было 13 распознанных из 22,
 * стало 22 из 22. Это качество запасного движка, а не украшение: на его
 * разметке он выбирает реплику, и промахи читаются как ответ невпопад.
 */
export function detectActs(text: string): SpeechAct[] {
  const t = text.toLowerCase().replace(/ё/g, 'е')
  const acts: SpeechAct[] = []

  // Вопрос по сути, а не по знаку: «Расскажите, как у вас с графиком» —
  // это вопрос, просто вежливо оформленный просьбой.
  const isQuestion =
    t.includes('?') || has(t, 'расскаж', 'опишите', 'объясните', 'поясните', 'поделитесь')

  /** Оба слова встретились где-то в реплике, не обязательно подряд. */
  const both = (a: string[], b: string[]) => has(t, ...a) && has(t, ...b)

  if (isQuestion && (
    has(t, 'произой', 'что это значит', 'чем обернет', 'чем это обернет', 'приведет', 'обойдет',
      'последств', 'если сдвин', 'если не успе', 'риску', 'сорвет', 'что будет', 'во что это',
      'чем это грозит', 'что тогда') ||
    both(['если'], ['позже', 'задерж', 'сдвин', 'опозда', 'не успе', 'сорвет', 'уменьш', 'сократ'])
  )) {
    acts.push('spin_implication')
  }

  if (isQuestion && has(t, 'мешает', 'сложност', 'трудност', 'проблем', 'риск', 'не устраивает',
    'столкнул', 'недобрал', 'буксует', 'болев', 'узкое место', 'что не так', 'что вам не')) {
    acts.push('spin_problem')
  }

  if (isQuestion && (
    has(t, 'как сейчас', 'как устро', 'как проход', 'как обстоя', 'как у вас', 'как было',
      'какой график', 'какие сроки', 'что у вас с', 'расскаж', 'опишите', 'сколько') ||
    both(['как'], ['устроен', 'обстоя', 'проход', 'было с', 'идет'])
  )) {
    acts.push('spin_situation')
  }

  if (isQuestion && (
    has(t, 'насколько важно', 'что если бы', 'помогло бы', 'ценно', 'решило бы', 'закрыло бы',
      'снимет ли', 'устроит ли', 'чем защит', 'что должно быть') ||
    both(['что бы'], ['дал', 'дало', 'дала', 'дали']) ||
    both(['чтобы вам'], ['было', 'стало', 'хватило'])
  )) {
    acts.push('spin_needpayoff')
  }

  // «Кто подписывает» и «кто у вас подписывает» — один вопрос.
  if (
    has(t, 'совет директоров', 'полномоч', 'от кого зависит', 'наблюдательн') ||
    both(['кто', 'с кем'], ['принима', 'утвержда', 'подписыва', 'решает', 'согласова', 'визиру'])
  ) {
    acts.push('authority_check')
  }

  if (has(t, 'правильно ли я пон', 'то есть вы', 'если я вас верно', 'вы говорите, что',
    'услышал', 'верно ли, что', 'иными словами', 'правильно понимаю')) {
    acts.push('active_listening')
  }

  if (has(t, 'если мы', 'взамен', 'при условии', 'в обмен', 'тогда вы', 'готовы, если',
    'при том что', 'в ответ', 'в этом случае мы')) {
    acts.push('conditional_offer')
  }

  if (has(t, 'по рынку', 'в среднем', 'статистик', 'индекс', 'данные', 'практика показ',
    'регламент', 'норматив', 'по отрасли', 'по нормативу')) {
    acts.push('objective_criterion')
  }

  if (has(t, 'некомпетент', 'вы не понимаете', 'бред', 'смешно', 'несерьезно', 'обманыва', 'блефует')) {
    acts.push('personal_attack')
  }

  if (has(t, 'последнее предложение', 'иначе мы уходим', 'больше не могу', 'на этом закончим')) {
    acts.push('walkaway_signal')
  }

  // Вопрос без распознанного типа НЕ считается исследованием: иначе любое
  // «какой у вас бюджет?» открывало скрытый интерес, который игрок не заслужил.
  // И короткое «ладно, понятно» — это не позиционный торг, а пустая реплика:
  // торгом считается только разговор о цифрах или развёрнутая позиция.
  if (!acts.length && !isQuestion) {
    const haggling = has(t, 'цен', 'скидк', 'процент', 'дешевл', 'дорож', 'уступ', 'снизи', 'подвин', '%')
      || /\d/.test(t)
    if (haggling || t.split(/\s+/).length >= 8) acts.push('positional_bargaining')
  }
  return acts.slice(0, 3)
}

/** Встречное предложение словами второй стороны: только то, что отличается от пакета игрока. */
function speakCounter(scenario: Scenario, offered: Deal, counter: Deal): string {
  const parts = scenario.issues
    .filter((i) => offered[i.id] !== counter[i.id])
    .map((i) => `${decapitalize(i.label)} — ${i.options.find((o) => o.id === counter[i.id])?.label ?? ''}`)
  return parts.length ? `Могу предложить так: ${parts.join(', ')}.` : ''
}

/** Похоже ли это вообще на осмысленную реплику. */
function isGibberish(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length < 4) return true
  const words = t.split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return true
  // Слово без единой гласной почти наверняка набрано наугад.
  const vowelless = words.filter((w) => !/[аеёиоуыэюяaeiouy]/.test(w))
  return vowelless.length / words.length > 0.5
}

/** Однокоренные слова из подписи условия — чтобы поймать, о чём именно спросили. */
function issueStems(label: string, extra: string[]): string[] {
  return [label, ...extra]
    .join(' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^а-яa-z0-9]+/)
    .filter((w) => w.length >= 5)
    .map((w) => w.slice(0, 6))
}

/** О каком условии идёт речь в реплике игрока. */
function matchIssue(scenario: Scenario, state: NegotiationState, text: string) {
  const t = text.toLowerCase().replace(/ё/g, 'е')
  for (const issue of scenario.issues) {
    if (!state.visibleIssues.includes(issue.id)) continue
    const stems = issueStems(issue.label, [issue.hint ?? '', ...issue.options.map((o) => o.label)])
    if (stems.some((st) => t.includes(st))) return issue
  }
  return undefined
}

/**
 * Ответ запасного движка.
 *
 * Порядок важен: сначала то, что сказал игрок по существу, и только потом —
 * общая реплика. Раньше выбор шёл по номеру раунда, и оппонент отвечал невпопад
 * даже когда в сценарии была ровно подходящая фраза.
 */
export function offlineTurn(
  scenario: Scenario,
  state: NegotiationState,
  userText: string,
  verdict?: OfferVerdict,
  factPlayed?: string,
  /** Встречное предложение, посчитанное движком: запасной движок называет его, а не общую фразу. */
  counter?: { offered: Deal; counter: Deal },
): LlmTurn {
  const fb = scenario.fallbackLines
  const lastOpponentLine = [...state.transcript].reverse().find((t) => t.role === 'opponent')?.text

  if (!verdict && isGibberish(userText)) {
    return {
      reply: 'Простите, я не понял. Сформулируйте, пожалуйста, что именно вы предлагаете обсудить.',
      detectedActs: [], revealedInterests: [], stateDelta: { irritation: 2 },
    }
  }

  const acts = detectActs(userText)
  const stateDelta = {
    trust: acts.includes('active_listening') ? 5 : acts.some((a) => a.startsWith('spin_')) ? 3 : 0,
    irritation: acts.includes('personal_attack') ? 8 : acts.includes('positional_bargaining') ? 2 : -1,
    pressure: acts.includes('walkaway_signal') ? 5 : 0,
  }
  const out = (reply: string, extra: Partial<LlmTurn> = {}): LlmTurn => ({
    reply, detectedActs: acts, revealedInterests: [], stateDelta, ...extra,
  })

  // 1. Решение по пакету — важнее всего остального.
  const counterLine = counter ? ' ' + speakCounter(scenario, counter.offered, counter.counter) : ''
  if (verdict === 'accept') return out(fb.accept)
  if (verdict === 'reject') return out(fb.reject + counterLine, { stateDelta: { ...stateDelta, irritation: (stateDelta.irritation ?? 0) + 3 } })
  if (verdict === 'counter') return out(fb.counter + counterLine)

  // 2. Игрок задал вопрос, который открывает интерес.
  const candidate = scenario.hiddenInterests.find(
    (h) => !state.revealedInterests.includes(h.id) && h.unlockedBy.some((a) => acts.includes(a)),
  )
  if (candidate) {
    return out(candidate.revealLine, {
      revealedInterests: [candidate.id],
      stateDelta: { ...stateDelta, trust: (stateDelta.trust ?? 0) + 3 },
    })
  }

  // 3. Игрок выложил на стол факт — нельзя делать вид, что его не было.
  if (factPlayed && scenario.facts.some((f) => f.id === factPlayed)) {
    return out('Цифра понятная, спорить с ней не буду. Но одна цифра всей картины не меняет — что с остальными условиями?')
  }

  if (acts.includes('personal_attack')) {
    return out(fb.pressure, { stateDelta: { ...stateDelta, irritation: (stateDelta.irritation ?? 0) + 4 } })
  }

  // 4. Разговор о конкретном условии — отвечаем про него, а не про погоду.
  const issue = matchIssue(scenario, state, userText)
  if (issue) {
    const current = issue.options.find((o) => o.id === state.deal[issue.id])?.label ?? ''
    const variants = [
      `${issue.label} — сейчас это ${current}. Что вы предлагаете взамен?`,
      `Давайте про это условие. ${issue.label}: ${current}. Просто так я это не подвину.`,
      `${issue.label} обсуждать готов, но не в одиночку. Что с вашей стороны?`,
    ]
    const pick = variants[state.transcript.length % variants.length]
    if (pick !== lastOpponentLine) return out(pick)
  }

  // 5. Ситуационная реплика из сценария.
  let situation: keyof typeof fb = 'neutral'
  if (acts.includes('walkaway_signal') || acts.includes('bluff')) situation = 'pressure'
  else if (acts.includes('conditional_offer')) situation = 'exchange'
  else if (acts.includes('unilateral_concession')) situation = 'concession'
  else if (acts.includes('positional_bargaining')) situation = 'pressure'
  else if (!acts.length || userText.trim().split(/\s+/).length < 5) situation = 'vague'

  const line = fb[situation]
  return out(line === lastOpponentLine ? fb.neutral : line)
}
