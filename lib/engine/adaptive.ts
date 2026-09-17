import type { RunRecord } from '@/lib/profile'
import type { SpeechAct } from '@/lib/types'

/**
 * Оппонент, который растёт вместе с игроком.
 *
 * В тренажёрах обычно прокачивают персонажа. Здесь наоборот: движок читает
 * профиль и делает оппонента жёстче именно в той точке, где игрок слаб.
 * Уступаете без встречного условия — он молча заберёт и попросит ещё.
 * Не задаёте вопросов — он не станет помогать. Выигрываете стабильно — он
 * садится за стол собранным.
 *
 * Это и «рост сложности», и «развитие персонажа» из §2.4 ТЗ, без единой
 * полоски опыта: в переговорах растёт не ваш уровень, а сложность людей,
 * с которыми вы садитесь за стол.
 */

export type AdaptationTarget = 'concessions' | 'shallow' | 'no_criteria' | 'overconfident' | 'strong_player'

export interface Adaptation {
  /** Насколько выше стартовое притязание оппонента. */
  aspiration: number
  /** Насколько выше та планка, ниже которой он не опустится к финалу. */
  floor: number
  /** Забирает голую уступку молча, не предлагая ничего в ответ. */
  exploitsConcessions: boolean
  targets: AdaptationTarget[]
  /** Одна фраза игроку: почему сегодня будет тяжелее. */
  note?: string
  /** Инструкция для модели — как ему себя вести. */
  instruction?: string
}

export const NO_ADAPTATION: Adaptation = {
  aspiration: 0,
  floor: 0,
  exploitsConcessions: false,
  targets: [],
}

const TARGETS: Record<AdaptationTarget, { note: string; instruction: string }> = {
  concessions: {
    note: 'вы часто уступали без встречного условия — он это запомнил',
    instruction:
      'Собеседник в прошлых переговорах регулярно уступал, не прося ничего взамен. Если он снова отдаёт условие даром — прими молча, поблагодарить можно, но встречного шага не предлагай, и сразу проверь, нельзя ли получить следующую уступку.',
  },
  shallow: {
    note: 'вы редко доходили до его настоящих интересов — он не станет помогать',
    instruction:
      'Собеседник обычно мало расспрашивает. Не помогай ему: на общие и слабые вопросы отвечай коротко и по поверхности, ничего не добавляя от себя.',
  },
  no_criteria: {
    note: 'вы почти не опирались на факты — он будет давить утверждениями',
    instruction:
      'Собеседник редко опирается на внешние данные. Спокойно утверждай выгодные тебе вещи как общеизвестные и требуй обоснований от него.',
  },
  overconfident: {
    note: 'вы были уверены там, где не проверяли — он этим воспользуется',
    instruction:
      'Собеседник склонен принимать твои слова на веру. Держись своей позиции увереннее обычного и не спеши раскрывать, где она слабая.',
  },
  strong_player: {
    note: 'вы выигрываете стабильно — он сел за стол собранным',
    instruction:
      'Перед тобой сильный переговорщик. Готовься к обмену, держи планку выше и не соглашайся на первое приличное предложение.',
  },
}

export function computeAdaptation(runs: RunRecord[]): Adaptation {
  const scored = runs.filter((r) => !r.training)
  if (scored.length < 2) return NO_ADAPTATION

  const n = scored.length
  const sum = (f: (r: RunRecord) => number) => scored.reduce((a, r) => a + f(r), 0)
  const act = (a: SpeechAct) => sum((r) => r.acts[a] ?? 0)

  const targets: AdaptationTarget[] = []
  let aspiration = 0
  let floor = 0
  let exploitsConcessions = false

  if (scored.filter((r) => r.unilateral > 0).length / n >= 0.5) {
    targets.push('concessions')
    exploitsConcessions = true
    aspiration += 2
    floor += 1
  }

  const revealRate = sum((r) => r.revealed) / Math.max(1, sum((r) => r.interests))
  if (revealRate < 0.5 || act('spin_implication') === 0) {
    targets.push('shallow')
    aspiration += 1.5
  }

  if (sum((r) => r.facts) / n < 1) {
    targets.push('no_criteria')
    aspiration += 1
  }

  const briers = scored.map((r) => r.brier).filter((b): b is number => b !== null)
  if (briers.length >= 2 && briers.reduce((a, b) => a + b, 0) / briers.length > 0.3) {
    targets.push('overconfident')
    aspiration += 1
  }

  // Сильного игрока встречает собранный оппонент — иначе расти некуда.
  if (sum((r) => r.total) / n > 70) {
    targets.push('strong_player')
    aspiration += 2
    floor += 1
  }

  if (!targets.length) return NO_ADAPTATION

  // Потолок: оппонент становится тяжелее, но не непроходимым.
  aspiration = Math.min(6, aspiration)
  floor = Math.min(3, floor)

  const lead = targets[0]
  return {
    aspiration,
    floor,
    exploitsConcessions,
    targets,
    note: TARGETS[lead].note,
    instruction: targets.map((t) => TARGETS[t].instruction).join(' '),
  }
}

/** Насколько тяжелее стало — для подписи в профиле. */
export function adaptationLevel(a: Adaptation): 'нет' | 'заметно' | 'ощутимо' | 'жёстко' {
  if (!a.targets.length) return 'нет'
  if (a.aspiration >= 5) return 'жёстко'
  if (a.aspiration >= 3) return 'ощутимо'
  return 'заметно'
}
