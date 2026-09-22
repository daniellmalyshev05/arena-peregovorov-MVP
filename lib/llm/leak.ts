import type { NegotiationState, Scenario } from '@/lib/types'

/**
 * Детектор утечки скрытого содержания.
 *
 * Движок умеет ровно одно: он не засчитывает раскрытие, если речевой акт не
 * подошёл. Но есть дыра, которую кодом не закрыть — модель может проговорить
 * секрет прозой, оставив `revealedInterests` пустым. Формально всё чисто, а по
 * сути сценарий обезврежен: игрок получил ответ, не задав вопроса.
 *
 * Поэтому мы не пытаемся это запретить, а делаем видимым. После каждого хода
 * реплика модели сверяется с тем, что на этот момент раскрыто НЕ было. Совпало
 * достаточно содержательных слов — в консоль сервера уходит предупреждение с
 * точной цитатой. Прогон на живой модели перестаёт быть вопросом ощущений.
 *
 * Считается детерминированно и стоит доли миллисекунды: никаких обращений
 * наружу, никакого влияния на игру.
 */

export interface Leak {
  kind: 'interest' | 'issue'
  id: string
  label: string
  /** Слова и числа, по которым совпало. */
  matched: string[]
}

const STOP = new Set([
  'который', 'которая', 'которые', 'поэтому', 'потому', 'тогда', 'сейчас', 'сегодня',
  'должен', 'должны', 'должна', 'может', 'можем', 'можно', 'нельзя', 'нужно',
  'просто', 'именно', 'вообще', 'вместе', 'больше', 'меньше', 'дальше', 'раньше',
  'сторона', 'стороны', 'вопрос', 'вопросы', 'условие', 'условия', 'условий',
  'договор', 'договора', 'проект', 'проекта', 'компания', 'компании',
])

/**
 * Основа слова: первые пять букв. Шести не хватало: «перед советом» из секрета
 * не совпадало с «перед советом» из реплики, потому что слово «совет» короче
 * порога и выбрасывалось целиком. Пять букв ловят короткие существительные,
 * которыми секрет и проговаривается.
 */
const STEM = 5
const stem = (w: string) => w.slice(0, STEM)

function contentStems(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^0-9a-zа-яё]+/)) {
    if (!raw) continue
    if (/^\d/.test(raw)) {
      // Числа — самый громкий сигнал: «14 месяцев», «900 млн», «2027».
      if (raw.length >= 2) out.add(raw)
      continue
    }
    if (raw.length < STEM || STOP.has(raw)) continue
    out.add(stem(raw))
  }
  return out
}

/**
 * Длиннейший общий кусок: подряд идущие слова, совпавшие в реплике и в секрете.
 * Нужен там, где отдельные слова секрета законно звучат в кейсе — тогда утечку
 * выдаёт не словарь, а то, что фраза собрана в том же порядке.
 */
function longestRun(a: string, b: string): number {
  const words = (t: string) =>
    t.toLowerCase().replace(/ё/g, 'е').split(/[^0-9a-zа-я]+/).filter((w) => w.length >= 4).map(stem)
  const x = words(a)
  const y = words(b)
  if (!x.length || !y.length) return 0

  let best = 0
  let prev = new Array(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array(y.length + 1).fill(0)
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        cur[j] = prev[j - 1] + 1
        if (cur[j] > best) best = cur[j]
      }
    }
    prev = cur
  }
  return best
}

/**
 * Слова, которые второй стороне произносить законно: её публичная позиция,
 * первая реплика и всё, что уже выведено в терм-шит. Без этой поправки детектор
 * ловил бы сам сценарий — публичная позиция и скрытый интерес говорят про одно
 * и то же, разными словами лишь наполовину.
 */
function publicStems(scenario: Scenario, state: NegotiationState): Set<string> {
  const parts = [
    scenario.persona.openingPosition,
    scenario.persona.openingLine,
    scenario.opponentBatna.label,
    ...scenario.issues
      .filter((i) => state.visibleIssues.includes(i.id))
      .flatMap((i) => [i.label, i.hint ?? '', ...i.options.map((o) => o.label)]),
    ...scenario.hiddenInterests
      .filter((h) => state.revealedInterests.includes(h.id))
      .flatMap((h) => [h.label, h.revealLine]),
  ]
  return contentStems(parts.join(' '))
}

/**
 * @param state состояние ПОСЛЕ хода: то, что раскрылось этой репликой законно,
 *              уже помечено раскрытым и утечкой не считается.
 */
export function detectLeak(scenario: Scenario, state: NegotiationState, reply: string): Leak[] {
  // Реплика запасного движка — это заранее написанный текст кейса, а не
  // проговорка модели: её собственные слова иногда совпадают с секретом.
  if (Object.values(scenario.fallbackLines).some((line) => line.trim() === reply.trim())) return []

  const said = contentStems(reply)
  if (!said.size) return []
  const allowed = publicStems(scenario, state)

  const leaks: Leak[] = []

  /**
   * Три содержательных совпадения — это уже не совпадение; число весит за два.
   * Порог падает до двух, если совпал ещё и кусок фразы: в кейсе, где отдельные
   * слова секрета звучат законно, утечку выдаёт именно порядок слов. Раньше
   * требовалось четыре слова подряд, и перефраз вроде «защищать этот выбор
   * перед советом» проходил мимо — совпадало три.
   */
  const leaked = (secretText: string) => {
    const secret = contentStems(secretText)
    const matched = [...secret].filter((s) => said.has(s) && !allowed.has(s))
    const weight = matched.reduce((n, m) => n + (/^\d/.test(m) ? 2 : 1), 0)
    if (weight >= 3) return matched
    if (weight >= 2 && longestRun(reply, secretText) >= 3) return matched
    return null
  }

  for (const h of scenario.hiddenInterests) {
    if (state.revealedInterests.includes(h.id)) continue
    const matched = leaked(`${h.label} ${h.revealLine}`)
    if (matched) leaks.push({ kind: 'interest', id: h.id, label: h.label, matched })
  }

  for (const issue of scenario.issues) {
    if (state.visibleIssues.includes(issue.id)) continue
    const matched = leaked(`${issue.label} ${issue.hint ?? ''} ${issue.options.map((o) => o.label).join(' ')}`)
    if (matched) leaks.push({ kind: 'issue', id: issue.id, label: issue.label, matched })
  }

  return leaks
}

/** Строка для консоли сервера. Одна утечка — одна строка, чтобы её было видно в потоке. */
export function describeLeak(leak: Leak, reply: string): string {
  const what = leak.kind === 'interest' ? 'скрытый интерес' : 'неоткрытое условие'
  return `[арена] УТЕЧКА: модель проговорила ${what} «${leak.label}» (${leak.id}), не пометив раскрытие. Совпало: ${leak.matched.join(', ')}. Реплика: «${reply.slice(0, 200)}»`
}
