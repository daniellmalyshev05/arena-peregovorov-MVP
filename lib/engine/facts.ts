import type { FactCard, NegotiationState, Scenario } from '@/lib/types'

/**
 * Факт, названный словами.
 *
 * Объективный критерий засчитывался только кнопкой «Приложить к ответу». Игрок,
 * который пересказывал факт своими словами — ровно то, чему учит Гарвардский
 * метод, — получал в разборе «вы не использовали ни одного объективного
 * критерия». Десять баллов из ста висели на кнопке, о которой не знали.
 *
 * Детектор детерминированный: числа из факта и основы значимых слов. Число
 * почти не встречается случайно, поэтому одно совпавшее число плюс две основы —
 * уже ссылка на факт; без чисел нужно четыре основы. Смотрятся только факты,
 * лежащие на столе у игрока и ещё не использованные.
 */

const STOP = new Set([
  'котор', 'может', 'можно', 'будет', 'также', 'этого', 'через', 'после', 'перед', 'между',
  'сейчас', 'только', 'очень', 'нужно', 'вашей', 'ваших', 'наших', 'своей', 'своих', 'более',
])

const norm = (t: string) => t.toLowerCase().replace(/ё/g, 'е')

/** Числа словами: «семь недель» — такая же ссылка на факт, как «7 недель». */
const WORD_NUMBERS: [RegExp, number][] = [
  [/^(одиннадцат)/, 11], [/^(двенадцат)/, 12], [/^(тринадцат)/, 13], [/^(четырнадцат)/, 14],
  [/^(пятнадцат)/, 15], [/^(шестнадцат)/, 16], [/^(семнадцат)/, 17], [/^(восемнадцат)/, 18],
  [/^(девятнадцат)/, 19], [/^(двадцат)/, 20], [/^(тридцат)/, 30], [/^(сорок)/, 40], [/^(пятьдесят|пятидесят)/, 50],
  [/^(два|две|двух)$/, 2], [/^(три|трех)$/, 3], [/^(четыре|четырех)$/, 4], [/^(пять|пяти)$/, 5],
  [/^(шесть|шести)$/, 6], [/^(семь|семи)$/, 7], [/^(восемь|восьми)$/, 8], [/^(девять|девяти)$/, 9],
  [/^(десять|десяти)$/, 10],
]

const numbers = (t: string) => {
  const text = norm(t)
  const out = new Set((text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')))
  for (const w of text.split(/[^а-я]+/)) {
    const hit = WORD_NUMBERS.find(([re]) => re.test(w))
    if (hit) out.add(String(hit[1]))
  }
  return out
}
const stems = (t: string) =>
  new Set(
    norm(t)
      .split(/[^а-яa-z]+/)
      .filter((w) => w.length >= 5)
      .map((w) => w.slice(0, 5))
      .filter((w) => !STOP.has(w)),
  )

export function citedFact(scenario: Scenario, state: NegotiationState, text: string, hand = 3): FactCard | undefined {
  // Числа, которые и так звучат в кейсе открыто («15%» из уведомления поставщика),
  // ссылкой на факт не считаются: их называет любой, кто просто спорит с позицией.
  const publicNums = numbers(
    [scenario.subtitle, scenario.userBrief, scenario.persona.openingLine, scenario.persona.openingPosition].join(' '),
  )
  const saidNums = new Set([...numbers(text)].filter((n) => !publicNums.has(n)))
  const saidStems = stems(text)
  let best: { fact: FactCard; score: number } | undefined

  for (const fact of scenario.facts.slice(0, hand)) {
    if (state.playedFacts.includes(fact.id)) continue
    const source = `${fact.label} ${fact.detail}`
    const nums = [...numbers(source)].filter((n) => saidNums.has(n)).length
    const words = [...stems(source)].filter((s) => saidStems.has(s)).length
    const cited = nums >= 2 || (nums >= 1 && words >= 2) || words >= 4
    if (!cited) continue
    const score = nums * 3 + words
    if (!best || score > best.score) best = { fact, score }
  }
  return best?.fact
}
