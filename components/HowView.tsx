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

        <section className="mt-12 border-t border-line pt-9">
          <h2 className="text-h2 font-semibold tracking-[-0.016em]">Что считает код, а что — модель</h2>
          <p className="mt-2.5 max-w-[660px] leading-relaxed text-ink2 text-pretty">
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
