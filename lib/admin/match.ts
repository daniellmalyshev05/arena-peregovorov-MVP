import type { Scenario } from '@/lib/types'

/**
 * Подбор кейса под контекст администратора (ТЗ §2.2).
 *
 * ТЗ разрешает сценарий «генерировать ИЛИ подбирать». Здесь подбор: он
 * детерминирован, работает без сети и выбирает только из кейсов, прошедших
 * аудит играбельности.
 *
 * Слова администратора — запрос, а не подпись: они выбирают кейс, но не
 * переименовывают его. Если близкого кейса нет, совпадение помечается слабым.
 */

/**
 * Слова, которыми администратор описывает ситуацию, — не те, которыми она
 * называется в библиотеке. «Закупки» и «бюджет» должны находить кейс про
 * поставщика, «эскалация» и «просрочка» — кейс про подрядчика.
 */
const TERMS: Record<string, string[]> = {
  'resident-attraction': [
    'привлечение', 'инвестор', 'инвестиции', 'инвестиционный', 'резидент', 'площадка',
    'размещение', 'локация', 'регион', 'завод', 'производство', 'промышленность',
    'промышленный', 'строительство завода', 'льготы', 'преференции', 'оэз',
    'особая экономическая зона', 'земля', 'участок', 'аренда', 'продажа', 'клиент',
    'сделка', 'партнёрство', 'развитие территории', 'девелопмент', 'greenfield',
  ],
  'contractor-delay': [
    'срыв', 'сроки', 'просрочка', 'задержка', 'отставание', 'подрядчик', 'генподрядчик',
    'субподрядчик', 'исполнитель', 'стройка', 'строительство', 'корпус', 'объект',
    'график', 'эскалация', 'конфликт', 'претензия', 'штраф', 'неустойка', 'приёмка',
    'качество работ', 'проект', 'внедрение', 'сдача', 'аванс', 'авансирование',
    'ремонт', 'монтаж', 'опоздание', 'срывает', 'сроки сдачи', 'генподряд',
  ],
  'resident-default': [
    'невыполнение', 'обязательства', 'нарушение', 'дефолт', 'расторжение', 'разрыв',
    'реструктуризация', 'отсрочка', 'долг', 'задолженность', 'санкции', 'гарантии',
    'контроль', 'отчётность', 'репутация', 'публичность', 'кризис', 'спасение проекта',
    'выход', 'прекращение', 'пересмотр условий', 'дисциплина',
  ],
  'supplier-hike': [
    'поставщик', 'вендор', 'закупки', 'закупка', 'снабжение', 'цена', 'тариф', 'ставка',
    'повышение', 'подорожание', 'рост цены', 'индексация', 'контракт', 'договор',
    'затраты', 'объём', 'поставка', 'логистика', 'отсрочка платежа', 'смета',
    'подписка', 'лицензия',
    'аренда', 'арендодатель', 'арендатор', 'ставка аренды', 'помещение', 'офис', 'склад', 'поднять', 'поднимает', 'повысить', 'повышает', 'подорожать', 'дороже', 'рост', 'стоимость', 'прайс', 'услуги', 'обслуживание', 'сырьё', 'материалы', 'комплектующие',
  ],
  'it-budget': [
    'бюджет', 'бюджетирование', 'сокращение бюджета', 'урезать', 'срезать', 'оптимизация расходов',
    'расходы', 'экономия', 'финансовый директор', 'финдиректор', 'финансы', 'казначейство',
    'ит', 'айти', 'информационные технологии', 'цифровизация', 'внедрение системы',
    'учётная система', 'проект', 'департамент', 'подразделение', 'внутренние переговоры',
    'защита бюджета', 'капзатраты', 'правление',
    'урезают', 'сокращение', 'финансирование', 'смета отдела', 'бюджет отдела', 'защитить бюджет',
  ],
  'retention-offer': [
    'сотрудник', 'удержание', 'удержать', 'оффер', 'увольнение', 'уволиться', 'зарплата',
    'заработная', 'оклад', 'повышение зарплаты', 'прибавка', 'компенсация', 'премия', 'бонус',
    'кадры', 'персонал', 'найм', 'hr', 'эйчар', 'отдел кадров', 'руководитель', 'подчинённый',
    'инженер', 'разработчик', 'карьера', 'рост', 'мотивация', 'удалёнка', 'удалённая работа',
    'конкурент переманивает', 'хантинг',
    'сотрудница', 'специалист', 'программист', 'менеджер', 'уход', 'переманивают', 'контроффер', 'контрофер', 'пересмотр зарплаты',
  ],
  'client-discount': [
    'клиент', 'заказчик', 'продажи', 'продажа', 'продавец', 'продлить', 'продление',
    'пролонгация', 'скидка', 'дисконт', 'торг', 'b2b', 'ключевой клиент', 'аккаунт',
    'выручка', 'сеть', 'ритейл', 'розница', 'сервис', 'подписка на сервис', 'платформа',
    'уровень сервиса', 'sla', 'поддержка', 'конкурент', 'тендер', 'закупщик',
  ],
}

/**
 * Куда вторая сторона двигает цену.
 *
 * Словарь кейса не видит направления: «снизить ставку хранения» и «поднять
 * ставку аренды» совпадают по словам. Направление берётся только из поля
 * «Чего добивается вторая сторона»: «поставщик не даёт скидку» в теме —
 * про нас, а не про неё.
 */
type Direction = 'lower' | 'raise'
const DIRECTION: Record<string, Direction> = {
  'supplier-hike': 'raise',
  'retention-offer': 'raise',
  'client-discount': 'lower',
  'it-budget': 'lower',
}
const LOWER = /(сниз|сниж|скидк|дисконт|дешевл|уменьш|сократ|сокращ|урез|срез|убав)[а-яё]*/
const RAISE = /(повыс|повыш|подня|поднима|поднят|увелич|подорож|дороже|индексир|прибав|выровн)[а-яё]*/

function directionOf(goal: string): { dir: Direction; word: string } | undefined {
  const text = goal.toLowerCase().replace(/ё/g, 'е')
  const lower = text.match(LOWER)
  const raise = text.match(RAISE)
  // Оба направления в одной фразе («снизить цену, но поднять объём») — не угадываем.
  if (lower && raise) return undefined
  if (lower) return { dir: 'lower', word: lower[0] }
  if (raise) return { dir: 'raise', word: raise[0] }
  return undefined
}

const STOP = new Set([
  'переговоры', 'переговорах', 'переговоров', 'разговор', 'ситуация', 'вопрос',
  'компания', 'компании', 'сторона', 'стороны', 'который', 'которая', 'которые',
  'нужно', 'должен', 'можно', 'очень', 'также', 'между', 'своих', 'наших', 'этого',
])

/**
 * Основа слова: без окончания, не длиннее шести букв — чтобы «ставку»
 * и «ставка» сводились к одной основе.
 */
const ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'ия', 'ие', 'ий', 'ой', 'ей',
  'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ую', 'юю', 'ая', 'яя', 'ое', 'ее', 'ые', 'ый', 'ть',
  'а', 'я', 'о', 'е', 'у', 'ю', 'ы', 'и', 'й', 'ь',
]
const stem = (w: string) => {
  let base = w
  for (const e of ENDINGS) {
    if (base.endsWith(e) && base.length - e.length >= 4) {
      base = base.slice(0, -e.length)
      break
    }
  }
  return base.length > 6 ? base.slice(0, 6) : base
}

/**
 * Совпадение основ. Точное — всегда; префиксное — только для основ от пяти
 * букв: «арендо(датель)» находит «аренд(а)», а «рост» не цепляет «ростов».
 */
function lookup(idx: Map<string, number>, t: string): number | undefined {
  const exact = idx.get(t)
  if (exact) return exact
  if (t.length < 5) return undefined
  let best: number | undefined
  for (const [k, weight] of idx) {
    if (k.length < 5) continue
    if (t.startsWith(k) || k.startsWith(t)) best = Math.max(best ?? 0, weight)
  }
  return best
}

function terms(text: string): string[] {
  return words(text).map(([, s]) => s)
}

/** Слова запроса вместе с основами: администратору показываются его слова, а не обрубки. */
function words(text: string): [string, string][] {
  const out: [string, string][] = []
  for (const raw of text.toLowerCase().replace(/ё/g, 'е').split(/[^0-9a-zа-я]+/)) {
    if (raw.length < 4 || STOP.has(raw)) continue
    out.push([raw, stem(raw)])
  }
  return out
}

/** Словарь кейса: курируемые синонимы весят больше, чем слова из его собственных подписей. */
function index(scenario: Scenario): Map<string, number> {
  const map = new Map<string, number>()
  const add = (text: string, weight: number) => {
    for (const t of terms(text)) map.set(t, Math.max(map.get(t) ?? 0, weight))
  }

  for (const t of TERMS[scenario.id] ?? []) add(t, 3)

  add(scenario.title, 2)
  add(scenario.subtitle, 2)
  add(scenario.userRole, 1)
  add(scenario.persona.role, 1)
  add(scenario.persona.company, 1)
  add(scenario.persona.openingPosition, 1)
  for (const i of scenario.issues) add(i.label, 1)

  return map
}

export type MatchConfidence = 'точное' | 'близкое' | 'слабое'

export interface Match {
  scenario: Scenario
  score: number
  /** Слова запроса, по которым совпало. Администратор должен видеть, почему выбран этот кейс. */
  matched: string[]
  confidence: MatchConfidence
}

/**
 * Ранжирует библиотеку под запрос. Первый элемент — подобранный кейс.
 *
 * Пустой запрос возвращает библиотеку в исходном порядке со «слабым» совпадением:
 * молчание не повод делать вид, что выбор обоснован.
 */
export function matchScenarios(scenarios: Scenario[], query: string, goal = ''): Match[] {
  const asked = [...new Set(terms(query))]
  const direction = directionOf(goal)
  const spoken = new Map<string, string>()
  for (const [raw, s] of words(query)) if (!spoken.has(s)) spoken.set(s, raw)

  const ranked = scenarios.map((scenario) => {
    const idx = index(scenario)
    const matched: string[] = []
    let score = 0
    // Совпадения по курируемым синонимам считаем отдельно: попадание в
    // «Руководитель» из подписи роли — это не понимание контекста.
    let strong = 0
    for (const t of asked) {
      const weight = lookup(idx, t)
      if (!weight) continue
      score += weight
      if (weight >= 3) strong += 1
      matched.push(spoken.get(t) ?? t)
    }
    // Совпавшее направление — сильный сигнал, противоположное — почти приговор:
    // кейс про повышение не учит отвечать на требование скидки.
    const own = DIRECTION[scenario.id]
    if (direction && own) {
      if (own === direction.dir) {
        score += 4
        strong += 1
        if (!matched.includes(direction.word)) matched.push(direction.word)
      } else {
        score = Math.max(0, score - 6)
      }
    }
    const coverage = asked.length ? matched.length / asked.length : 0
    return { scenario, score, matched, confidence: confidenceOf(score, coverage, strong) }
  })

  return ranked.sort(
    (a, b) => b.score - a.score || scenarios.indexOf(a.scenario) - scenarios.indexOf(b.scenario),
  )
}

/**
 * Уверенность подбора. Без порога кейс про поставщика ловил бы слова
 * «повышение» и «руководитель» из запроса про зарплату, поэтому случайное
 * совпадение помечается слабым.
 */
function confidenceOf(score: number, coverage: number, strong: number): MatchConfidence {
  if (score < 6 || strong === 0) return 'слабое'
  if (score >= 10 && coverage >= 0.4 && strong >= 2) return 'точное'
  return 'близкое'
}

/** Подобранный кейс и объяснение выбора. */
export function pickScenario(scenarios: Scenario[], query: string, goal = ''): Match {
  return matchScenarios(scenarios, query, goal)[0]
}
