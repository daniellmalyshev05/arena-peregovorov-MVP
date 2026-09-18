/**
 * Модель мира «Арены».
 *
 * Ключевое архитектурное решение: условия сделки дискретны.
 * У каждого условия 3–5 фиксированных уровней. Это даёт три вещи:
 *   1. границу Парето можно посчитать полным перебором, а не оптимизацией;
 *   2. LLM выбирает id уровня, а не выдумывает число — на порядок стабильнее;
 *   3. игрок видит понятный терм-шит, а не бесконечный ползунок.
 */

export type Side = 'user' | 'opponent'

/** Один уровень условия. valueUser / valueOpponent — полезность 0..100 внутри этого условия. */
export interface IssueOption {
  id: string
  label: string
  valueUser: number
  valueOpponent: number
}

export interface Issue {
  id: string
  label: string
  /** Короткая подпись под строкой терм-шита, например «12 МВт». */
  hint?: string
  options: IssueOption[]
  /** Статус-кво: чем условие становится, если игрок его не открыл и не обсудил. */
  defaultOptionId: string
  /** Видно ли условие в терм-шите с самого начала. Остальные открываются вопросами. */
  visibleFromStart: boolean
  weightUser: number
  weightOpponent: number
}

/** Речевой акт, который движок распознаёт в ходе игрока. */
export type SpeechAct =
  | 'spin_situation'
  | 'spin_problem'
  | 'spin_implication'
  | 'spin_needpayoff'
  | 'active_listening'
  | 'objective_criterion'
  | 'conditional_offer'
  | 'unilateral_concession'
  | 'positional_bargaining'
  | 'personal_attack'
  | 'bluff'
  | 'authority_check'
  | 'walkaway_signal'

/** Скрытый интерес: то, что оппонент не скажет, пока его не раскроют. */
export interface HiddenInterest {
  id: string
  /** Как это звучит в разборе. */
  label: string
  /** Гипотеза, которую система подсказывает игроку в момент раскрытия. */
  hypothesis: string
  /** Каким актом раскрывается. */
  unlockedBy: SpeechAct[]
  /** Как он это произносит. Используется офлайн-оппонентом и как пример для LLM. */
  revealLine: string
  /** Какое условие становится видимым в терм-шите при раскрытии. */
  revealsIssue?: string
  /** Слой в рентгене: позиция / интерес / ограничение / страх / ресурс. */
  layer: 'interest' | 'constraint' | 'fear' | 'resource'
}

/** Карта объективного критерия — Гарвардский метод как игровой ресурс. */
export interface FactCard {
  id: string
  label: string
  detail: string
  /** По каким условиям этот факт реально работает. */
  strongAgainst: string[]
}

export interface OpponentPersona {
  name: string
  role: string
  company: string
  /** Файл в public/portraits. Если его нет, показываются инициалы. */
  portrait?: string
  /** Инструкция по манере речи для LLM. */
  speechStyle: string
  /** Публичная позиция, с которой он начинает. */
  openingPosition: string
  openingLine: string
}

export type Archetype =
  | 'hard_negotiator'
  | 'anxious_executive'
  | 'false_urgency'
  | 'partner'

/**
 * Утверждение об оппоненте, по которому игрок выставляет уверенность 0..1.
 * Часть утверждений истинна, часть — правдоподобные ловушки.
 * Точность модели оппонента считается по Брайеру, а не «угадал / не угадал».
 */
export interface BeliefProbe {
  id: string
  text: string
  truth: boolean
  /** Пояснение, которое показывается в разборе. */
  reality: string
}

/**
 * Реплики запасного движка — по СИТУАЦИЯМ, а не списком.
 * Выбор по ситуации и есть разница между «отвечает по делу» и «невпопад».
 */
export interface FallbackLines {
  /** По существу сказать нечего, но разговор надо двигать. */
  neutral: string
  /** Игрок говорит слишком общо. */
  vague: string
  /** Игрок давит, обвиняет или угрожает. */
  pressure: string
  /** Игрок отдал условие, не попросив ничего взамен. */
  concession: string
  /** Игрок предложил обмен — реакция на конструктив. */
  exchange: string
  /** Пакет принят. */
  accept: string
  /** Пакет лучше отказа, но ниже его ожиданий. */
  counter: string
  /** Пакет хуже его альтернативы. */
  reject: string
}

export interface Scenario {
  id: string
  title: string
  subtitle: string
  archetype: Archetype
  userRole: string
  userBrief: string
  userGoal: string
  /** BATNA в шкале полезности 0..100 той же стороны. */
  userBatna: { label: string; value: number }
  opponentBatna: { label: string; value: number }
  issues: Issue[]
  hiddenInterests: HiddenInterest[]
  facts: FactCard[]
  beliefProbes: BeliefProbe[]
  persona: OpponentPersona
  /** Реплики на случай сбоя LLM — движок никогда не остаётся без ответа. */
  fallbackLines: FallbackLines
  maxRounds: number
  /**
   * Чего добивается вторая сторона по замыслу организатора симуляции (ТЗ §2.2).
   * Уточняет уже подобранный кейс, а не подменяет его публичную позицию:
   * заменять позицию нельзя, иначе первая реплика говорит одно, а шапка другое.
   */
  organizerNote?: string
}

/** Текущий набор условий: id условия -> id выбранного уровня. */
export type Deal = Record<string, string>

export interface Hypothesis {
  id: string
  text: string
  /** Уверенность игрока 0..1. */
  confidence: number
  /** Какой скрытый интерес проверяет. Заполняется движком. */
  targetInterestId?: string
}

export interface Turn {
  index: number
  role: 'user' | 'opponent'
  text: string
  acts: SpeechAct[]
  /** Что изменилось в сделке этим ходом. */
  dealChanges: { issueId: string; from: string; to: string }[]
  revealed: string[]
  factPlayed?: string
  timestamp: number
}

export interface OpponentMood {
  trust: number
  irritation: number
  pressure: number
  flexibility: number
}

export type NegotiationStatus = 'active' | 'deal' | 'walkaway' | 'timeout'

export interface NegotiationState {
  scenarioId: string
  round: number
  deal: Deal
  visibleIssues: string[]
  revealedInterests: string[]
  mood: OpponentMood
  playedFacts: string[]
  hypotheses: Hypothesis[]
  transcript: Turn[]
  status: NegotiationStatus
  /** Уступки без встречного условия — считаются кодом, не моделью. */
  unilateralConcessions: number
  conditionalOffers: number
}
