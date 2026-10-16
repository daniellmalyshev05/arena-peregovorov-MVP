import type { HiddenInterest, NegotiationState, Scenario } from '@/lib/types'

/**
 * Что показывает сцена собеседника. Только чтение состояния: настрой и
 * раскрытые интересы считает движок, здесь они переводятся в образ.
 */

export type MoodBand = 'irritated' | 'wary' | 'neutral' | 'warming' | 'ready'

/** Порядок на шкале — от раздражения к готовности. */
export const MOOD_BANDS: MoodBand[] = ['irritated', 'wary', 'neutral', 'warming', 'ready']

export const MOOD_LABEL: Record<MoodBand, string> = {
  irritated: 'Раздражение',
  wary: 'Настороженность',
  neutral: 'Нейтральный настрой',
  warming: 'Потепление',
  ready: 'Готовность договориться',
}

/**
 * Настрой по разнице доверия и раздражения: на ней же держится гибкость второй
 * стороны в движке. Старт (45 и 15) — нейтральный, два-три хороших вопроса дают
 * потепление, выпад — настороженность.
 *
 * Готовность договориться не выводится из настроения: её показывает только
 * согласие кода на пакет. Иначе подпись обещала бы то, чего движок не решал.
 */
export function moodBand(state: NegotiationState): MoodBand {
  if (state.status === 'deal' || state.agreedAtRound) return 'ready'
  const { trust, irritation } = state.mood
  if (irritation >= 50) return 'irritated'
  const d = trust - irritation
  if (d < 0) return 'irritated'
  if (d < 25) return 'wary'
  if (d < 45) return 'neutral'
  return 'warming'
}

export const LAYER_LABEL: Record<HiddenInterest['layer'], string> = {
  interest: 'Интерес',
  constraint: 'Ограничение',
  fear: 'Опасение',
  resource: 'Ресурс',
}

const LAYER_ORDER: HiddenInterest['layer'][] = ['interest', 'constraint', 'fear', 'resource']

/**
 * Закрытая карта не несёт текста вовсе: то, чего нет в данных, не попадёт ни в
 * DOM, ни в подсказку браузера.
 */
export type XrayCard =
  | { id: string; kind: HiddenInterest['layer']; layer: string; open: true; text: string }
  | { id: string; kind: HiddenInterest['layer']; layer: string; open: false }

export function xrayCards(scenario: Scenario, state: NegotiationState): XrayCard[] {
  return [...scenario.hiddenInterests]
    .sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer))
    .map((h): XrayCard =>
      state.revealedInterests.includes(h.id)
        ? { id: h.id, kind: h.layer, layer: LAYER_LABEL[h.layer], open: true, text: h.label }
        : { id: h.id, kind: h.layer, layer: LAYER_LABEL[h.layer], open: false },
    )
}
