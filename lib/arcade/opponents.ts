import type { Scenario } from '@/lib/types'

/**
 * Соперники аркады — обычные сценарии движка, только короче: три условия по три
 * уровня, три скрытых интереса и шесть раундов. Формулы, вердикты и раскрытия
 * считает тот же движок, что и в симуляторе.
 */

export type ArcadeLevel = 'easy' | 'medium' | 'boss'
export type ArcadeLesson = 'exchange' | 'questions' | 'criteria'

export interface ArcadeOpponent {
  scenario: Scenario
  level: ArcadeLevel
  lesson: ArcadeLesson
  /** Ситуация одной строкой — для карточки выбора. */
  situation: string
  /** Кейс симулятора, где тот же приём отрабатывается всерьёз. */
  practiceCaseId: string
  /** Фирменные ходы: модель вставляет их в речь, чтобы персонажа узнавали. */
  signatureMoves: string[]
  /** Ловушки: соперник предлагает игроку ошибиться. */
  traps: string[]
  /** Манера по фазам разговора. Индекс — фаза: начало, середина, финал. */
  phases?: [string, string, string]
}

export const ARCADE_SECONDS = 120
export const ARCADE_ROUNDS = 6

const lavka: ArcadeOpponent = {
  level: 'easy',
  lesson: 'exchange',
  situation: 'Вы открываете кафе и хотите брать у неё фермерский сыр.',
  practiceCaseId: 'supplier-hike',
  signatureMoves: [
    'предлагает попробовать товар, прежде чем говорить о цене',
    'вспоминает постоянных покупателей и то, как они берут',
    'называет собеседника по-доброму, без фамильярности',
  ],
  traps: [
    'предлагает сначала принять её цену, обещая «потом подвинуться»',
    'спрашивает, точно ли собеседнику нужно так много торговаться',
  ],
  scenario: {
    id: 'arcade-lavka',
    title: 'Хозяйка лавки',
    subtitle: 'Фермерский сыр для нового кафе',
    archetype: 'partner',
    userRole: 'Владелец нового кафе на углу',
    userBrief:
      'Сыр из этой лавки — лучший в районе, но тысяча двести за килограмм съедают всю маржу. Сбить цену в лоб не выйдет: здесь ценят тех, кто предлагает что-то взамен.',
    userGoal: 'Сбить цену на сыр. Взамен можно предложить то, что ценно ей.',
    userBatna: { label: 'Сыр из сетевого магазина: дешевле, но гости заметят разницу', value: 46 },
    opponentBatna: { label: 'Продавать сыр в розницу, как раньше', value: 34 },
    issues: [
      {
        id: 'price',
        label: 'Цена за килограмм',
        visibleFromStart: true,
        defaultOptionId: 'p1200',
        weightUser: 0.5,
        weightOpponent: 0.35,
        options: [
          { id: 'p1200', label: '1 200 ₽', valueUser: 0, valueOpponent: 100 },
          { id: 'p1050', label: '1 050 ₽', valueUser: 55, valueOpponent: 55 },
          { id: 'p900', label: '900 ₽', valueUser: 100, valueOpponent: 0 },
        ],
      },
      {
        id: 'volume',
        label: 'Объём в неделю',
        visibleFromStart: true,
        defaultOptionId: 'v10',
        weightUser: 0.3,
        weightOpponent: 0.35,
        options: [
          { id: 'v10', label: '10 кг', valueUser: 80, valueOpponent: 0 },
          { id: 'v20', label: '20 кг', valueUser: 65, valueOpponent: 60 },
          { id: 'v30', label: '30 кг', valueUser: 35, valueOpponent: 100 },
        ],
      },
      {
        id: 'first',
        label: 'Первая партия',
        visibleFromStart: false,
        defaultOptionId: 'week',
        weightUser: 0.2,
        weightOpponent: 0.3,
        options: [
          { id: 'week', label: 'через неделю', valueUser: 80, valueOpponent: 0 },
          { id: 'friday', label: 'в пятницу', valueUser: 75, valueOpponent: 60 },
          { id: 'today', label: 'сегодня со склада', valueUser: 60, valueOpponent: 100 },
        ],
      },
    ],
    hiddenInterests: [
      {
        id: 'fair',
        revealLine: 'Мне бы до пятницы склад разгрузить… У меня же в субботу ярмарка.',
        label: 'В субботу ярмарка, и склад нужно освободить к пятнице',
        hypothesis: 'Ей важно разгрузить склад до выходных?',
        unlockedBy: ['spin_situation', 'spin_problem'],
        revealsIssue: 'first',
        layer: 'interest',
      },
      {
        id: 'regular',
        revealLine: 'Мне важно, чтобы сыр покупали свежим. Кто берёт каждую неделю, тому и цена другая.',
        label: 'Регулярный покупатель ей ценнее разовой высокой цены',
        hypothesis: 'Постоянный объём для неё важнее цены?',
        unlockedBy: ['spin_needpayoff', 'conditional_offer'],
        layer: 'resource',
      },
      {
        id: 'closing',
        revealLine: 'Тут до вас уже двое открывались. Полгода — и нет их, а сыр мой остался.',
        label: 'Боится, что новое кафе закроется и у неё останется непроданная партия',
        hypothesis: 'Она опасается, что кафе быстро закроется?',
        unlockedBy: ['active_listening', 'spin_implication'],
        layer: 'fear',
      },
    ],
    facts: [],
    beliefProbes: [],
    persona: {
      name: 'Хозяйка лавки',
      portrait: 'khozyayka-lavki.jpg',
      role: 'хозяйка фермерской лавки',
      company: 'сыр собственного производства',
      speechStyle:
        'Радушная и хозяйственная, говорит просто и тепло. Гордится своим сыром. Уважает тех, кто торгуется, и чуть разочарована, если соглашаются сразу. Охотно идёт на обмен, но голую уступку принимает с улыбкой и ничего не даёт взамен.',
      openingPosition: 'Тысяча двести за килограмм, десять килограммов в неделю',
      openingLine: 'Вы из нового кафе на углу? Сначала попробуйте, потом про цену. Тысяча двести за килограмм — и это я ещё по-соседски.',
    },
    fallbackLines: {
      accept: 'Ну вот, по рукам! Заходите за сыром, я вам лучший отложу.',
      counter: 'Почти сговорились. Ещё бы шажок с вашей стороны — и по рукам.',
      reject: 'Нет, милый, так я себе в убыток работать буду. Не могу.',
      neutral: 'Сыр у меня хороший, сами попробуйте. Давайте подумаем, как нам обоим будет выгодно.',
      vague: 'А вы скажите прямо: что берёте и сколько? Тогда и про цену поговорим.',
      pressure: 'Ой, не надо на меня так. Я вам не сетевой магазин, у меня всё по-человечески.',
      concession: 'Ой, спасибо, милый. А цена-то пока та же.',
      exchange: 'Вот это разговор! Давайте посчитаем, что я могу для вас сделать.',
    },
    openers: [
      'Как у вас сейчас идут дела?',
      'Что для вас важнее — цена или постоянный покупатель?',
      'Если я возьму больше, что это вам даст?',
    ],
    maxRounds: ARCADE_ROUNDS,
  },
}

const deadlines: ArcadeOpponent = {
  level: 'medium',
  lesson: 'questions',
  situation: 'Агентство торопит вас запустить рекламную кампанию прямо сейчас.',
  practiceCaseId: 'resident-default',
  signatureMoves: [
    'ссылается на звонок, который вот-вот начнётся, или на клиента на второй линии',
    'называет конкретные сроки и дни недели',
    'говорит быстро, короткими фразами',
  ],
  traps: [
    'предлагает подписать прямо сейчас, а детали обсудить потом',
    'уверяет, что вопросы только отнимают время, а слот вот-вот уйдёт',
  ],
  phases: [
    'Сейчас начало разговора. В каждой реплике дави сроками: слот последний, решать нужно прямо сейчас, у тебя звонок.',
    'Середина разговора. Спешка ослабевает: сроки ещё упоминаешь, но мягче, может проскользнуть «ну, пару дней ещё есть».',
    'Финал разговора. О сроках и спешке не говори ни слова. Тебе самому хочется закрыть сделку, ты спокойнее и сговорчивее.',
  ],
  scenario: {
    id: 'arcade-deadlines',
    title: 'Король дедлайнов',
    subtitle: 'Рекламная кампания к новому сезону',
    archetype: 'false_urgency',
    userRole: 'Руководитель маркетинга бренда спортивной одежды',
    userBrief:
      'Агентство предлагает кампанию к новому сезону и уверяет, что слот на понедельник последний. Цена кусается, сроки давят. Проверьте, так ли всё горит.',
    userGoal: 'Не дать себя поторопить: дешевле и с запуском, к которому вы успеете подготовиться.',
    userBatna: { label: 'Другое агентство: дороже и только через месяц', value: 44 },
    opponentBatna: { label: 'Команда простаивает до следующего заказа', value: 28 },
    issues: [
      {
        id: 'cost',
        label: 'Стоимость кампании',
        visibleFromStart: true,
        defaultOptionId: 'c900',
        weightUser: 0.5,
        weightOpponent: 0.35,
        options: [
          { id: 'c900', label: '900 тыс. ₽', valueUser: 0, valueOpponent: 100 },
          { id: 'c750', label: '750 тыс. ₽', valueUser: 55, valueOpponent: 55 },
          { id: 'c600', label: '600 тыс. ₽', valueUser: 100, valueOpponent: 0 },
        ],
      },
      {
        id: 'launch',
        label: 'Запуск',
        visibleFromStart: true,
        defaultOptionId: 'monday',
        weightUser: 0.3,
        weightOpponent: 0.25,
        options: [
          { id: 'monday', label: 'в понедельник', valueUser: 20, valueOpponent: 100 },
          { id: 'week', label: 'через неделю', valueUser: 75, valueOpponent: 60 },
          { id: 'three', label: 'через три недели', valueUser: 100, valueOpponent: 0 },
        ],
      },
      {
        id: 'portfolio',
        label: 'Кейс в портфолио',
        visibleFromStart: false,
        defaultOptionId: 'none',
        weightUser: 0.2,
        weightOpponent: 0.4,
        options: [
          { id: 'none', label: 'без упоминания', valueUser: 90, valueOpponent: 0 },
          { id: 'logo', label: 'логотип на сайте агентства', valueUser: 80, valueOpponent: 60 },
          { id: 'case', label: 'кейс с цифрами и выступление на конференции', valueUser: 60, valueOpponent: 100 },
        ],
      },
    ],
    hiddenInterests: [
      {
        id: 'tender',
        revealLine: 'Между нами, такой бренд в портфолио мне бы сейчас очень пригодился.',
        label: 'Ему нужен известный бренд в портфолио для крупного тендера',
        hypothesis: 'Ему важно показать ваш бренд в портфолио?',
        unlockedBy: ['spin_needpayoff', 'active_listening'],
        revealsIssue: 'portfolio',
        layer: 'interest',
      },
      {
        id: 'idle',
        revealLine: 'Ну… если честно, ребята как раз освободились.',
        label: 'Команда сейчас свободна, никакой очереди на слот нет',
        hypothesis: 'Слот на самом деле не горит?',
        unlockedBy: ['spin_situation', 'spin_implication'],
        layer: 'resource',
      },
      {
        id: 'rivals',
        revealLine: 'Вы же к большим не уйдёте? Они вас потом месяц на брифе мариновать будут.',
        label: 'Боится, что вы уйдёте к крупному агентству',
        hypothesis: 'Он опасается потерять вас как клиента?',
        unlockedBy: ['walkaway_signal', 'spin_problem'],
        layer: 'fear',
      },
    ],
    facts: [],
    beliefProbes: [],
    persona: {
      name: 'Король дедлайнов',
      portrait: 'korol-dedlaynov.jpg',
      role: 'руководитель агентства',
      company: 'рекламное агентство',
      speechStyle:
        'Энергичный и обаятельный, всё время на бегу. Сыплет сроками и днями недели. Не грубит, а очаровывает и торопит. Чем дольше разговор, тем меньше в нём спешки.',
      openingPosition: 'Девятьсот тысяч, запуск в понедельник',
      openingLine: 'Слушайте, у меня ровно минута. Слот на понедельник последний: девятьсот — и запускаемся. Берёте?',
    },
    fallbackLines: {
      accept: 'Отлично, договорились! Пришлю договор через десять минут.',
      counter: 'Близко, очень близко. Но давайте ещё чуть-чуть — и запускаемся.',
      reject: 'Не, за такой бюджет мы кампанию не потянем. Давайте искать другой вариант.',
      neutral: 'Время идёт, слот ждать не будет. Что решаем?',
      vague: 'Давайте конкретнее: бюджет, дата — и поехали.',
      pressure: 'Тихо-тихо, я на вашей стороне. Но давить на меня бесполезно.',
      concession: 'О, спасибо! А по остальному пока без изменений.',
      exchange: 'Так, а вот это интересно. Секунду, прикину.',
    },
    openers: [
      'Что будет, если мы стартуем через две недели?',
      'Кто ещё претендует на этот слот?',
      'Что для вас важно в этом проекте, кроме бюджета?',
    ],
    maxRounds: ARCADE_ROUNDS,
  },
}

const cardinal: ArcadeOpponent = {
  level: 'boss',
  lesson: 'criteria',
  situation: 'Вам нужно согласовать пилот с крупной компанией через советника владельца.',
  practiceCaseId: 'resident-attraction',
  signatureMoves: [
    'отвечает вопросом на вопрос',
    'держит паузы — многоточие в начале реплики',
    'намекает, что знает о собеседнике больше, чем тот думает',
  ],
  traps: [
    'просит назвать последнюю цену, «чтобы сэкономить время»',
    'намекает, что второго шанса не будет',
  ],
  scenario: {
    id: 'arcade-cardinal',
    title: 'Серый кардинал',
    subtitle: 'Пилот с крупной компанией',
    archetype: 'hard_negotiator',
    userRole: 'Основатель технологического стартапа',
    userBrief:
      'Партнёрство с крупной компанией решит судьбу продукта. Официально решает владелец, но всё идёт через его советника. Пилот на полгода уже обсуждается. Вопрос — сколько в него вложат и что будет после.',
    userGoal: 'Получить больше денег на пилот и гарантию, что за ним будет контракт.',
    userBatna: { label: 'Продолжать искать партнёра среди компаний поменьше', value: 40 },
    opponentBatna: { label: 'Запустить такой же проект своими силами, долго и дорого', value: 36 },
    issues: [
      {
        id: 'budget',
        label: 'Бюджет пилота',
        visibleFromStart: true,
        defaultOptionId: 'b2',
        weightUser: 0.5,
        weightOpponent: 0.45,
        options: [
          { id: 'b2', label: '2 млн ₽', valueUser: 0, valueOpponent: 100 },
          { id: 'b4', label: '4 млн ₽', valueUser: 60, valueOpponent: 55 },
          { id: 'b6', label: '6 млн ₽', valueUser: 100, valueOpponent: 0 },
        ],
      },
      {
        id: 'after',
        label: 'После пилота',
        visibleFromStart: true,
        defaultOptionId: 'none',
        weightUser: 0.3,
        weightOpponent: 0.25,
        options: [
          { id: 'none', label: 'без обязательств', valueUser: 0, valueOpponent: 100 },
          { id: 'month', label: 'решение о контракте за месяц', valueUser: 60, valueOpponent: 55 },
          { id: 'kpi', label: 'контракт при выполнении KPI', valueUser: 100, valueOpponent: 35 },
        ],
      },
      {
        id: 'announce',
        label: 'Анонс партнёрства',
        visibleFromStart: false,
        defaultOptionId: 'you',
        weightUser: 0.2,
        weightOpponent: 0.3,
        options: [
          { id: 'you', label: 'вы объявляете сами', valueUser: 100, valueOpponent: 0 },
          { id: 'joint', label: 'совместный анонс', valueUser: 85, valueOpponent: 50 },
          { id: 'owner', label: 'объявляет владелец, вы — в тени', valueUser: 65, valueOpponent: 100 },
        ],
      },
    ],
    hiddenInterests: [
      {
        id: 'ownerIdea',
        revealLine: 'Владелец любит хорошие идеи. Особенно свои.',
        label: 'Решение должно выглядеть идеей владельца, а не уступкой стартапу',
        hypothesis: 'Ему важно, чтобы идея выглядела идеей владельца?',
        unlockedBy: ['active_listening', 'spin_needpayoff'],
        revealsIssue: 'announce',
        layer: 'interest',
      },
      {
        id: 'limit',
        revealLine: 'Есть суммы, которые я решаю сам. И есть те, ради которых собирается совет.',
        label: 'Без совета директоров он может согласовать только ограниченную сумму',
        hypothesis: 'У него есть предел суммы без совета?',
        unlockedBy: ['authority_check'],
        layer: 'constraint',
      },
      {
        id: 'pastPilot',
        revealLine: 'Последний стартап, который я привёл, обещал многое. Мне потом долго это припоминали.',
        label: 'Прошлый пилот со стартапом провалился, и это записали на него',
        hypothesis: 'Он боится повторить неудачный пилот?',
        unlockedBy: ['objective_criterion', 'spin_problem'],
        layer: 'fear',
      },
    ],
    facts: [],
    beliefProbes: [],
    persona: {
      name: 'Серый кардинал',
      portrait: 'seryy-kardinal.jpg',
      role: 'советник владельца компании',
      company: 'крупная компания',
      speechStyle:
        'Спокойный и немногословный, говорит негромко и точно. Отвечает вопросом на вопрос, держит паузы. Давление и блеф замечает сразу и становится холоднее. Аргумент с цифрами и измеримыми результатами выслушивает внимательно.',
      openingPosition: 'Два миллиона на полгода пилота, без обязательств после',
      openingLine: 'Владелец занят. Но вы ведь пришли не к нему, правда? Два миллиона на полгода пилота, а дальше — посмотрим.',
    },
    fallbackLines: {
      accept: '…Хорошо. Думаю, мы сможем это согласовать.',
      counter: '…Ближе. Но я бы на вашем месте подумал ещё.',
      reject: 'Нет. Так это не делается.',
      neutral: '…Продолжайте. Я слушаю.',
      vague: 'Это красивые слова. А в цифрах?',
      pressure: '…Вы торопитесь. Обычно это значит, что у вас мало вариантов.',
      concession: 'Благодарю. Записал.',
      exchange: '…Любопытно. И что вы хотите взамен?',
    },
    openers: [
      'Как обычно принимаются такие решения?',
      'Что должно случиться, чтобы пилот сочли успешным?',
      'С чем вы сравниваете наше предложение?',
    ],
    maxRounds: ARCADE_ROUNDS,
  },
}

export const arcadeOpponents: ArcadeOpponent[] = [lavka, deadlines, cardinal]

export function getArcadeOpponent(id: string): ArcadeOpponent | undefined {
  return arcadeOpponents.find((o) => o.scenario.id === id)
}
