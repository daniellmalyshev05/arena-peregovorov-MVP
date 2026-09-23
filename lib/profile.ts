'use client'

import type { NegotiationState, Scenario, SpeechAct } from '@/lib/types'
import type { ScoreReport } from '@/lib/engine/scoring'
import { analyze, utility } from '@/lib/engine/utility'
import { num } from '@/lib/text'
import { count } from '@/lib/plural'

const KEY = 'arena.profile.v1'

export interface RunRecord {
  scenarioId: string
  at: number
  total: number
  userUtility: number
  opponentUtility: number
  status: NegotiationState['status']
  revealed: number
  interests: number
  unilateral: number
  conditional: number
  facts: number
  /** Сделка оказалась хуже собственного запасного варианта. Может отсутствовать в старых записях профиля. */
  belowBatna?: boolean
  /** Вышел из переговоров там, где зоны соглашения не было вовсе: выход был верным. */
  rightWalkaway?: boolean
  brier: number | null
  acts: Partial<Record<SpeechAct, number>>
  /** Сессия после отката. Хранится, но в зачёт и в статистику не идёт. */
  training: boolean
}

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRun(run: RunRecord): RunRecord[] {
  const runs = [...loadRuns(), run].slice(-60)
  try {
    localStorage.setItem(KEY, JSON.stringify(runs))
  } catch {
    // Приватный режим или переполненное хранилище — профиль просто не копится.
  }
  return runs
}

export function clearRuns() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* пусто */
  }
}

export function buildRun(
  scenario: Scenario,
  state: NegotiationState,
  score: ScoreReport,
  training: boolean,
): RunRecord {
  const acts: Partial<Record<SpeechAct, number>> = {}
  for (const t of state.transcript) {
    if (t.role !== 'user') continue
    for (const a of t.acts) acts[a] = (acts[a] ?? 0) + 1
  }

  const answered = state.hypotheses.filter((h) => scenario.beliefProbes.some((p) => p.id === h.id))
  const brier = answered.length
    ? answered.reduce((sum, h) => {
        const probe = scenario.beliefProbes.find((p) => p.id === h.id)!
        return sum + (h.confidence - (probe.truth ? 1 : 0)) ** 2
      }, 0) / answered.length
    : null

  return {
    scenarioId: scenario.id,
    at: Date.now(),
    total: score.total,
    userUtility: utility(scenario, state.deal, 'user'),
    opponentUtility: utility(scenario, state.deal, 'opponent'),
    status: state.status,
    revealed: state.revealedInterests.length,
    interests: scenario.hiddenInterests.length,
    unilateral: state.unilateralConcessions,
    conditional: state.conditionalOffers,
    facts: state.playedFacts.length,
    belowBatna: state.status === 'deal' && utility(scenario, state.deal, 'user') < scenario.userBatna.value,
    ...(state.status === 'walkaway' ? { rightWalkaway: !analyze(scenario, state.deal).zopaExists } : {}),
    brier,
    acts,
    training,
  }
}

export interface Pattern {
  id: string
  title: string
  detail: string
  tone: 'weak' | 'strong'
}

/**
 * Устойчивые паттерны, а не «уровень 7».
 * Считаются только по зачётным сессиям и только когда их набралось хотя бы два —
 * иначе это не паттерн, а один случай.
 */
export function patterns(runs: RunRecord[]): Pattern[] {
  const scored = runs.filter((r) => !r.training)
  if (scored.length < 2) return []

  const n = scored.length
  const out: Pattern[] = []
  const sum = (f: (r: RunRecord) => number) => scored.reduce((a, r) => a + f(r), 0)
  const act = (a: SpeechAct) => sum((r) => r.acts[a] ?? 0)

  const withUnilateral = scored.filter((r) => r.unilateral > 0).length
  if (withUnilateral / n >= 0.5) {
    out.push({
      id: 'unilateral',
      title: `Уступаете без встречного условия в ${withUnilateral} из ${n} переговоров`,
      detail: 'Самая дорогая привычка: ценность утекает именно здесь. Связывайте уступку с тем, что получаете взамен.',
      tone: 'weak',
    })
  } else {
    // Считается по сессиям, а не по сумме ходов: один условный обмен за две
    // партии давал «почти всегда просите взамен», а навык ниже на том же
    // экране честно стоял «в работе, 1 из 2». Предикат — тот же, что у навыка.
    const clean = scored.filter((r) => r.conditional > 0 && r.unilateral === 0).length
    if (clean >= 2 && clean / n >= 0.75) {
      out.push({
        id: 'exchange',
        title: 'Вы почти всегда просите что-то взамен',
        detail: `Обмен без уступок даром — в ${clean} из ${n} переговоров.`,
        tone: 'strong',
      })
    }
  }

  if (act('spin_implication') === 0) {
    out.push({
      id: 'no_implication',
      title: 'Вы ни разу не спросили о последствиях',
      detail:
        'Вопрос «что произойдёт, если…» заставляет вторую сторону самой назвать цену проблемы. Без него интересы так и остаются закрытыми.',
      tone: 'weak',
    })
  }

  const revealRate = sum((r) => r.revealed) / Math.max(1, sum((r) => r.interests))
  if (revealRate < 0.5) {
    out.push({
      id: 'shallow',
      title: `Вы раскрываете ${Math.round(revealRate * 100)}% скрытых интересов`,
      detail: 'Задавайте больше вопросов до того, как сделаете первое предложение.',
      tone: 'weak',
    })
  } else if (revealRate > 0.75) {
    out.push({
      id: 'digger',
      title: `Вы доходите до ${Math.round(revealRate * 100)}% скрытых интересов`,
      detail: 'Разведка — ваша сильная сторона. Следите, чтобы найденное попадало в предложение.',
      tone: 'strong',
    })
  }

  if (sum((r) => r.facts) / n < 1) {
    out.push({
      id: 'no_facts',
      title: 'Вы почти не используете объективные критерии',
      detail: 'Аргумент, опирающийся на внешний факт, двигает условия сильнее, чем настойчивость.',
      tone: 'weak',
    })
  }

  const briers = scored.map((r) => r.brier).filter((b): b is number => b !== null)
  if (briers.length >= 2) {
    const avg = briers.reduce((a, b) => a + b, 0) / briers.length
    if (avg > 0.3) {
      out.push({
        id: 'calibration',
        title: 'Вы часто уверены там, где не проверяли',
        detail: `Средняя ошибка оценок — ${num(avg, 2)}. Не фиксируйте уверенность, пока не получили подтверждение.`,
        tone: 'weak',
      })
    } else if (avg < 0.15) {
      out.push({
        id: 'calibrated',
        title: 'Ваша модель второй стороны точна',
        detail: `Средняя ошибка оценок — ${num(avg, 2)}: вы уверены там, где действительно знаете.`,
        tone: 'strong',
      })
    }
  }

  const belowBatna = scored.filter((r) => r.status === 'deal' && r.total < 25).length
  if (belowBatna >= 2) {
    out.push({
      id: 'closer',
      title: `В ${belowBatna} из ${n} сессий сделка вышла хуже отказа`,
      detail: 'Желание договориться перевешивает расчёт. Перед согласием сравнивайте пакет со своим запасным вариантом.',
      tone: 'weak',
    })
  }

  return out
}

/**
 * Навыки переговорщика как допуски, а не как полоска опыта.
 *
 * ТЗ (§2.4) просит прогрессию и «развитие персонажа». XP-шкала здесь была бы
 * самым шаблонным решением и ничего не измеряла бы: навык — не сумма очков, а
 * повторяемость. Поэтому навык считается освоенным только тогда, когда он
 * подтвердился в двух зачётных сессиях, и опирается ровно на те же числа,
 * которыми считается разбор.
 */
export type SkillStatus = 'untested' | 'seen' | 'learning' | 'mastered'

export interface Skill {
  id: string
  title: string
  status: SkillStatus
  detail: string
}

const CONFIRMATIONS = 2

export function skills(runs: RunRecord[]): Skill[] {
  const scored = runs.filter((r) => !r.training)
  const rated = scored.filter((r) => r.brier !== null)

  const build = (
    id: string,
    title: string,
    pool: RunRecord[],
    ok: (r: RunRecord) => boolean,
    text: {
      untested: string
      /** Что показала единственная сессия. Порог не двигает — но и молчать нечестно. */
      single: (ok: boolean) => string
      learning: (hits: number, n: number) => string
      mastered: (hits: number) => string
    },
  ): Skill => {
    const hits = pool.filter(ok).length
    if (!pool.length) return { id, title, status: 'untested', detail: text.untested }
    // Одна сессия навык не закрывает — порог остаётся прежним и это правильно.
    // Но выводить пять одинаковых «не проверялся» тому, кто только что сыграл,
    // значит прятать от него собственный результат: человек видит заглушку там,
    // где для него уже посчитано всё, кроме повторяемости.
    if (pool.length < CONFIRMATIONS) return { id, title, status: 'seen', detail: text.single(hits > 0) }
    if (hits >= CONFIRMATIONS) return { id, title, status: 'mastered', detail: text.mastered(hits) }
    return { id, title, status: 'learning', detail: text.learning(hits, pool.length) }
  }

  const sessions = (n: number) => count(n, ['сессии', 'сессиях', 'сессиях'])

  return [
    build(
      'discovery',
      'Разведка интересов',
      scored,
      (r) => r.interests > 0 && r.revealed / r.interests >= 0.75,
      {
        untested: 'Нужны две зачётные сессии, чтобы отличить навык от удачного разговора.',
        single: (ok) => ok
          ? 'В этой сессии вы дошли до трёх четвертей интересов. Ещё одна такая — навык зачтён.'
          : 'В этой сессии до трёх четвертей интересов второй стороны вы не дошли.',
        learning: (hits, n) => `Вы дошли до трёх четвертей интересов второй стороны в ${hits} из ${n}.`,
        mastered: (hits) => `Вы доходите до интересов второй стороны: подтверждено в ${sessions(hits)}.`,
      },
    ),
    build(
      'exchange',
      'Дисциплина обмена',
      scored,
      (r) => r.conditional > 0 && r.unilateral === 0,
      {
        untested: 'Нужны две зачётные сессии с отправленным пакетом.',
        single: (ok) => ok
          ? 'В этой сессии обмен шёл без уступок даром. Ещё одна такая — навык зачтён.'
          : 'В этой сессии обмена без уступок даром не получилось.',
        learning: (hits, n) => `Обмен без уступок «просто так» получился в ${hits} из ${n}.`,
        mastered: (hits) => `Вы просите встречное условие и не отдаёте даром: подтверждено в ${sessions(hits)}.`,
      },
    ),
    build(
      'criteria',
      'Опора на факты',
      scored,
      (r) => r.facts >= 2,
      {
        untested: 'Нужны две зачётные сессии, чтобы увидеть привычку опираться на факты.',
        single: (ok) => ok
          ? 'В этой сессии вы опёрлись на два факта и больше. Ещё одна такая — навык зачтён.'
          : 'В этой сессии фактов в разговоре было меньше двух.',
        learning: (hits, n) => `Два и больше фактов в разговоре — в ${hits} из ${n}.`,
        mastered: (hits) => `Вы спорите документом, а не настойчивостью: подтверждено в ${sessions(hits)}.`,
      },
    ),
    build(
      'model',
      'Модель второй стороны',
      rated,
      (r) => (r.brier ?? 1) <= 0.2,
      {
        untested: 'Оцените утверждения в досье хотя бы в двух сессиях.',
        single: (ok) => ok
          ? 'В этой сессии ваши оценки в досье оказались точными. Ещё одна такая — навык зачтён.'
          : 'В этой сессии оценки в досье разошлись с тем, что оказалось правдой.',
        learning: (hits, n) => `Точная модель второй стороны получилась в ${hits} из ${n}.`,
        mastered: (hits) => `Вы понимаете вторую сторону точно и без самоуверенности: подтверждено в ${sessions(hits)}.`,
      },
    ),
    build(
      'walkaway',
      'Сравнение с отказом',
      // Навык проверяется там, где было что сравнивать: сделка или выход из
      // кейса без зоны соглашения. Раньше в зачёт шла любая сессия без сделки
      // ниже запасного варианта — и два выхода подряд после одной реплики
      // объявлялись освоенным навыком.
      scored.filter((r) => r.status === 'deal' || r.rightWalkaway === true),
      (r) => !r.belowBatna,
      {
        untested: 'Нужны две зачётные сессии, закончившиеся сделкой или обоснованным выходом.',
        single: (ok) => ok
          ? 'В этой сессии итог был не хуже вашего запасного варианта. Ещё одна такая — навык зачтён.'
          : 'В этой сессии сделка вышла хуже вашего запасного варианта.',
        learning: (hits, n) => `Итог был не хуже вашего запасного варианта в ${hits} из ${n}.`,
        mastered: (hits) => `Вы не соглашаетесь на то, что хуже отказа: подтверждено в ${sessions(hits)}.`,
      },
    ),
  ]
}

/** Навыки, освоенные именно этой сессией: то, что стоит показать сразу после разбора. */
export function newlyMastered(runs: RunRecord[]): Skill[] {
  if (!runs.length) return []
  const before = skills(runs.slice(0, -1))
  return skills(runs).filter(
    (s) => s.status === 'mastered' && before.find((b) => b.id === s.id)?.status !== 'mastered',
  )
}

/** Какой сценарий стоит пройти следующим — под слабое место, а не по порядку. */
export function suggestScenario(runs: RunRecord[], all: Scenario[]): Scenario | undefined {
  const scored = runs.filter((r) => !r.training)
  const played = new Set(scored.map((r) => r.scenarioId))
  const unplayed = all.find((s) => !played.has(s.id))
  if (unplayed) return unplayed

  const worst = [...scored].sort((a, b) => a.total - b.total)[0]
  return all.find((s) => s.id === worst?.scenarioId)
}
