import type { SpeechAct } from '@/lib/types'

/**
 * Методики из ТЗ — Гарвардский метод, SPIN, BATNA — в словах интерфейса.
 *
 * Одна таблица для ленты разговора и разбора: как называется ход игрока
 * и к какой методике он относится.
 */

export type Method = 'SPIN' | 'Гарвардский метод' | 'BATNA'

export interface ActInfo {
  label: string
  method?: Method
  /** Хороший приём, ошибка или нейтральный ход — от этого цвет метки. */
  tone: 'good' | 'bad' | 'neutral'
}

export const ACT_INFO: Record<SpeechAct, ActInfo> = {
  spin_situation: { label: 'ситуационный вопрос', method: 'SPIN', tone: 'good' },
  spin_problem: { label: 'проблемный вопрос', method: 'SPIN', tone: 'good' },
  spin_implication: { label: 'извлекающий вопрос', method: 'SPIN', tone: 'good' },
  spin_needpayoff: { label: 'направляющий вопрос', method: 'SPIN', tone: 'good' },
  active_listening: { label: 'активное слушание', tone: 'good' },
  objective_criterion: { label: 'объективный критерий', method: 'Гарвардский метод', tone: 'good' },
  conditional_offer: { label: 'условный обмен', method: 'Гарвардский метод', tone: 'good' },
  unilateral_concession: { label: 'уступка без встречного условия', tone: 'bad' },
  positional_bargaining: { label: 'позиционный торг', method: 'Гарвардский метод', tone: 'bad' },
  personal_attack: { label: 'давление на человека', method: 'Гарвардский метод', tone: 'bad' },
  // Блеф — выдуманная альтернатива, ошибка по BATNA: опора на запасной
  // вариант, которого нет.
  bluff: { label: 'блеф вместо настоящей альтернативы', method: 'BATNA', tone: 'bad' },
  authority_check: { label: 'проверка полномочий', tone: 'neutral' },
  // Сигнал о выходе бывает и опорой на запасной вариант, и блефом-угрозой — хвалить его вслепую нельзя.
  walkaway_signal: { label: 'опора на запасной вариант', method: 'BATNA', tone: 'neutral' },
}

/** Метка хода для ленты: «SPIN · извлекающий вопрос». */
export function actTag(act: SpeechAct): { text: string; tone: ActInfo['tone'] } {
  const info = ACT_INFO[act]
  const text = info.method ? `${info.method} · ${info.label}` : info.label[0].toUpperCase() + info.label.slice(1)
  return { text, tone: info.tone }
}

/**
 * Метки одной реплики. Сигнал о выходе рядом с блефом — это угроза выдуманной
 * альтернативой, а не опора на запасной вариант: вторую метку не показываем,
 * иначе под блефом стоит «BATNA · опора на запасной вариант».
 */
export function actTags(acts: SpeechAct[]): { act: SpeechAct; text: string; tone: ActInfo['tone'] }[] {
  const shown = acts.includes('bluff') ? acts.filter((a) => a !== 'walkaway_signal') : acts
  return shown.map((act) => ({ act, ...actTag(act) }))
}

/** Какая методика стоит за строкой результата или штрафом (ключи — из `scoring.ts`). */
export const SCORE_METHOD: Record<string, Method> = {
  deal: 'BATNA',
  joint: 'Гарвардский метод',
  interests: 'SPIN',
  criteria: 'Гарвардский метод',
  discipline: 'Гарвардский метод',
  relationship: 'Гарвардский метод',
  below_batna: 'BATNA',
  attack: 'Гарвардский метод',
  early_offer: 'SPIN',
}
