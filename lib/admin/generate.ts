import type { Archetype, Scenario } from '@/lib/types'
import type { ChatMessage } from '@/lib/llm/openrouter'
import { retentionOffer } from '@/lib/scenarios/retention-offer'
import type { AuditReport } from '@/lib/engine/audit'
import { draftSchema, fromDraft, toDraft, UNLOCK_ACTS } from './draft'
import { balance } from './balance'
import { TONES } from './config'

/**
 * Генерация нового кейса по описанию администратора.
 *
 * Модель пишет историю: людей, предмет торга, уровни условий, скрытые
 * интересы, факты, реплики. Структуру чинит и проверяет код (draft.ts),
 * экономику выравнивает код (balance.ts), играбельность подтверждает тот
 * же аудит, что и у библиотеки. Не прошёл — модель получает список проблем
 * и пишет кейс заново.
 */

export interface Brief {
  sphere: string
  topic: string
  goal: string
  tone: Archetype
}

const ACT_HINTS: Record<(typeof UNLOCK_ACTS)[number], string> = {
  spin_situation: 'вопрос о текущем положении дел',
  spin_problem: 'вопрос о трудностях и проблемах',
  spin_implication: 'вопрос о последствиях проблемы',
  spin_needpayoff: 'вопрос о ценности решения для собеседника',
  active_listening: 'пересказ услышанного своими словами',
  objective_criterion: 'ссылка на рыночные данные, норматив, независимую оценку',
  conditional_offer: 'встречное предложение «если вы…, то мы…»',
  authority_check: 'вопрос о том, кто ещё принимает решение',
}

const LAYER_HINTS = {
  interest: 'настоящий интерес за публичной позицией',
  constraint: 'ограничение, которое связывает руки',
  fear: 'опасение, о котором не говорят вслух',
  resource: 'ресурс, который можно дёшево отдать',
}

function systemPrompt(): string {
  const example = JSON.stringify(toDraft(retentionOffer))
  return `Ты методист переговорных тренажёров. По описанию организатора ты пишешь учебный кейс для симулятора деловых переговоров. Игрок ведёт переговоры с одной второй стороной, которую потом сыграет языковая модель. Исход считает алгоритм по числам кейса, поэтому структура важнее красивых слов.

КАК УСТРОЕН КЕЙС
- issues — 5–6 условий сделки. У каждого 3–4 уровня: [название уровня, ценность для игрока 0–100, ценность для второй стороны 0–100]. Уровни — конкретные и проверяемые: проценты, сроки, суммы, объёмы, а не «хорошо/плохо».
- visible: true — у 1–2 условий, это предмет публичного спора, по ним интересы сторон противоположны. Остальные условия скрыты: игрок узнаёт о них, только раскрыв интересы второй стороны.
- start — номер уровня (с нуля), с которого начинается разговор. Для открытых условий это стартовая позиция второй стороны, для скрытых — как обстоят дела, пока их никто не обсуждал.
- wUser и wOpp — насколько условие важно каждой стороне, в сумме по сторонам по единице. Приоритеты сторон обязаны различаться: среди скрытых условий должно быть хотя бы одно, которое игроку отдать дёшево, а второй стороне получить дорого, — на этом строится обмен.
- userBatna и opponentBatna — что каждая сторона сделает, если не договорится, словами (label) и примерной ценностью 0–100 (value). Числа потом выверит алгоритм.
- interests — 4 скрытых интереса второй стороны, по одному на слой: interest (${LAYER_HINTS.interest}), constraint (${LAYER_HINTS.constraint}), fear (${LAYER_HINTS.fear}), resource (${LAYER_HINTS.resource}). У каждого: layer — слой; label — как это звучит в разборе, без названия слоя в начале; hypothesis — догадка игрока вопросом; acts — 1–2 приёма, которыми интерес раскрывается; line — как вторая сторона это произносит, 1–2 предложения; reveals — id скрытого условия, которое после этого появляется на столе (у разных интересов — разные условия); belief — номер утверждения из beliefs (с единицы), которое проверяется этим раскрытием.
- Приёмы для acts: ${UNLOCK_ACTS.map((a) => `${a} — ${ACT_HINTS[a]}`).join('; ')}.
- facts — 3–4 объективных критерия: рыночные данные, нормативы, альтернативы, история отношений. against — id условий, по которым факт работает.
- beliefs — 5 утверждений о второй стороне для досье игрока: примерно половина верна, остальные — правдоподобные ловушки. reality — короткое пояснение, без весов и чисел ценности.
- fallback — запасные реплики второй стороны по ситуациям, по одному-два предложения. Их произносит вторая сторона от своего лица: pressure — её ответ на давление игрока, concession — как она принимает уступку игрока, не отвечая своей.
- openers — 3 вопроса, которыми игроку удобно начать. Они не называют скрытых условий и интересов.
- persona — имя и фамилия, должность, тип организации (без реальных брендов), манера речи 2–3 предложения, публичная позиция, первая реплика.

ПРАВИЛА
- Пиши по-русски, живым деловым языком, без канцелярита и без английских слов.
- Никаких реальных компаний, брендов и людей. Особая экономическая зона называется только «ОЭЗ».
- Пол имени, местоимений и согласований второй стороны везде один.
- Числа в репликах и фактах не противоречат уровням условий.
- Ответ — только JSON в точности такого формата, без пояснений и без markdown.

ОБРАЗЕЦ ФОРМАТА (другой кейс — не копируй его содержание):
${example}`
}

function userPrompt(brief: Brief, problems?: string[]): string {
  const tone = TONES.find((t) => t.value === brief.tone)
  const lines = [
    `Сфера: ${brief.sphere || 'не указана'}`,
    `Тема переговоров: ${brief.topic || 'не указана'}`,
    `Чего добивается вторая сторона: ${brief.goal || 'не указано'}`,
    `Характер второй стороны: ${tone ? `${tone.label.toLowerCase()} — ${tone.hint.toLowerCase()}` : 'на твоё усмотрение'}`,
  ]
  const retry = problems?.length
    ? `\n\nПрошлая версия кейса не прошла проверку алгоритма:\n${problems.map((p) => `- ${p}`).join('\n')}\nНапиши кейс заново так, чтобы этих проблем не было.`
    : ''
  return `Напиши кейс по описанию организатора.\n${lines.join('\n')}${retry}`
}

export function generationMessages(brief: Brief, problems?: string[]): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userPrompt(brief, problems) },
  ]
}

export interface GenerationResult {
  scenario?: Scenario
  audit?: AuditReport
  repairs: string[]
  problems: string[]
}

/** Ответ модели → проверенный и выверенный кейс или список причин, почему нет. */
export function buildCase(raw: string, brief: Brief, id: string): GenerationResult {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  let data: unknown
  try {
    data = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return { repairs: [], problems: ['Ответ модели не разобрать как JSON: вероятно, он оборвался.'] }
  }

  const parsed = draftSchema.safeParse(data)
  if (!parsed.success) {
    const problems = parsed.error.issues
      .slice(0, 6)
      .map((i) => `Поле ${i.path.join('.') || 'кейс'}: ${i.message}`)
    return { repairs: [], problems }
  }

  const { scenario: assembled, repairs } = fromDraft(parsed.data, brief.tone, id)
  const balanced = balance(assembled)
  return {
    scenario: balanced.problems.length ? undefined : balanced.scenario,
    audit: balanced.audit,
    repairs: [...repairs, ...balanced.repairs],
    problems: balanced.problems,
  }
}
