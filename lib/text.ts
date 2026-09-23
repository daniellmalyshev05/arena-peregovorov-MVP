/**
 * Строчная первая буква для подстановки в середину предложения.
 *
 * Не `toLowerCase()`: «Срезать ИТ-бюджет» должно стать «срезать ИТ-бюджет».
 * Аббревиатуру в начале не трогаем вовсе.
 */
/** Дробное число по-русски: разделитель — запятая. */
export function num(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',')
}

export function decapitalize(text: string): string {
  const t = text.trim()
  if (!t) return t
  if (/^[А-ЯЁA-Z]{2,}/.test(t)) return t
  return t.charAt(0).toLowerCase() + t.slice(1)
}

/**
 * Число со знаком: «+12», «−4,5». Минус — типографский (U+2212), как в
 * штрафах разбора, а не дефис. Ноль после округления идёт с плюсом.
 */
export function signed(value: number, digits = 1): string {
  const body = digits === 0 ? String(Math.abs(Math.round(value))) : num(Math.abs(value), digits)
  const zero = /^0(,0+)?$/.test(body)
  return (value < 0 && !zero ? '−' : '+') + body
}
