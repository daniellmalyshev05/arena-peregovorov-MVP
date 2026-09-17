/**
 * Русское числительное: 1 сессия, 2 сессии, 5 сессий.
 * Формы передаются в порядке [одна, две, пять].
 */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}

/** Число вместе с правильной формой слова: «3 сессии». */
export function count(n: number, forms: [string, string, string]): string {
  return `${n} ${plural(n, forms)}`
}
