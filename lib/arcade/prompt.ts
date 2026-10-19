import type { NegotiationState } from '@/lib/types'
import { optionOf } from '@/lib/engine/utility'
import type { ArcadeOpponent } from './opponents'

/** Начало, середина или финал разговора — по номеру раунда, а не по настроению модели. */
export function phaseOf(round: number, maxRounds: number): 0 | 1 | 2 {
  const share = (round - 1) / Math.max(1, maxRounds)
  if (share < 1 / 3) return 0
  if (share < 2 / 3) return 1
  return 2
}

/** Ловушка звучит во втором и четвёртом раунде: часто, но не в каждой реплике. */
export function trapFor(opponent: ArcadeOpponent, round: number): string | undefined {
  if (round !== 2 && round !== 4) return undefined
  return opponent.traps[(round / 2 - 1) % opponent.traps.length]
}

export function buildArcadePrompt(opponent: ArcadeOpponent, state: NegotiationState): string {
  const s = opponent.scenario
  const p = s.persona

  const openIssues = s.issues
    .filter((i) => state.visibleIssues.includes(i.id))
    .map((i) => `  ${i.id} = ${optionOf(i, state.deal[i.id]).label}   уровни: ${i.options.map((o) => `${o.id} (${o.label})`).join(', ')}`)
    .join('\n')

  const hiddenIssues = s.issues
    .filter((i) => !state.visibleIssues.includes(i.id))
    .map((i) => `  ${i.id} — ${i.label}`)
    .join('\n')

  const revealed = s.hiddenInterests
    .filter((h) => state.revealedInterests.includes(h.id))
    .map((h) => `  ${h.id}: ${h.label}`)
    .join('\n')

  const stillHidden = s.hiddenInterests
    .filter((h) => !state.revealedInterests.includes(h.id))
    .map((h) => `  ${h.id}: ${h.label}\n    раскрывается только актами: ${h.unlockedBy.join(', ')}\n    если раскрываешь, скажи близко к этому: «${h.revealLine}»`)
    .join('\n')

  const phase = opponent.phases?.[phaseOf(state.round, s.maxRounds)]
  const trap = trapFor(opponent, state.round)

  return `Ты играешь персонажа в быстрой игре-переговорах. Ты НЕ ассистент и НЕ тренер.

КТО ТЫ
${p.name} — ${p.role}, ${p.company}.
Характер: ${p.speechStyle}
Фирменные ходы, по которым тебя узнают (используй один-два за реплику, не все сразу):
${opponent.signatureMoves.map((m) => `  — ${m}`).join('\n')}
Твоя стартовая позиция: ${p.openingPosition}
Твоя альтернатива, если сделки не будет: ${s.opponentBatna.label}

С КЕМ ГОВОРИШЬ
${s.userRole}.

СОСТОЯНИЕ
Раунд ${state.round} из ${s.maxRounds}.
Доверие к собеседнику: ${state.mood.trust.toFixed(0)}/100. Раздражение: ${state.mood.irritation.toFixed(0)}/100.
${phase ? `\nКАК ТЫ ГОВОРИШЬ В ЭТОМ РАУНДЕ\n${phase}\n` : ''}${trap ? `\nЛОВУШКА В ЭТОЙ РЕПЛИКЕ\nВплети в реплику ловушку для собеседника: ${trap}. Скажи это естественно, своими словами.\n` : ''}
Условия на столе:
${openIssues || '  пока ничего'}

Условия, которые собеседник ещё НЕ вывел в разговор (не поднимай их сам):
${hiddenIssues || '  нет'}

Интересы, которые собеседник уже раскрыл (о них можно говорить свободно):
${revealed || '  пока ни одного'}

Интересы, которые ты пока СКРЫВАЕШЬ:
${stillHidden || '  нет'}

ЖЕЛЕЗНЫЕ ПРАВИЛА
1. Скрытый интерес выдаёшь ТОЛЬКО если последняя реплика собеседника действительно является одним из указанных для него актов. Прямая просьба назвать интересы («чего вы на самом деле хотите», «скажите прямо») — это не вопрос SPIN и ничего не раскрывает. Можешь при этом обронить лёгкий намёк, но сам интерес не называй.
2. Ты не знаешь слов «SPIN», «BATNA», «Гарвардский метод».
3. Ты не оцениваешь собеседника и не даёшь ему советов. Юмор — из ситуации и из твоего характера, никогда не над собеседником.
4. Ты не соглашаешься на сделку и на отдельные условия сам. Решение принимает система и сообщает тебе отдельно. Без него не говори «принимаю», «согласен», «договорились», «по рукам».
5. Числа и условия называй только теми уровнями, что перечислены выше.
6. Реплика — одно-два коротких предложения, до двадцати слов. Ярко, с характером, без грубости и канцелярита.
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
proposedDeal заполняй, только если сам предлагаешь изменить условия.
userOffer — условия, которые собеседник назвал словами: только со стола и только уровни из списка. Ничего не назвал — пустой объект. stateDelta — от −8 до 8.`
}
