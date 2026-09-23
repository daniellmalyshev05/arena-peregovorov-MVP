import type { SpeechAct } from '@/lib/types'

/**
 * Методики из ТЗ — Гарвардский метод, SPIN, BATNA — в словах интерфейса.
 *
 * Раньше они были названы только в справке `/how`. Внутри движка они в каждой
 * формуле, но человек, который справку не открыл, их не видел вовсе. Здесь —
 * одна таблица, которую читают и лента разговора, и разбор: как называется
 * ход игрока и к какой методике он относится.
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
  bluff: { label: 'блеф', tone: 'neutral' },
  authority_check: { label: 'проверка полномочий', tone: 'neutral' },
  walkaway_signal: { label: 'опора на запасной вариант', method: 'BATNA', tone: 'good' },
}

/** Метка хода для ленты: «SPIN · извлекающий вопрос». */
export function actTag(act: SpeechAct): { text: string; tone: ActInfo['tone'] } {
  const info = ACT_INFO[act]
  const text = info.method ? `${info.method} · ${info.label}` : info.label[0].toUpperCase() + info.label.slice(1)
  return { text, tone: info.tone }
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
