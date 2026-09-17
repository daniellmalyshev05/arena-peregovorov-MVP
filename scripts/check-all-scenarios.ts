/** Прогон каждого сценария офлайн-оппонентом: ничего не падает, интересы раскрываются. */
import { scenarios } from '../lib/scenarios'
import { applyTurn, createInitialState, evaluateOffer, sanitizeOffer } from '../lib/engine/state'
import { offlineTurn } from '../lib/llm/offline'
import { score } from '../lib/engine/scoring'
import { rewindCandidates } from '../lib/engine/rewind'
import type { NegotiationState } from '../lib/types'

const QUESTIONS = [
  'Что произойдёт с проектом, если сроки сдвинутся ещё дальше?',
  'С какими сложностями вы столкнулись на этом этапе?',
  'Расскажите, как сейчас устроен процесс с вашей стороны?',
  'Что бы вам дало решение этого вопроса — насколько это важно?',
  'Правильно ли я понял, что решение согласуется не только вами?',
]

let failed = 0
for (const s of scenarios) {
  let st: NegotiationState = createInitialState(s)
  for (const q of QUESTIONS) {
    const llm = offlineTurn(s, st, q)
    st = applyTurn({ scenario: s, state: st, userText: q, llm }).state
  }

  // Собираем пакет из всего, что открылось, в сторону оппонента, но с встречным условием.
  const offer: Record<string, string> = {}
  for (const issue of s.issues) {
    if (!st.visibleIssues.includes(issue.id)) continue
    const best = issue.options.reduce((a, b) => (b.valueOpponent > a.valueOpponent ? b : a))
    offer[issue.id] = best.id
  }
  const norm = sanitizeOffer(s, st, offer)
  const v = evaluateOffer(s, st, norm)
  const llm = offlineTurn(s, st, 'Предлагаю зафиксировать пакет целиком.', v.verdict)
  st = applyTurn({ scenario: s, state: st, userText: 'Предлагаю зафиксировать пакет целиком.', llm, explicitOffer: norm, precomputedVerdict: v.verdict }).state

  st.hypotheses = s.beliefProbes.map((p) => ({ id: p.id, text: '', confidence: p.truth ? 0.8 : 0.25 }))
  const r = score(s, st)
  const cands = rewindCandidates(s, st)

  const problems: string[] = []
  if (!st.revealedInterests.length) problems.push('ни один интерес не раскрылся типовыми вопросами')
  if (st.visibleIssues.length <= s.issues.filter((i) => i.visibleFromStart).length)
    problems.push('терм-шит не вырос ни на одну строку')
  if (!r.headline) problems.push('разбор не сформировал вывод')
  if (v.verdict === 'accept' && r.total > 70)
    problems.push('пакет «отдать всё оппоненту» принят и высоко оценён')

  console.log(
    `${problems.length ? '✗' : '✓'} ${s.title.padEnd(38)} ` +
      `интересов ${st.revealedInterests.length}/${s.hiddenInterests.length}  ` +
      `условий ${st.visibleIssues.length}/${s.issues.length}  ` +
      `вердикт ${v.verdict.padEnd(7)} баллы ${String(r.total).padStart(3)}  развилок ${cands.length}`,
  )
  if (problems.length) { failed++; for (const p of problems) console.log('    ✗ ' + p) }
}

console.log()
if (failed) { console.error(`сценариев с проблемами: ${failed}`); process.exit(1) }
console.log('все сценарии проходятся офлайн-оппонентом без сбоев')
