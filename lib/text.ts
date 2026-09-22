/**
 * Строчная первая буква для подстановки в середину предложения.
 *
 * `toLowerCase()` здесь не годится: в поле «чего добивается вторая сторона»
 * администратор пишет свои слова, и «Срезать ИТ-бюджет» превращалось
 * в «срезать ит-бюджет». Аббревиатуру в начале не трогаем вовсе.
 */
/**
 * Дробное число по-русски: разделитель — запятая. В интерфейсе рядом стоят
 * «1,8 млрд ₽» из сценария и «22.1» из расчёта, и вторая запись читается
 * как чужая.
 */
export function num(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',')
}

export function decapitalize(text: string): string {
  const t = text.trim()
  if (!t) return t
  if (/^[А-ЯЁA-Z]{2,}/.test(t)) return t
  return t.charAt(0).toLowerCase() + t.slice(1)
}
