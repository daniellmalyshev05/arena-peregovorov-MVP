import type { Archetype, Scenario } from '@/lib/types'
import { renameScenario } from './rename'

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
  /** Сфера и тема, какими их описал администратор. По ним подбирается кейс. */
  sphere: string
  topic: string
  /** 1 — учебный, 5 — почти невозможный. */
  difficulty: number
  tone: Archetype
  opponentName: string
  opponentRole: string
  /**
   * Чего добивается вторая сторона. Участвует в подборе кейса и уходит модели
   * отдельной установкой — публичную позицию кейса не подменяет.
   */
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
    // Сфера и тема — это запрос на подбор кейса, а не его подпись, поэтому
    // пустые: администратор описывает ситуацию своими словами с чистого листа.
    sphere: '',
    topic: '',
    difficulty: 3,
    tone: base.archetype,
    opponentName: base.persona.name,
    opponentRole: base.persona.role,
    opponentGoal: '',
    rounds: base.maxRounds,
  }
}

/** Строка запроса для подбора кейса: всё, чем администратор описал ситуацию. */
export function matchQuery(cfg: AdminConfig): string {
  return [cfg.sphere, cfg.topic, cfg.opponentGoal].map((s) => s.trim()).filter(Boolean).join(' ')
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

  // Новое имя — во всех текстах кейса, в нужном падеже (см. lib/admin/rename.ts).
  const texts = renameScenario(base, name)

  return {
    ...texts,
    id: base.id,
    // Заголовок, подзаголовок, бриф и публичная позиция остаются от кейса.
    // Раньше сюда подставлялись слова администратора, и участник получал шапку
    // про один предмет торга, бриф про другой и первую реплику про третий.
    // Контекст администратора теперь выбирает кейс (см. lib/admin/match.ts),
    // а не переписывает его подписи.
    archetype: cfg.tone,
    maxRounds: clamp(Math.round(cfg.rounds), 4, 24),
    userBatna: { ...base.userBatna, value: userBatna },
    opponentBatna: { ...base.opponentBatna, value: opponentBatna },
    organizerNote: cfg.opponentGoal.trim() || undefined,
    persona: {
      ...texts.persona,
      name,
      role,
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
