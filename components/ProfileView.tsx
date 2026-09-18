'use client'

import { useEffect, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { clearRuns, loadRuns, patterns, type RunRecord } from '@/lib/profile'
import { adaptationLevel, adaptationTargets, computeAdaptation } from '@/lib/engine/adaptive'
import { count, plural } from '@/lib/plural'

const STATUS_LABEL: Record<string, string> = {
  deal: 'сделка',
  walkaway: 'выход',
  timeout: 'без соглашения',
  active: 'не закончено',
}

/**
 * Профиль переговорщика.
 *
 * Не «уровень 7», а список устойчивых привычек. Паттерн появляется только
 * после двух зачётных сессий — иначе это не привычка, а один случай.
 */
export function ProfileView({ scenarios }: { scenarios: Scenario[] }) {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [ready, setReady] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    setRuns(loadRuns())
    setReady(true)
  }, [])

  const scored = runs.filter((r) => !r.training)
  const found = patterns(runs)
  const adaptation = computeAdaptation(runs)
  const weak = found.filter((p) => p.tone === 'weak')
  const strong = found.filter((p) => p.tone === 'strong')
  const name = (id: string) => scenarios.find((s) => s.id === id)?.title ?? id

  return (
    <main className="min-h-dvh bg-paper">
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:px-5">
        <a href="/" aria-label="К списку сценариев" className="press rounded-sm p-1 text-ink2 hover:bg-line2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </a>
        <span className="font-semibold">Профиль переговорщика</span>
      </header>

      <div className="mx-auto max-w-[900px] px-6 py-10 sm:px-8">
        {!ready ? null : scored.length === 0 ? (
          <div className="rise max-w-[560px]">
            <h1 className="text-h2 font-semibold leading-tight">Профиль пока пуст</h1>
            <p className="mt-3 leading-relaxed text-ink2">
              Пройдите любой сценарий до конца — и здесь начнут накапливаться привычки: где вы
              уступаете, каких вопросов не задаёте, насколько точно понимаете вторую сторону.
            </p>
            <a
              href="/"
              className="press mt-6 inline-flex h-11 items-center rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
            >
              К сценариям
            </a>
          </div>
        ) : (
          <div className="stagger">
            <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
              <div>
                <h1 className="text-h2 font-semibold leading-tight tracking-[-0.016em] text-balance">
                  {weak.length
                    ? 'Вот что повторяется от переговоров к переговорам'
                    : 'Устойчивых слабых мест пока не видно'}
                </h1>
                <p className="mt-2.5 max-w-[620px] leading-relaxed text-ink2">
                  Считается только по зачётным сессиям. Переигранные моменты сюда не попадают.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="mono text-h1 font-semibold leading-none">{scored.length}</div>
                <div className="lbl mt-1">{plural(scored.length, ['сессия', 'сессии', 'сессий'])}</div>
              </div>
            </div>

            <div>
              {found.length === 0 && (
                <p className="mt-8 rounded-md border border-line bg-surface px-5 py-4 text-ink2">
                  Нужно как минимум {count(2, ['зачётная сессия', 'зачётные сессии', 'зачётных сессий'])}, чтобы
                  отличить привычку от случайности.
                </p>
              )}

              {weak.length > 0 && (
                <section className="mt-9">
                  <div className="lbl mb-3">Над чем работать</div>
                  <div className="flex flex-col gap-2.5">
                    {weak.map((p) => (
                      <div key={p.id} className="rounded-md border border-line bg-surface px-5 py-4">
                        <div className="font-semibold">{p.title}</div>
                        <div className="mt-1 text-small leading-snug text-ink2">{p.detail}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {strong.length > 0 && (
                <section className="mt-8">
                  <div className="lbl mb-3">Что уже держится</div>
                  <div className="flex flex-col gap-2.5">
                    {strong.map((p) => (
                      <div key={p.id} className="rounded-md border border-accent-line bg-accent-soft px-5 py-4">
                        <div className="font-semibold text-accent">{p.title}</div>
                        <div className="mt-1 text-small leading-snug text-ink2">{p.detail}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Прогрессия. В тренажёрах прокачивают персонажа — здесь растёт
                вторая сторона, и это единственное место, где рост видно целиком. */}
            <section className="mt-10">
              <div className="lbl mb-3 border-b border-line pb-2">Какой будет вторая сторона</div>
              {adaptation.targets.length === 0 ? (
                <p className="rounded-md border border-line bg-surface px-5 py-4 leading-relaxed text-ink2">
                  Играет по базовым настройкам кейса. Жёстче она станет адресно — там, где привычка
                  повторяется: уступки без встречного условия поднимают её аппетит, редкие вопросы
                  закрывают её интересы, ставка без опоры на факты делает её упрямее.
                </p>
              ) : (
                <div className="rounded-md border border-accent-line bg-accent-soft px-5 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-accent">Тяжелее: {adaptationLevel(adaptation)}</span>
                    <span className="num text-small text-ink2">
                      уровень притязаний +{adaptation.aspiration.toFixed(1)}, порог отказа +{adaptation.floor.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-2 text-small leading-snug text-ink2">
                    Вторая сторона стала сильнее не вообще, а против вас. Подкрутка ограничена сверху:
                    проверено, что и в таком виде кейс проходим.
                  </p>
                  <ul className="mt-3.5 flex flex-col gap-2">
                    {adaptationTargets(adaptation).map((t) => (
                      <li key={t.id} className="flex gap-2.5">
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        {/* Одной строкой: причина уже названа выше, в «над чем
                            работать», — здесь важно поведение, а не повтор диагноза. */}
                        <span className="min-w-0 text-small leading-snug">
                          <span className="font-semibold">{t.title}</span>
                          <span className="text-ink2"> — {t.cause}.</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="mt-10">
              <div className="lbl mb-2 border-b border-line pb-2">История</div>
              <table className="w-full text-small">
                <tbody>
                  {[...scored].reverse().map((r, i) => (
                    <tr key={i} className="border-b border-line2">
                      <td className="py-2.5">{name(r.scenarioId)}</td>
                      <td className="py-2.5 text-ink3">{STATUS_LABEL[r.status] ?? r.status}</td>
                      <td className="num py-2.5 text-right text-ink2">
                        {r.revealed}/{r.interests} интересов
                      </td>
                      <td className="mono py-2.5 pl-6 text-right font-semibold">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Очистка профиля подтверждается на месте, а не окном браузера. */}
            <div className="mt-8">
              {confirmClear ? (
                <div className="rise max-w-[480px] rounded-md border border-danger/40 bg-surface p-4">
                  <p className="text-small leading-snug text-ink2">
                    Очистить профиль? История сессий будет удалена без возможности восстановления.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        clearRuns()
                        setRuns([])
                        setConfirmClear(false)
                      }}
                      className="press h-9 rounded-md bg-danger px-4 text-caption font-semibold text-white"
                    >
                      Очистить
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="press h-9 rounded-md border border-line px-4 text-caption text-ink2 hover:border-ink3"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="press h-9 rounded-md border border-line px-4 text-small text-ink3 hover:border-danger hover:text-danger"
                >
                  Очистить профиль
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
