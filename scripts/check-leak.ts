/**
 * Детектор утечки скрытого содержания.
 *
 * Детектор ценен ровно настолько, насколько ему можно верить. Поэтому
 * проверяем обе ошибки сразу: пропустил настоящую утечку — прогон на модели
 * ничего не измерит; поднял ложную тревогу на честной реплике — предупреждения
 * перестанут читать после третьего.
 *
 * Самая суровая часть — пункт 3: через детектор прогоняются ВСЕ реплики
 * запасного движка во всех сценариях. Это заведомо честные ответы, написанные
 * под эти же кейсы, и ни на одной из них тревоги быть не должно.
 */
import { scenarios } from '@/lib/scenarios'
import { createInitialState } from '@/lib/engine/state'
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

// 5. Неоткрытое условие, которое модель подняла сама, тоже видно.
{
  const s = scenarios[0]
  const state = createInitialState(s)
  const hidden = s.issues.find((i) => !state.visibleIssues.includes(i.id))!
  const line = `${hidden.label} ${hidden.hint ?? ''} ${hidden.options.map((o) => o.label).join(' ')}`
  const leaks = detectLeak(s, state, line)
  check(leaks.some((l) => l.kind === 'issue'), 'неоткрытое условие, поднятое моделью, не поймано')
}

console.log(failed === 0 ? '\n✓ детектор ловит утечку и молчит на честных репликах' : `\n${failed} провалов`)
process.exit(failed === 0 ? 0 : 1)
