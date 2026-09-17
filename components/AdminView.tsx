'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { applyConfig, defaultConfig, DIFFICULTY_LABELS, TONES, type AdminConfig } from '@/lib/admin/config'
import { encodeConfig } from '@/lib/admin/link'
import { clearConfig, loadConfig, loadMode, saveConfig, saveMode, type OpponentMode } from '@/lib/admin/storage'
import { auditScenario } from '@/lib/engine/audit'
import { ScenarioMap } from './ScenarioMap'

/**
 * Контур администратора (ТЗ §2.2, §2.3).
 *
 * Отличие от обычной формы с полями: каждая настройка тут же проверяется
 * движком. Администратор не просто задаёт контекст — он видит доказательство,
 * что в получившемся кейсе есть чему учиться. Считается перебором всех
 * достижимых соглашений, детерминированно, без обращений к сети.
 */
export function AdminView({ scenarios }: { scenarios: Scenario[] }) {
  const linkField = useRef<HTMLInputElement>(null)
  const [cfg, setCfg] = useState<AdminConfig>(() => defaultConfig(scenarios[0]))
  const [saved, setSaved] = useState(false)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<OpponentMode>('auto')
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const stored = loadConfig()
    if (stored && scenarios.some((s) => s.id === stored.baseScenarioId)) {
      setCfg(stored)
      setSaved(true)
    }
    setMode(loadMode())
    setOrigin(window.location.origin)
    setReady(true)
  }, [scenarios])

  const base = scenarios.find((s) => s.id === cfg.baseScenarioId) ?? scenarios[0]
  const tuned = useMemo(() => applyConfig(base, cfg), [base, cfg])
  const audit = useMemo(() => auditScenario(tuned), [tuned])

  const set = <K extends keyof AdminConfig>(k: K, v: AdminConfig[K]) => {
    setCfg((c) => ({ ...c, [k]: v }))
    setSaved(false)
  }

  // Ссылка пересобирается на каждое изменение: администратор всегда копирует то, что видит.
  const link = origin ? `${origin}/arena/${base.id}?cfg=${encodeConfig(base, cfg, mode)}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Буфер недоступен — поле выделяется, и ссылку можно скопировать руками.
      linkField.current?.select()
    }
  }

  const field = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-small outline-none focus:border-accent-line'
  const blockers = audit.issues.filter((i) => i.severity === 'blocker')
  const warnings = audit.issues.filter((i) => i.severity === 'warning')

  return (
    <main className="min-h-dvh bg-paper">
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:px-5">
        <a href="/" aria-label="К списку сценариев" className="press shrink-0 rounded-sm p-1 text-ink2 hover:bg-line2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </a>
        <span className="font-semibold">Настройка симуляции</span>
        <span className="hidden text-ink3 lg:inline">·</span>
        <span className="hidden text-small text-ink2 lg:inline">контур администратора</span>
        {saved && (
          <span className="num ml-auto rounded-sm bg-accent-soft px-2 py-1 text-caption font-semibold text-accent">
            настройка активна
          </span>
        )}
      </header>

      {!ready ? null : (
        <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:px-8">
          {/* Настройки */}
          <div className="flex flex-col gap-6">
            <div>
              <div className="lbl mb-2">Кейс-основа</div>
              <div className="flex flex-col gap-1.5">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setCfg({ ...defaultConfig(s) }); setSaved(false) }}
                    className={`press rounded-md border px-3.5 py-2.5 text-left ${
                      s.id === cfg.baseScenarioId ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent-line'
                    }`}
                  >
                    <div className={`text-small ${s.id === cfg.baseScenarioId ? 'font-semibold text-accent' : ''}`}>{s.title}</div>
                    <div className="mt-0.5 text-caption text-ink3">{s.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="lbl mb-1.5 block">Сфера</span>
                <input className={field} value={cfg.sphere} onChange={(e) => set('sphere', e.target.value)} placeholder="Промышленность, ИТ, закупки…" />
              </label>
              <label className="block">
                <span className="lbl mb-1.5 block">Тема переговоров</span>
                <input className={field} value={cfg.topic} onChange={(e) => set('topic', e.target.value)} placeholder="О чём торг" />
              </label>
            </div>

            <div>
              <div className="lbl mb-2">
                Сложность · <span className="text-ink2">{DIFFICULTY_LABELS[cfg.difficulty]}</span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => set('difficulty', d)}
                    className={`press num h-9 flex-1 rounded-md border text-small ${
                      d === cfg.difficulty ? 'border-accent bg-accent font-semibold text-white' : 'border-line bg-surface text-ink2 hover:border-accent-line'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-caption leading-snug text-ink3">
                Сложность сдвигает пороги отказа обеих сторон навстречу друг другу. Зона соглашения на карте справа сужается — договориться становится физически труднее.
              </p>
            </div>

            <div>
              <div className="lbl mb-2">Тон собеседника</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => set('tone', t.value)}
                    className={`press rounded-md border px-3 py-2.5 text-left ${
                      t.value === cfg.tone ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent-line'
                    }`}
                  >
                    <div className={`text-small ${t.value === cfg.tone ? 'font-semibold text-accent' : ''}`}>{t.label}</div>
                    <div className="mt-0.5 text-caption leading-snug text-ink3">{t.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="lbl mb-1.5 block">Имя собеседника</span>
                <input className={field} value={cfg.opponentName} onChange={(e) => set('opponentName', e.target.value)} />
              </label>
              <label className="block">
                <span className="lbl mb-1.5 block">Его роль</span>
                <input className={field} value={cfg.opponentRole} onChange={(e) => set('opponentRole', e.target.value)} />
              </label>
            </div>

            <label className="block">
              <span className="lbl mb-1.5 block">Чего он добивается</span>
              <textarea className={field} rows={2} value={cfg.opponentGoal} onChange={(e) => set('opponentGoal', e.target.value)} />
              <span className="mt-1.5 block text-caption text-ink3">Становится его публичной позицией — тем, с чего он начнёт разговор.</span>
            </label>

            <div>
              <div className="lbl mb-2">Режим оппонента</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <button
                  onClick={() => { setMode('auto'); saveMode('auto') }}
                  className={`press rounded-md border px-3 py-2.5 text-left ${
                    mode === 'auto' ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent-line'
                  }`}
                >
                  <div className={`text-small ${mode === 'auto' ? 'font-semibold text-accent' : ''}`}>
                    Модель · основной
                  </div>
                  <div className="mt-0.5 text-caption leading-snug text-ink3">
                    Оппонента играет языковая модель. Если она не ответит, ход подхватит запасной движок.
                  </div>
                </button>
                <button
                  onClick={() => { setMode('offline'); saveMode('offline') }}
                  className={`press rounded-md border px-3 py-2.5 text-left ${
                    mode === 'offline' ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent-line'
                  }`}
                >
                  <div className={`text-small ${mode === 'offline' ? 'font-semibold text-accent' : ''}`}>
                    Запасной · без сети
                  </div>
                  <div className="mt-0.5 text-caption leading-snug text-ink3">
                    Оппонент играется движком на правилах. Ни одного обращения наружу — страховка на показ.
                  </div>
                </button>
              </div>
              <p className="mt-2 text-caption leading-snug text-ink3">
                Вся экономика сделки, вердикты по предложениям и подсчёт результата считаются кодом в обоих режимах.
                Режим меняет только то, кто формулирует реплики.
              </p>
            </div>

            <label className="block max-w-[200px]">
              <span className="lbl mb-1.5 block">Раундов в сессии</span>
              <input type="number" min={4} max={24} className={field} value={cfg.rounds} onChange={(e) => set('rounds', Number(e.target.value))} />
            </label>
          </div>

          {/* Проверка */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
            <div className={`rounded-lg border px-5 py-4 ${audit.playable ? 'border-accent-line bg-accent-soft' : 'border-danger bg-danger-soft'}`}>
              <div className="flex items-center gap-2">
                {audit.playable ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                )}
                <span className={`font-semibold ${audit.playable ? 'text-accent' : 'text-danger'}`}>
                  {audit.playable ? 'Сценарий играбелен' : 'Сценарий вырожден'}
                </span>
              </div>
              <p className="mt-2 text-small leading-snug text-ink2">
                {audit.playable
                  ? 'Зона соглашения существует, позиционный торг наказывается, у сторон есть что обменивать.'
                  : 'В таком виде играть нельзя — ниже сказано, что именно сломано.'}
              </p>
              {blockers.map((i, n) => (
                <p key={n} className="mt-2 text-small leading-snug text-danger">✗ {i.text}</p>
              ))}
              {warnings.map((i, n) => (
                <p key={n} className="mt-2 text-small leading-snug text-ink2">! {i.text}</p>
              ))}
            </div>

            <div className="rounded-lg border border-line bg-surface px-5 py-4">
              <div className="lbl mb-3">Пространство соглашений</div>
              <ScenarioMap scenario={tuned} />
            </div>

            <div className="rounded-lg border border-line bg-surface px-5 py-4">
              <dl className="flex flex-col gap-2.5 text-small">
                <Row label="Зона, где выигрывают обе стороны">
                  <span className="num font-semibold">{(audit.zopaShare * 100).toFixed(1)}%</span>
                  <span className="text-ink3"> из {audit.totalDeals} вариантов</span>
                </Row>
                <Row label="Цена позиционного торга">
                  <span className="num font-semibold text-danger">{audit.positional.userSurplus.toFixed(1)}</span>
                </Row>
                <Row label="Максимум совместной ценности">
                  <span className="num font-semibold">+{audit.maxJointSurplus.toFixed(1)}</span>
                </Row>
                <Row label="Дешевле всего отдать">
                  <span className="text-ink2">{audit.cheapestToGive.label}</span>
                </Row>
                <Row label="Важнее всего удержать">
                  <span className="text-ink2">{audit.mostImportantToHold.label}</span>
                </Row>
              </dl>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <a
                href={`/arena/${base.id}`}
                onClick={() => saveConfig(cfg)}
                className={`press flex h-11 flex-1 items-center justify-center rounded-md px-5 font-semibold text-white ${
                  audit.playable ? 'bg-accent hover:opacity-90' : 'pointer-events-none bg-ink3'
                }`}
              >
                Сохранить и открыть переговоры
              </a>
              <button
                onClick={() => { clearConfig(); setCfg(defaultConfig(base)); setSaved(false) }}
                className="press h-11 rounded-md border border-line bg-surface px-4 text-small text-ink2 hover:border-danger hover:text-danger"
              >
                Сбросить
              </button>
            </div>

            <div className="rounded-lg border border-line bg-surface px-5 py-4">
              <div className="lbl mb-2">Ссылка для участников</div>
              <p className="text-caption leading-snug text-ink3">
                Настройка зашита в сам адрес. Кто откроет ссылку, начнёт переговоры в этой конфигурации на своём
                компьютере — без входа и без общей базы.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  ref={linkField}
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Ссылка с настройкой"
                  className="num h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-caption text-ink2 outline-none focus:border-accent-line"
                />
                <button
                  onClick={copyLink}
                  className={`press h-9 shrink-0 rounded-md border px-3.5 text-caption font-semibold ${
                    copied
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line-strong bg-surface text-ink2 hover:border-accent hover:bg-accent-soft hover:text-accent'
                  }`}
                >
                  {copied ? 'Скопирована' : 'Скопировать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line2 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-ink2">{label}</dt>
      <dd className="shrink-0 text-right">{children}</dd>
    </div>
  )
}
