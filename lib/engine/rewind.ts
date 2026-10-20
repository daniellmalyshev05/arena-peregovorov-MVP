import type { HiddenInterest, NegotiationState, Scenario, SpeechAct, Turn } from '@/lib/types'
import { analyze } from './utility'
import { num } from '@/lib/text'

/**
 * Выбор моментов для переигрывания.
 *
 * Система сама находит два-три хода, где переговоры свернули не туда, и
 * объясняет почему. Остальные раунды доступны в разборе отдельным списком.
 *
 * Кандидатов не бывает ноль: в ровной партии тоже предлагается что проверить.
 */
export interface RewindCandidate {
  /** Индекс хода игрока в стенограмме: откат происходит в состояние ПЕРЕД ним. */
  turnIndex: number
  kind:
    | 'unilateral'
    | 'personal_attack'
    | 'bluff'
    | 'early_offer'
    | 'weak_package'
    | 'missed_interest'
    | 'refused_package'
    | 'walkaway'
    | 'turning_point'
  title: string
  why: string
}

/** Ход изменил соглашение уступкой без встречного условия — не предложил, а именно отдал. */
export const concededAt = (t: Turn) => t.acts.includes('unilateral_concession') && t.dealChanges.length > 0

export function rewindCandidates(scenario: Scenario, state: NegotiationState): RewindCandidate[] {
  const out: RewindCandidate[] = []
  const userTurns = state.transcript.filter((t) => t.role === 'user')
  const economy = analyze(scenario, state.deal)
  const taken = (index: number) => out.some((c) => c.turnIndex === index)
  const offerTurns = userTurns.filter((t) => t.verdict || t.dealChanges.length > 0)

  // 1. Уступка без встречного условия — самая дорогая и самая наглядная ошибка.
  const unilateral = userTurns.find(concededAt)
  if (unilateral) {
    out.push({
      turnIndex: unilateral.index,
      kind: 'unilateral',
      title: 'Уступка без встречного условия',
      why: 'Вы отдали условие и не попросили ничего взамен. Здесь ценность утекает быстрее всего.',
    })
  }

  // 1б. Переход на личность — отдельный момент, а не «можно было копнуть глубже».
  const attack = userTurns.find((t) => t.acts.includes('personal_attack') && !taken(t.index))
  if (attack) {
    out.push({
      turnIndex: attack.index,
      kind: 'personal_attack',
      title: 'Здесь разговор перешёл на личность',
      why: 'Выпад в адрес человека стоил доверия и ничего не дал по существу. Скажите то же самое о проблеме, а не о собеседнике.',
    })
  }

  // 1в. Блеф — тоже отдельный момент: метка под репликой уже называет его ошибкой.
  const bluff = userTurns.find((t) => t.acts.includes('bluff') && !taken(t.index))
  if (bluff) {
    out.push({
      turnIndex: bluff.index,
      kind: 'bluff',
      title: 'Здесь вы блефовали',
      why: 'Вы опёрлись на альтернативу, которой нет. Выдуманного запасного варианта вторая сторона не боится — сошлитесь на настоящий или на факт из досье.',
    })
  }

  // 2. Выход из переговоров — сам по себе решение, которое стоит проверить.
  // Точка отката — момент выхода: всё сказанное до него остаётся.
  if (state.status === 'walkaway') {
    out.push({
      turnIndex: state.transcript.length,
      kind: 'walkaway',
      title: 'Решение выйти из переговоров',
      why: 'Вернитесь в момент выхода и проверьте, что дал бы другой ход: вопрос, факт или пакет из уже открытых условий.',
    })
  }

  // 3. Пакет, который вторая сторона не приняла.
  const refused = offerTurns.find((t) => (t.verdict === 'reject' || t.verdict === 'counter') && !taken(t.index))
  if (refused) {
    out.push({
      turnIndex: refused.index,
      kind: 'refused_package',
      title: 'Пакет, который вторая сторона не приняла',
      why:
        refused.verdict === 'reject'
          ? 'Этот пакет оказался для неё хуже её запасного варианта. Здесь можно было предложить другой обмен.'
          : 'Вторая сторона ответила встречным предложением. Здесь можно было найти обмен, который устроил бы её сразу.',
    })
  }

  // 4. Предложение до выяснения интересов.
  const early = userTurns.find((t) => t.index <= 2 && (t.dealChanges.length > 0 || t.verdict))
  if (early && !taken(early.index)) {
    out.push({
      turnIndex: early.index,
      kind: 'early_offer',
      title: 'Предложение до выяснения интересов',
      why: 'Вы начали двигать условия раньше, чем поняли, чего вторая сторона хочет на самом деле.',
    })
  }

  // 5. Раскрытый, но неиспользованный интерес. Только если пакет вообще был:
  // иначе «в пакет не попало» говорится о пакете, которого не существует.
  const usedIssues = new Set(state.transcript.flatMap((t) => t.dealChanges.map((c) => c.issueId)))
  const idleInterest = scenario.hiddenInterests.find(
    (h) => state.revealedInterests.includes(h.id) && h.revealsIssue && !usedIssues.has(h.revealsIssue),
  )
  const lastOffer = [...offerTurns].reverse()[0]
  if (idleInterest && lastOffer && !taken(lastOffer.index)) {
    out.push({
      turnIndex: lastOffer.index,
      kind: 'weak_package',
      title: 'В пакет не попало то, что вы уже знали',
      why: `Вы выяснили: ${idleInterest.label.charAt(0).toLowerCase() + idleInterest.label.slice(1)} — но не превратили это в условие сделки.`,
    })
  }

  // 6. Интерес, который так и остался нераскрытым. Момент — реплика без находки
  // и без пакета: ход, раскрывший интерес, не может быть местом, где «не копнули».
  const missed = scenario.hiddenInterests.filter((h) => !state.revealedInterests.includes(h.id))
  const missedCount = missed.length
  if (missedCount && out.length < 3) {
    const quiet = userTurns.filter(
      (t) =>
        !t.revealed.length &&
        !t.verdict &&
        !t.dealChanges.length &&
        !t.acts.includes('personal_attack') &&
        !t.acts.includes('bluff') &&
        !taken(t.index),
    )
    const moment = quiet[Math.floor((quiet.length - 1) / 2)]
    if (moment) {
      const key = keyFor(missed, moment.acts)
      out.push({
        turnIndex: moment.index,
        kind: 'missed_interest',
        title: 'Здесь можно было копнуть глубже',
        why:
          missedCount === scenario.hiddenInterests.length
            ? `Ни один интерес второй стороны вы так и не нашли. Первый из них открывает ${key}.`
            : missedCount === 1
              ? `Один из интересов второй стороны вы так и не нашли. Его открывает ${key}.`
              : `Не найдено интересов второй стороны: ${missedCount} из ${scenario.hiddenInterests.length}. Хотя бы один из них открывает ${key}.`,
      })
    }
  }

  // 7. Ошибок нет, но ценность осталась на столе — улучшить финал.
  if (!out.length && economy.valueLeftOnTable > 3 && lastOffer) {
    out.push({
      turnIndex: lastOffer.index,
      kind: 'weak_package',
      title: 'Финальный пакет можно было собрать сильнее',
      why: `Существовал вариант, лучший для обеих сторон. Неиспользованной осталась ценность ${num(economy.valueLeftOnTable)}.`,
    })
  }

  // 8. Всегда есть что проверить. Хорошую партию тоже стоит переиграть — чтобы
  // увидеть, насколько результат держался на формулировке и на финальном пакете.
  const turning = userTurns.find((t) => t.revealed.length > 0 && !taken(t.index))
  if (out.length < 2 && turning) {
    out.push({
      turnIndex: turning.index,
      kind: 'turning_point',
      title: 'Ход, который решил исход',
      why: 'Проверьте, насколько результат держался на этой формулировке: скажите иначе и сравните две версии.',
    })
  }
  const closing = [...offerTurns].reverse().find((t) => t.verdict === 'accept' && !taken(t.index))
  if (out.length < 2 && closing) {
    out.push({
      turnIndex: closing.index,
      kind: 'turning_point',
      title: 'Пакет, который закрыл сделку',
      why: 'Проверьте, можно ли было взять больше, не потеряв согласия второй стороны.',
    })
  }

  return out.slice(0, 3).sort((a, b) => a.turnIndex - b.turnIndex)
}

/** Реплики вокруг момента — чтобы показать его в разборе без домысливания. */
export function momentContext(state: NegotiationState, turnIndex: number) {
  const turn = state.transcript.find((t) => t.index === turnIndex && t.role === 'user')
  const before = [...state.transcript]
    .filter((t) => t.index < turnIndex && t.role === 'opponent')
    .pop()
  const after = state.transcript.find((t) => t.index === turnIndex + 1)
  return { turn, before, after }
}

/** Какой ход открывает интерес — словами, без названий методик. */
const KEY_PHRASE: Partial<Record<SpeechAct, string>> = {
  spin_situation: 'вопрос о текущей ситуации',
  spin_problem: 'вопрос о том, что сейчас мешает',
  spin_implication: 'вопрос о последствиях',
  spin_needpayoff: 'вопрос о том, что даст решение',
  authority_check: 'вопрос о том, кто принимает решение',
  active_listening: 'пересказ услышанного своими словами',
  objective_criterion: 'довод с опорой на факт',
  conditional_offer: 'предложение обмена',
}

/**
 * Подсказка для нераскрытого интереса. Берётся тот интерес, который можно было
 * открыть не тем ходом, что сделан в этот момент: иначе совет противоречит
 * цитате под ним.
 */
function keyFor(missed: HiddenInterest[], madeActs: SpeechAct[]): string {
  const phrases = (h: HiddenInterest) =>
    h.unlockedBy.filter((a) => !madeActs.includes(a)).map((a) => KEY_PHRASE[a]).filter((p): p is string => !!p)
  const target = missed.find((h) => phrases(h).length) ?? missed[0]
  const list = phrases(target)
  const pick = list.length ? list : target.unlockedBy.map((a) => KEY_PHRASE[a]).filter((p): p is string => !!p)
  if (!pick.length) return 'точный вопрос по существу'
  const [first, second] = pick
  // «вопрос о том, что мешает, или…» — придаточное закрывается запятой.
  return second ? `${first}${first.includes(',') ? ',' : ''} или ${second}` : first
}
