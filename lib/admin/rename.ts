import type { Scenario } from '@/lib/types'

/**
 * Имя собеседника из админки — во всех текстах кейса.
 *
 * Раньше новое имя получала только подпись реплик. Бриф, досье, гипотезы и
 * разбор продолжали говорить о библиотечном персонаже: участник беседовал с
 * Анной Петровой, а карточка спрашивала, «уходит ли Денис из-за денег».
 *
 * Имя в текстах кейса стоит и в косвенных падежах («риск Виктора», «Роману
 * важно»), поэтому простой замены мало. Падеж исходной формы определяется по
 * её окончанию, и новое имя ставится в тот же падеж по правилам склонения
 * русских личных имён. Нестандартное имя, которое не склоняется правилами,
 * остаётся в именительном — это лучше, чем выдуманное окончание.
 */

type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'prep'
type Paradigm = { stem: string; endings: Record<Case, string> }

const HUSHING = /[гкхжшчщ]$/
const SIBILANT = /[жшчщц]$/

/** Мужские имена на -а/-я, которые склоняются как женские, но мужские по роду. */
const MALE_A = new Set(['илья', 'никита', 'кузьма', 'фома', 'лука', 'савва', 'данила', 'гаврила', 'фока'])

export function isFemaleName(first: string): boolean {
  const n = first.toLowerCase()
  return /[ая]$/.test(n) && !MALE_A.has(n)
}

/**
 * Подходит ли имя персонажу по полу.
 *
 * Имя подставляется во все тексты кейса, а местоимения и согласования —
 * «она готова», «настроена партнёрски» — нет. Имя другого пола давало в
 * разборе «Игорь настроена». Такое имя не применяется: участник видит
 * библиотечного персонажа, администратор — объяснение под полем.
 */
export function nameFitsPersona(base: Scenario, full: string): boolean {
  const first = full.trim().split(/\s+/)[0] ?? ''
  if (!first) return true
  return isFemaleName(first) === isFemaleName(base.persona.name.split(' ')[0])
}

function paradigm(first: string): Paradigm | null {
  if (!/^[А-ЯЁ][а-яё]+$/.test(first)) return null
  const last = first.slice(-1)
  const stem = first.slice(0, -1)
  if (last === 'а') {
    const soft = HUSHING.test(stem)
    return {
      stem,
      endings: { nom: 'а', gen: soft ? 'и' : 'ы', dat: 'е', acc: 'у', ins: SIBILANT.test(stem) ? 'ей' : 'ой', prep: 'е' },
    }
  }
  if (last === 'я') {
    const ii = stem.endsWith('и')
    return { stem, endings: { nom: 'я', gen: 'и', dat: ii ? 'и' : 'е', acc: 'ю', ins: 'ей', prep: ii ? 'и' : 'е' } }
  }
  if (last === 'й') return { stem, endings: { nom: 'й', gen: 'я', dat: 'ю', acc: 'я', ins: 'ем', prep: 'е' } }
  if (last === 'ь') return { stem, endings: { nom: 'ь', gen: 'я', dat: 'ю', acc: 'я', ins: 'ем', prep: 'е' } }
  if (/[бвгдзклмнпрстфхжшчщц]/.test(last)) {
    return { stem: first, endings: { nom: '', gen: 'а', dat: 'у', acc: 'а', ins: SIBILANT.test(first) ? 'ем' : 'ом', prep: 'е' } }
  }
  return null
}

/** Все формы имени с их падежом, от длинных к коротким — чтобы «Виктора» не заменилось как «Виктор». */
function forms(first: string): { form: string; case: Case }[] {
  const p = paradigm(first)
  if (!p) return [{ form: first, case: 'nom' }]
  // Порядок падежей задаёт, какой из совпавших выбрать: родительный раньше
  // винительного, дательный раньше предложного — так их чаще пишут в кейсах.
  const order: Case[] = ['gen', 'dat', 'ins', 'acc', 'prep', 'nom']
  const seen = new Set<string>()
  const out: { form: string; case: Case }[] = []
  for (const c of order) {
    const form = p.stem + p.endings[c]
    if (seen.has(form)) continue
    seen.add(form)
    out.push({ form, case: c })
  }
  return out.sort((a, b) => b.form.length - a.form.length)
}

export function inflect(first: string, c: Case): string {
  const p = paradigm(first)
  return p ? p.stem + p.endings[c] : first
}

const L = '(?<![А-ЯЁа-яё])'
const R = '(?![А-ЯЁа-яё])'
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Функция замены имени в строке: полное имя, фамилия, имя в любом падеже. */
export function renamer(oldFull: string, newFull: string): (text: string) => string {
  const [oldFirst, ...oldRest] = oldFull.trim().split(/\s+/)
  const [newFirst, ...newRest] = newFull.trim().split(/\s+/)
  const oldLast = oldRest.join(' ')
  const newLast = newRest.join(' ')
  const steps: [RegExp, string][] = [[new RegExp(L + escape(oldFull.trim()) + R, 'g'), newFull.trim()]]
  if (oldLast) steps.push([new RegExp(L + escape(oldLast) + R, 'g'), newLast || newFirst])
  for (const f of forms(oldFirst)) steps.push([new RegExp(L + escape(f.form) + R, 'g'), inflect(newFirst, f.case)])
  return (text) => steps.reduce((t, [re, to]) => t.replace(re, to), text)
}

/** Кейс, в котором второй стороной зовут иначе. Идентификаторы и файлы не трогаются. */
export function renameScenario(base: Scenario, newFull: string): Scenario {
  const oldFull = base.persona.name
  if (!newFull.trim() || newFull.trim() === oldFull) return base
  const swap = renamer(oldFull, newFull)
  const SKIP = new Set(['id', 'portrait', 'scenarioId', 'probe', 'revealsIssue', 'unlockedBy'])
  const walk = (value: unknown, key?: string): unknown => {
    if (key && SKIP.has(key)) return value
    if (typeof value === 'string') return swap(value)
    if (Array.isArray(value)) return value.map((v) => walk(v))
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]))
    }
    return value
  }
  return walk(base) as Scenario
}
