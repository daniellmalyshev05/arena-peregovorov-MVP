/**
 * Выход из переговоров.
 *
 * Разбор обязан отличать три разные вещи, которые раньше сливались в одну:
 *   1. договориться было не о чем вовсе — выход безусловно верен;
 *   2. из открытых условий ничего не собиралось — выход верен, но цена решения
 *      зависит от того, насколько полно игрок проверил стол;
 *   3. взаимовыгодный пакет лежал среди уже открытых условий — выход ошибка.
 *
 * До этой проверки третья ветка срабатывала всегда: `auditScenario` не выпускает
 * сценарий без зоны соглашения, поэтому первая ветка была недостижима, а второй
 * не существовало. С3, у которого в холле написано «навык: вовремя выходить из
 * переговоров», за выход давал 20 из 100 с заголовком «хотя договориться было
 * можно».
 */
import { scenarios } from '@/lib/scenarios'
import { createInitialState } from '@/lib/engine/state'
import { score } from '@/lib/engine/scoring'
import { enumerateReachable, zopa } from '@/lib/engine/utility'
import type { NegotiationState, Scenario } from '@/lib/types'

let failed = 0
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failed++
    console.log('  ✗', what)
  }
}

/** Выход из переговоров после того, как раскрыты первые `revealed` интересов. */
function walkedAwayAfter(s: Scenario, revealed: number): NegotiationState {
  const base = createInitialState(s)
  const interests = s.hiddenInterests.slice(0, revealed)
  const opened = interests.map((h) => h.revealsIssue).filter((x): x is string => Boolean(x))
  return {
    ...base,
    status: 'walkaway',
    revealedInterests: interests.map((h) => h.id),
    visibleIssues: [...new Set([...base.visibleIssues, ...opened])],
  }
}

for (const s of scenarios) {
  console.log('\n' + '─'.repeat(70))
  console.log(s.title.toUpperCase())

  for (const revealed of [0, Math.ceil(s.hiddenInterests.length / 2), s.hiddenInterests.length]) {
    const st = walkedAwayAfter(s, revealed)
    const r = score(s, st)
    const reachable = zopa(enumerateReachable(s, st.visibleIssues)).length
    console.log(
      `  раскрыто ${revealed}/${s.hiddenInterests.length}  условий открыто ${st.visibleIssues.length}/${s.issues.length}` +
        `  достижимых сделок ${String(reachable).padStart(4)}  →  ${String(r.total).padStart(3)} из 100`,
    )
    console.log('    ' + r.headline)

    if (reachable === 0) {
      check(
        // Из открытого сделки не было: выход не ошибка. Если интересы остались
        // закрытыми, заголовок говорит об этом, но не называет выход ошибкой.
        !r.headline.includes('хотя договориться было можно') &&
          (revealed < s.hiddenInterests.length
            ? r.headline.includes('не выяснив интересы второй стороны')
            : r.headline.includes('это было правильно')),
        `${s.id}: при ${revealed} раскрытых сделки не было, а заголовок неверный: «${r.headline}»`,
      )
    } else {
      check(
        r.headline.includes('хотя договориться было можно'),
        `${s.id}: при ${revealed} раскрытых сделка была достижима, а выход назван верным`,
      )
    }
  }

  // Уйти, не задав ни одного вопроса, не должно стоить столько же,
  // сколько уйти, проверив весь стол.
  const blind = score(s, walkedAwayAfter(s, 0)).total
  const informed = score(s, walkedAwayAfter(s, s.hiddenInterests.length)).total
  check(blind < informed || informed <= 8, `${s.id}: слепой выход (${blind}) не дешевле осознанного (${informed})`)
}

console.log('\n' + '═'.repeat(70))
if (failed) {
  console.error(`ОШИБОК: ${failed}`)
  process.exit(1)
}
console.log('✓ выход из переговоров оценивается по достижимому, а не по полному перебору')
