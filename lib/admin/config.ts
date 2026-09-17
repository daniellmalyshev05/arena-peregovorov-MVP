import type { Archetype, Scenario } from '@/lib/types'

/**
 * Контекст, который задаёт администратор (ТЗ §2.2): сфера и тема переговоров,
 * сложность, тон собеседника, его роль и цели.
 *
 * Настройки не «передаются в промпт» — они меняют математику сценария, и это
 * видно на карте достижимых соглашений. Сложность физически сужает зону
 * соглашения, тон меняет то, как оппонент уступает со временем.
 */
export interface AdminConfig {
  /** Кейс из библиотеки, который берётся за основу. */
  baseScenarioId: string
  sphere: string
  topic: string
  /** 1 — учебный, 5 — почти невозможный. */
  difficulty: number
  tone: Archetype
  opponentName: string
  opponentRole: string
  /** Чего добивается оппонент — становится его публичной позицией. */
  opponentGoal: string
  rounds: number
}

export const TONES: { value: Archetype; label: string; hint: string }[] = [
  { value: 'hard_negotiator', label: 'Жёсткий', hint: 'Держится долго, медленно сдаёт, доверие почти не размягчает' },
  { value: 'anxious_executive', label: 'Тревожный', hint: 'Болезненно реагирует на давление, но быстро открывается доверию' },
  { value: 'false_urgency', label: 'Давит срочностью', hint: 'Громко требует много и резко сдувается к финалу' },
  { value: 'partner', label: 'Партнёрский', hint: 'Идёт навстречу охотно, но только в обмен — голую уступку просто заберёт' },
]

export const DIFFICULTY_LABELS = ['', 'Учебная', 'Лёгкая', 'Рабочая', 'Высокая', 'Жёсткая']

export function defaultConfig(base: Scenario): AdminConfig {
  return {
    baseScenarioId: base.id,
    sphere: base.subtitle,
    topic: base.title,
    difficulty: 3,
    tone: base.archetype,
    opponentName: base.persona.name,
    opponentRole: base.persona.role,
    opponentGoal: base.persona.openingPosition,
    rounds: base.maxRounds,
  }
}

/**
 * Применяет контекст к базовому кейсу.
 *
 * Сложность двигает пороги отказа обеих сторон навстречу друг другу: зона
 * соглашения сужается, ошибаться становится дороже. Веса условий и скрытые
 * интересы не трогаются — иначе сломается вся выверенная экономика кейса.
 */
export function applyConfig(base: Scenario, cfg: AdminConfig): Scenario {
  const step = clamp(cfg.difficulty, 1, 5) - 3

  const userBatna = clamp(base.userBatna.value + step * 3, 5, 92)
  const opponentBatna = clamp(base.opponentBatna.value + step * 5, 5, 92)

  const name = cfg.opponentName.trim() || base.persona.name
  const role = cfg.opponentRole.trim() || base.persona.role
  const goal = cfg.opponentGoal.trim() || base.persona.openingPosition

  return {
    ...base,
    id: base.id,
    title: cfg.topic.trim() || base.title,
    subtitle: cfg.sphere.trim() || base.subtitle,
    archetype: cfg.tone,
    maxRounds: clamp(Math.round(cfg.rounds), 4, 24),
    userBatna: { ...base.userBatna, value: userBatna },
    opponentBatna: { ...base.opponentBatna, value: opponentBatna },
    persona: {
      ...base.persona,
      name,
      role,
      openingPosition: goal,
      // Портрет привязан к имени: своё имя — свои инициалы вместо чужого лица.
      portrait: name === base.persona.name ? base.persona.portrait : undefined,
    },
  }
}

/** Насколько настройки увели кейс от библиотечного. Нужно, чтобы честно показать это администратору. */
export function describeShift(base: Scenario, tuned: Scenario) {
  return {
    userBatna: tuned.userBatna.value - base.userBatna.value,
    opponentBatna: tuned.opponentBatna.value - base.opponentBatna.value,
    toneChanged: tuned.archetype !== base.archetype,
    roundsChanged: tuned.maxRounds !== base.maxRounds,
  }
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
