/**
 * Строчная первая буква для подстановки в середину предложения.
 *
 * `toLowerCase()` здесь не годится: в поле «чего добивается вторая сторона»
 * администратор пишет свои слова, и «Срезать ИТ-бюджет» превращалось
 * в «срезать ит-бюджет». Аббревиатуру в начале не трогаем вовсе.
 */
export function decapitalize(text: string): string {
  const t = text.trim()
  if (!t) return t
  if (/^[А-ЯЁA-Z]{2,}/.test(t)) return t
  return t.charAt(0).toLowerCase() + t.slice(1)
}
