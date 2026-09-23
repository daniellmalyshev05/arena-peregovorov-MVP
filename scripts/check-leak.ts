/**
 * Детектор утечки скрытого содержания.
 *
 * Детектор ценен ровно настолько, насколько ему можно верить. Поэтому
 * проверяем обе ошибки сразу: пропустил настоящую утечку — прогон на модели
 * ничего не измерит; поднял ложную тревогу на честной реплике — предупреждения
 * перестанут читать после третьего.
 *
 * Самая строгая часть — пункт 3: через детектор прогоняются ВСЕ реплики
 * запасного движка во всех сценариях. Это заведомо честные ответы, написанные
 * под эти же кейсы, и ни на одной из них тревоги быть не должно.
 */
import { scenarios } from '@/lib/scenarios'
import { createInitialState, grantLeaked } from '@/lib/engine/state'
import { detectLeak } from '@/lib/llm/leak'

let failed = 0
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failed++
    console.log('  ✗', what)
  }
}

console.log('Детектор утечки\n')

// 1. Секрет, сказанный прозой без пометки раскрытия, обязан быть пойман.
for (const s of scenarios) {
  const state = createInitialState(s)
  for (const h of s.hiddenInterests) {
    const leaks = detectLeak(s, state, h.revealLine)
    check(
      leaks.some((l) => l.id === h.id),
      `${s.id}/${h.id}: реплика в точности из скрытого интереса не поймана`,
    )
  }
}

// 2. Законное раскрытие тревогой не считается.
for (const s of scenarios) {
  for (const h of s.hiddenInterests) {
    const state = createInitialState(s)
    state.revealedInterests.push(h.id)
    if (h.revealsIssue) state.visibleIssues.push(h.revealsIssue)
    const leaks = detectLeak(s, state, h.revealLine)
    check(
      !leaks.some((l) => l.id === h.id),
      `${s.id}/${h.id}: раскрытый интерес засчитан как утечка`,
    )
  }
}

// 3. Ни одна честная реплика запасного движка не поднимает тревогу.
for (const s of scenarios) {
  const state = createInitialState(s)
  const honest = [
    s.persona.openingLine,
    s.persona.openingPosition,
    ...Object.values(s.fallbackLines),
  ]
  for (const line of honest) {
    const leaks = detectLeak(s, state, line)
    check(leaks.length === 0, `${s.id}: ложная тревога на «${line.slice(0, 70)}» → ${leaks.map((l) => l.id).join(', ')}`)
  }
}

// 4. Нейтральный деловой разговор не ловится.
{
  const s = scenarios[0]
  const state = createInitialState(s)
  const neutral = [
    'Давайте вернёмся к этому после того, как я посмотрю цифры.',
    'Мне нужно понимать, на каких условиях вы готовы двигаться.',
    'Хорошо, я услышал вас. Что вы предлагаете взамен?',
    'Такой вариант мы не рассматриваем, он для нас невыгоден.',
    '',
  ]
  for (const line of neutral) {
    check(detectLeak(s, state, line).length === 0, `ложная тревога на нейтральной реплике «${line}»`)
  }
}

// 4b. Перефраз: модель не цитирует секрет, а пересказывает его.
//     Детектор — эвристика: ловит близкий пересказ, а не любой синоним.
{
  const s = scenarios[0]
  const state = createInitialState(s)
  const paraphrases: { line: string; id: string }[] = [
    {
      // Такую реплику модель выдавала в ответ на пустую вежливость.
      line:
        'Добрый день. Давайте сразу к делу: у нас есть альтернатива в соседнем регионе, и по стоимости земли вы сейчас заметно проигрываете. Мне нужно будет защищать этот выбор перед советом, поэтому хотелось бы понять, готовы ли вы обсуждать аренду со скидкой.',
      id: 'landForBoard',
    },
  ]
  for (const p of paraphrases) {
    const leaks = detectLeak(s, state, p.line)
    check(leaks.some((l) => l.id === p.id), `перефраз секрета не пойман: ${p.id}`)
  }

  // И обратная сторона: похожая по словам, но честная реплика тревоги не даёт.
  const honest = [
    'Мне нужно будет защищать этот выбор внутри компании, как и вам свой.',
    'Давайте обсудим стоимость земли и формат участка.',
  ]
  for (const line of honest) {
    const leaks = detectLeak(s, state, line)
    check(leaks.length === 0, `ложная тревога на честной реплике «${line}» → ${leaks.map((l) => l.id).join(', ')}`)
  }
}

// 5. Неоткрытое условие, которое модель подняла сама, тоже видно.
{
  const s = scenarios[0]
  const state = createInitialState(s)
  const hidden = s.issues.find((i) => !state.visibleIssues.includes(i.id))!
  const line = `${hidden.label} ${hidden.hint ?? ''} ${hidden.options.map((o) => o.label).join(' ')}`
  const leaks = detectLeak(s, state, line)
  check(leaks.some((l) => l.kind === 'issue'), 'неоткрытое условие, поднятое моделью, не поймано')
}

// 6. Проговорённое засчитывается раскрытым.
//    Иначе реплика и документ расходятся на экране: вторая сторона называет
//    интерес вслух, плашки нет, строка в соглашении не появляется, а разбор
//    потом снимает баллы за нераскрытое.
{
  const s = scenarios[0]
  const state = createInitialState(s)
  // Ход игрока в стенограмме нужен: плашка «Раскрыт интерес» рисуется по нему.
  state.transcript.push({
    index: 1, role: 'user', text: 'Понимаю вас.', acts: [],
    dealChanges: [], revealed: [], timestamp: Date.now(),
  })

  const secret = s.hiddenInterests[0]
  const leaks = detectLeak(s, state, secret.revealLine)
  check(leaks.length > 0, 'реплика с секретом не опознана как утечка')

  const before = state.revealedInterests.length
  const { granted, hint } = grantLeaked(s, state, leaks)
  check(granted.includes(secret.id), 'проговорённый интерес не засчитан раскрытым')
  check(state.revealedInterests.length > before, 'раскрытие не попало в состояние')
  check(Boolean(hint), 'для проговорённого интереса не предложена гипотеза')
  check(
    state.transcript[1].revealed.includes(secret.id),
    'раскрытие не записано в ход игрока — плашки на экране не будет',
  )
  if (secret.revealsIssue) {
    check(state.visibleIssues.includes(secret.revealsIssue), 'условие интереса не выведено в соглашение')
  }

  // Повторно то же самое не засчитывается.
  check(grantLeaked(s, state, leaks).granted.length === 0, 'раскрытие засчитано дважды')
  check(grantLeaked(s, state, []).granted.length === 0, 'без утечки что-то засчитано')
}

console.log(failed === 0 ? '\n✓ детектор ловит утечку, молчит на честных репликах и не даёт документу разойтись с разговором' : `\n${failed} провалов`)
process.exit(failed === 0 ? 0 : 1)
