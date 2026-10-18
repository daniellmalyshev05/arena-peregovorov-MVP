import { Mark } from './Mark'

/**
 * Справка «Как это устроено»: на каких методиках построен движок и из чего
 * складывается результат — до того, как партия сыграна.
 *
 * Отдельная страница, а не модальное окно: на неё можно дать ссылку.
 */

const METHODS = [
  {
    name: 'Гарвардский метод',
    summary:
      'Принципиальные переговоры: отделять людей от проблемы, интересы — от позиций, искать варианты к взаимной выгоде и опираться на объективные критерии.',
    here: [
      'У второй стороны есть публичная позиция и закрытые интересы — и это разные вещи. Первая реплика всегда про позицию.',
      'Условия обмениваются пакетом: выгода появляется там, где стороны по-разному ценят одно и то же условие.',
      'К реплике можно приложить факт из досье. Это и есть объективный критерий — он считается отдельным показателем.',
    ],
  },
  {
    name: 'SPIN',
    summary:
      'Четыре типа вопросов, которые ведут собеседника от описания ситуации к осознанию её цены: ситуационные, проблемные, извлекающие и направляющие.',
    here: [
      'Каждая ваша реплика размечается по типу речевого акта — движок различает разведку, объективный критерий, условный обмен, уступку, давление и сигнал о выходе.',
      'Скрытый интерес раскрывается только тем типом вопроса, который для него предусмотрен. Общий вопрос не открывает ничего, и «расскажите о себе» тоже.',
      'Вместе с интересом на стол выходит новое условие сделки. Не спросили — торгуетесь на неполном столе и не знаете об этом.',
    ],
  },
  {
    name: 'BATNA',
    summary:
      'Лучшая альтернатива переговорному соглашению. Она задаёт нижнюю границу приемлемого: соглашаться на сделку хуже своей альтернативы невыгодно.',
    here: [
      'Запасной вариант посчитан в баллах у обеих сторон. По нему код решает, примет вторая сторона пакет или отвергнет.',
      'Ваш запас над альтернативой виден всё время, в том числе при сборке пакета: до отправки видно, как предложение сдвигает вашу позицию.',
      'Между двумя запасными вариантами лежит зона соглашения. Её видно на карте в разборе и в настройке симуляции — там же видно, как она сужается со сложностью.',
      'В одном из сценариев альтернатива игрока сильнее любой договорённости. Не договориться там — правильный исход.',
    ],
  },
]

const SCORE = [
  { label: 'Ценность сделки относительно запасного варианта', max: 25, note: 'Ориентир — половина совместной ценности. Выжимать вторую сторону досуха не нужно.' },
  { label: 'Совместно созданная ценность', max: 20, note: 'Сколько из возможной общей выгоды вы вдвоём вытащили, а сколько осталось на столе.' },
  { label: 'Раскрытие интересов', max: 15, note: 'Сколько закрытых интересов второй стороны вы нашли.' },
  { label: 'Точность модели второй стороны', max: 15, note: 'Гипотезы в досье оцениваются по Брайеру: штрафуется и самоуверенность, и отказ иметь мнение.' },
  { label: 'Использование объективных критериев', max: 10, note: 'Засчитывается факт, после которого условие сдвинулось.' },
  { label: 'Дисциплина уступок', max: 10, note: 'Условный обмен против уступки без встречного условия.' },
  { label: 'Сохранение рабочих отношений', max: 5, note: 'Доверие и раздражение второй стороны к концу разговора.' },
]

const PENALTIES = [
  { label: 'Сделка хуже собственного запасного варианта', points: '−15' },
  { label: 'Уступка без встречного условия', points: 'до −10' },
  { label: 'Переход на личность вместо обсуждения проблемы', points: '−6' },
  { label: 'Предложение до выяснения интересов', points: '−6' },
]


/**
 * Один ход партии — кто за что отвечает. Решение по пакету принимает код
 * до обращения к модели, модель только говорит его словами.
 */
const TURN = [
  { actor: 'Вы', tone: 'you', title: 'Ход', detail: 'Реплика своими словами, пакет условий или факт к ответу.' },
  {
    actor: 'Движок',
    tone: 'code',
    title: 'Решение',
    detail: 'До обращения к модели алгоритм считает выгоду пакета для обеих сторон и решает: согласие, встречное или отказ.',
  },
  {
    actor: 'Модель',
    tone: 'model',
    title: 'Реплика',
    detail: 'Модель получает решение готовым и говорит его голосом второй стороны: характер, интонация, реакция.',
  },
  {
    actor: 'Движок',
    tone: 'code',
    title: 'Счёт',
    detail: 'Движок по правилам обновляет соглашение, настрой второй стороны и раскрытые интересы. Баллы в разборе считает тоже он.',
  },
] as const

const ACTOR_TONE = {
  you: 'bg-line2 text-ink2',
  code: 'bg-accent-soft text-accent',
  model: 'bg-warn-soft text-warn',
} as const

function TurnArrow({ sealed = false }: { sealed?: boolean }) {
  return (
    <div aria-hidden className="flex items-center justify-center py-1 md:py-0">
      <div className="flex flex-col items-center gap-1.5 md:flex-row">
        {sealed && (
          <span className="order-last flex items-center gap-1 rounded-full border border-accent-line bg-surface px-2 py-0.5 text-label font-semibold text-accent md:order-none md:hidden">
            <LockGlyph />
            решение
          </span>
        )}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 text-ink-faint md:rotate-0">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  )
}

function LockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function HowView() {
  return (
    <main className="min-h-dvh bg-paper">
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:px-5">
        <a href="/" aria-label="К списку сценариев" className="press tap -ml-1.5 flex h-11 w-11 items-center justify-center rounded-md text-ink2 hover:bg-line2 md:ml-0 md:h-8 md:w-8">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </a>
        <span className="font-semibold">Как это устроено</span>
        <span className="ml-auto flex items-center gap-2 text-ink3">
          <Mark size={18} />
        </span>
      </header>

      <div className="mx-auto max-w-[900px] px-6 py-10 sm:px-8 sm:py-14">
        <p className="lbl">Методики и система оценки</p>
        <h1 className="mt-3.5 max-w-[620px] text-h1 font-semibold tracking-[-0.02em] text-balance">
          У каждой партии есть точный счёт
        </h1>
        <p className="mt-4 max-w-[640px] text-lead text-ink2 text-pretty">
          У каждого условия сделки есть вес и несколько фиксированных уровней, у обеих сторон — свой
          запасной вариант. Поэтому исход партии можно посчитать точно: кто сколько получил, сколько
          ценности вы создали вместе и сколько осталось лежать на столе.
        </p>

        {/* Главное различие продукта — первым разделом и схемой одного хода. */}
        <section className="mt-12 border-t border-line pt-9">
          <h2 className="text-h2 font-semibold tracking-[-0.016em]">Что считает код, а что — модель</h2>

          <ol className="mt-7 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)]">
            {TURN.map((step, i) => (
              <li key={step.title} className="contents">
                {i > 0 && <TurnArrow sealed={i === 2} />}
                <div
                  className={`enter-card relative flex flex-col rounded-lg bg-surface p-4 ${
                    step.tone === 'code'
                      ? 'shadow-[inset_0_0_0_1px_var(--color-accent-line),0_14px_30px_-22px_rgba(30,92,65,0.55)]'
                      : 'shadow-[inset_0_0_0_1px_var(--color-line)]'
                  }`}
                  style={{ animationDelay: `${80 + i * 90}ms` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${ACTOR_TONE[step.tone]}`}>
                      {step.actor}
                    </span>
                    <span className="mono text-caption text-ink-faint">{i + 1}</span>
                  </div>
                  <h3 className="mt-3 text-lead font-semibold">{step.title}</h3>
                  <p className="mt-1 text-small leading-snug text-ink2 text-pretty">{step.detail}</p>
                  {i === 1 && (
                    <span className="mt-3 hidden items-center gap-1 self-start rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-label font-semibold text-accent md:inline-flex">
                      <LockGlyph />
                      решение
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-4 flex gap-2.5 rounded-md bg-surface px-4 py-3 text-small leading-snug text-ink2 shadow-[inset_0_0_0_1px_var(--color-line2)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-px shrink-0 text-accent">
              <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span>
              Реплику модели проверяет код: согласие без решения алгоритма не пройдёт, а проговорённый
              скрытый интерес засчитается вам как раскрытый.
            </span>
          </p>

          <p className="mt-6 max-w-[660px] leading-relaxed text-ink2 text-pretty">
            Языковая модель играет человека напротив: держит характер, формулирует реплики, решает,
            что сказать в ответ. Она не ставит баллы и не решает, принято ли предложение. Выгодность
            пакета для второй стороны считается кодом до обращения к модели и уходит ей как данность —
            поэтому результат нельзя выговорить, его можно только выторговать.
          </p>
          <p className="mt-3 max-w-[660px] leading-relaxed text-ink2 text-pretty">
            Если модель почему-то не ответила, ход подхватывает движок на правилах, и в интерфейсе
            это видно прямой пометкой. Молчаливой подмены нет.
          </p>
        </section>

        <section className="mt-12 border-t border-line pt-9">
          <h2 className="text-h2 font-semibold tracking-[-0.016em]">На чём это построено</h2>
          <p className="mt-2.5 max-w-[640px] leading-relaxed text-ink2 text-pretty">
            Три классические рамки переговоров. Каждая встроена в механику и отвечает за свою
            часть стола.
          </p>

          <div className="mt-7 flex flex-col gap-4">
            {METHODS.map((m) => (
              <article key={m.name} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
                <h3 className="text-lead font-semibold">{m.name}</h3>
                <p className="mt-2 max-w-[660px] text-small leading-relaxed text-ink2 text-pretty">{m.summary}</p>
                <div className="lbl mt-5 mb-2.5">Где это в «Арене»</div>
                <ul className="flex flex-col gap-2">
                  {m.here.map((line) => (
                    <li key={line} className="flex gap-2.5 text-small leading-relaxed text-pretty">
                      <span aria-hidden className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-accent" />
                      <span className="min-w-0">{line}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-9">
          <h2 className="text-h2 font-semibold tracking-[-0.016em]">Как считается результат</h2>
          <p className="mt-2.5 max-w-[640px] leading-relaxed text-ink2 text-pretty">
            Сто баллов по семи показателям, разбор показывает каждый отдельно и объясняет, откуда
            взялась цифра. Балл за саму сделку — меньше половины: можно выторговать много и
            всё равно провести плохие переговоры.
          </p>

          <dl className="mt-6 rounded-lg border border-line bg-surface">
            {SCORE.map((s) => (
              <div key={s.label} className="flex flex-col gap-1 border-b border-line2 px-5 py-4 last:border-0 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
                <dt className="min-w-0">
                  <span className="block font-semibold">{s.label}</span>
                  <span className="mt-1 block text-small leading-snug text-ink2 text-pretty">{s.note}</span>
                </dt>
                <dd className="num shrink-0 text-lead font-semibold sm:text-right">{s.max}</dd>
              </div>
            ))}
          </dl>

          <div className="lbl mt-8 mb-2.5">Штрафы</div>
          <dl className="rounded-lg border border-line bg-surface">
            {PENALTIES.map((p) => (
              <div key={p.label} className="flex items-baseline justify-between gap-4 border-b border-line2 px-5 py-3 last:border-0">
                <dt className="min-w-0 text-small">{p.label}</dt>
                <dd className="num shrink-0 text-small font-semibold text-ink2">{p.points}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-9">
          <a
            href="/"
            className="press flex h-12 items-center gap-2.5 rounded-md bg-accent px-6 font-semibold text-white hover:bg-accent/92"
          >
            К переговорам
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
          <span className="text-small text-ink2">Читать это до игры не обязательно — разбор объяснит то же самое на вашей партии.</span>
        </div>
      </div>
    </main>
  )
}
