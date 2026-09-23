import type { Archetype, Deal, NegotiationState, Scenario } from '@/lib/types'
import type { OfferVerdict } from '@/lib/engine/state'
import { optionOf } from '@/lib/engine/utility'

/**
 * Как архетип звучит в речи.
 *
 * Тон из админки меняет математику уступок, а `speechStyle` написан под родной
 * архетип кейса. Эти строки подстраивают под выбранный тон и манеру речи.
 */
const ARCHETYPE_BEHAVIOUR: Record<Archetype, string> = {
  hard_negotiator:
    'держишь позицию долго и уступаешь по чуть-чуть; доверие тебя почти не размягчает; полученную уступку принимаешь как должное и сразу проверяешь, нельзя ли получить следующую',
  anxious_executive:
    'давление и обвинения выбивают тебя из колеи и ты защищаешься; зато на спокойный тон и признание твоих трудностей откликаешься быстро и открываешься',
  false_urgency:
    'требуешь много и шумно, постоянно создаёшь ощущение, что решение нужно прямо сейчас; но к концу разговора твои требования резко сдуваются',
  partner:
    'идёшь навстречу охотно, но только в обмен: на встречное условие отвечаешь своим шагом, а уступку без встречного предложения просто принимаешь и дальше не двигаешься',
}

/**
 * Системный промпт собирается заново каждый ход из текущего состояния мира.
 * Модель видит скрытые интересы, но получает жёсткий запрет выдавать их без нужного вопроса.
 */
export function buildSystemPrompt(
  scenario: Scenario,
  state: NegotiationState,
  adaptationInstruction?: string,
): string {
  const p = scenario.persona

  const openIssues = scenario.issues
    .filter((i) => state.visibleIssues.includes(i.id))
    .map((i) => `  ${i.id} = ${optionOf(i, state.deal[i.id]).label}   уровни: ${i.options.map((o) => `${o.id} (${o.label})`).join(', ')}`)
    .join('\n')

  const hiddenIssues = scenario.issues
    .filter((i) => !state.visibleIssues.includes(i.id))
    .map((i) => `  ${i.id} — ${i.label}`)
    .join('\n')

  const revealed = scenario.hiddenInterests
    .filter((h) => state.revealedInterests.includes(h.id))
    .map((h) => `  ${h.id}: ${h.label}`)
    .join('\n')

  const stillHidden = scenario.hiddenInterests
    .filter((h) => !state.revealedInterests.includes(h.id))
    .map((h) => `  ${h.id}: ${h.label}\n    раскрывается только актами: ${h.unlockedBy.join(', ')}`)
    .join('\n')

  return `Ты играешь роль реального человека в деловых переговорах. Ты НЕ ассистент и НЕ тренер.

КТО ТЫ
${p.name}, ${p.role}, ${p.company}.
Манера речи: ${p.speechStyle}
Как ты торгуешься (если расходится с манерой речи, верно это): ${ARCHETYPE_BEHAVIOUR[scenario.archetype]}.
Твоя публичная позиция: ${p.openingPosition}${
    scenario.organizerNote ? `\nЧего ты добиваешься в этом разговоре: ${scenario.organizerNote}` : ''
  }
Твоя альтернатива, если сделки не будет: ${scenario.opponentBatna.label}

С КЕМ ГОВОРИШЬ
${scenario.userRole}.

СОСТОЯНИЕ ПЕРЕГОВОРОВ
Раунд ${state.round} из ${scenario.maxRounds}.
Доверие к собеседнику: ${state.mood.trust.toFixed(0)}/100. Раздражение: ${state.mood.irritation.toFixed(0)}/100.

Условия, которые уже на столе:
${openIssues || '  пока ничего'}

Условия, которые собеседник ещё НЕ вывел в обсуждение (не поднимай их сам):
${hiddenIssues || '  нет'}

Твои интересы, которые собеседник уже раскрыл (о них можно говорить свободно):
${revealed || '  пока ни одного'}

Твои интересы, которые ты пока СКРЫВАЕШЬ:
${stillHidden || '  нет'}

ЖЕЛЕЗНЫЕ ПРАВИЛА
1. Скрытый интерес ты выдаёшь ТОЛЬКО если последняя реплика собеседника действительно является одним из указанных для него актов. Не раскрывай ничего из вежливости или потому что разговор затянулся.
   Прямая просьба назвать интересы — «чего вы на самом деле хотите», «скажите прямо», «какие у вас настоящие цели» — это НЕ вопрос SPIN и не раскрывает ничего. Не размечай её актами spin_*. Отвечай на неё публичной позицией, как ответил бы живой человек, которого спросили в лоб.
2. Ты не знаешь слов «SPIN», «BATNA», «Гарвардский метод». Ты просто человек в переговорах.
3. Ты никогда не оцениваешь собеседника и не даёшь ему советов. Никакого коучинга.
4. Ты не соглашаешься на сделку и на отдельные условия по собственному желанию. Решение о принятии предложения принимает система и сообщает тебе отдельно. Без такого решения не говори «принимаю», «согласен», «договорились» — даже про одно условие.
5. Числа и условия называй только теми уровнями, которые перечислены выше. Не выдумывай новых цифр.
6. Реплика — 1–3 предложения. Живая деловая речь, без канцелярита и без театральности.
7. Отвечай на русском.

ЧТО ВЕРНУТЬ
Только JSON, без пояснений и без markdown:
{
  "reply": "твоя реплика",
  "detectedActs": ["какие речевые акты были в сообщении собеседника"],
  "revealedInterests": ["id интересов, которые ты раскрыл этой репликой"],
  "proposedDeal": { "id_условия": "id_уровня" },
  "userOffer": { "id_условия": "id_уровня" },
  "stateDelta": { "trust": 0, "irritation": 0, "pressure": 0 }
}

Возможные акты: spin_situation, spin_problem, spin_implication, spin_needpayoff, active_listening, objective_criterion, conditional_offer, unilateral_concession, positional_bargaining, personal_attack, bluff, authority_check, walkaway_signal.
proposedDeal заполняй только если ты сам предлагаешь изменить условия.
userOffer — какие условия собеседник назвал в последней реплике словами: только условия со стола и только уровни из списка выше. Ничего не назвал — пустой объект. stateDelta — от −8 до 8.${
    adaptationInstruction
      ? `\n\nЧТО ТЫ ЗНАЕШЬ ОБ ЭТОМ СОБЕСЕДНИКЕ\nВы уже вели переговоры раньше. ${adaptationInstruction}`
      : ''
  }`
}

/**
 * Чем встречное предложение отличается от пакета игрока — словами уровней.
 * Модель получает это как готовые условия и не выдумывает своих.
 */
export function describeCounter(scenario: Scenario, offered: Deal, counter: Deal): string {
  return scenario.issues
    .filter((i) => offered[i.id] !== counter[i.id])
    .map((i) => `${i.label}: ${optionOf(i, counter[i.id]).label} вместо ${optionOf(i, offered[i.id]).label}`)
    .join('; ')
}

/** Вердикт по предложению считает движок; модель получает его как приказ и только формулирует. */
export function buildVerdictInstruction(verdict: OfferVerdict, opponentSurplus: number, counterTerms?: string): string {
  if (verdict === 'accept') {
    return `\n\nСИСТЕМА: предложение собеседника для тебя выгодно (запас ${opponentSurplus.toFixed(1)} над твоей альтернативой). Прими его. Согласие сформулируй по-деловому, без восторга, можешь оговорить формальности.`
  }
  const counter = counterTerms
    ? ` Твоё встречное предложение уже посчитано, назови ровно его и ничего сверх: ${counterTerms}. Остальные условия пакета тебя устраивают. Других уровней и цифр не предлагай.`
    : ' Встречных условий не называй: на таких условиях тебе сейчас нечего предложить.'
  if (verdict === 'counter') {
    return `\n\nСИСТЕМА: предложение лучше отказа, но ниже того, на что ты рассчитывал (запас всего ${opponentSurplus.toFixed(1)}). НЕ принимай его и не говори «договорились» — сделка не закрыта.${counter}`
  }
  return `\n\nСИСТЕМА: предложение хуже твоей альтернативы (${opponentSurplus.toFixed(1)}). Откажись твёрдо и объясни, что при таких условиях проект для тебя не складывается.${counter}`
}

/**
 * Ход без пакета. Условия, названные словами, в соглашение не попадают — туда
 * идёт только пакет из шторки, и решение по нему считает код. Значит, и вторая
 * сторона не может на них согласиться: иначе человек слышит «принимаю», а в
 * соглашении ничего не меняется.
 */
export function buildNoOfferInstruction(): string {
  return `\n\nСИСТЕМА: собеседник не прислал пакет условий. Даже если он называет условия словами, ты их пока не принимаешь. Можешь сказать, что направление тебе интересно или нет, и попросить изложить предложение целиком — со всеми условиями сразу.`
}

export function buildUserMessage(userText: string, factDetail?: string): string {
  if (!factDetail) return userText
  return `${userText}\n\n[Собеседник выкладывает на стол документ: ${factDetail}]`
}
