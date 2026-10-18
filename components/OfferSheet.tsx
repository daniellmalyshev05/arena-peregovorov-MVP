'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGroup, MotionConfig, motion } from 'motion/react'
import type { Deal, NegotiationState, Scenario } from '@/lib/types'
import { optionOf, utility } from '@/lib/engine/utility'
import { signed } from '@/lib/text'

/**
 * Сборка предложения.
 *
 * Условия автоматически раскладываются на «отдаём» и «получаем взамен» —
 * уступка без встречного условия становится видна ещё до отправки.
 * Выигрыш оппонента НЕ показывается: узнать его можно только отправив пакет,
 * иначе игра выдаёт скрытую модель и тренировка теряет смысл.
 *
 * Строки условий стоят на месте — выбранный вариант не уезжает из-под курсора.
 * Что отдаём и что получаем, видно в сводке сверху: условие переезжает туда,
 * как только меняется его уровень.
 */
export function OfferSheet({
  scenario,
  state,
  initial,
  onClose,
  onSend,
  busy,
}: {
  scenario: Scenario
  state: NegotiationState
  /** С чего начинается черновик: последний отправленный пакет или встречное второй стороны. */
  initial?: Deal
  onClose: () => void
  onSend: (offer: Deal, text: string) => void
  busy: boolean
}) {
  const open = scenario.issues.filter((i) => state.visibleIssues.includes(i.id))
  // Черновик начинается с последнего пакета, чтобы после встречного или отказа
  // не потерять уже согласованные условия.
  const [draft, setDraft] = useState<Deal>(() => {
    const seeded: Deal = { ...state.deal }
    for (const issue of open) {
      const id = initial?.[issue.id]
      if (id && issue.options.some((o) => o.id === id)) seeded[issue.id] = id
    }
    return seeded
  })
  const [text, setText] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  // Escape закрывает шторку, фокус уходит внутрь и возвращается на кнопку.
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.querySelector<HTMLElement>('button, textarea')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      returnFocus.current?.focus?.()
    }
  }, [onClose])

  const groups = useMemo(() => {
    const give: typeof open = []
    const get: typeof open = []
    const same: typeof open = []
    for (const issue of open) {
      const now = optionOf(issue, state.deal[issue.id]).valueUser
      const next = optionOf(issue, draft[issue.id]).valueUser
      if (next < now) give.push(issue)
      else if (next > now) get.push(issue)
      else same.push(issue)
    }
    return { give, get, same }
  }, [draft, open, state.deal])

  const before = utility(scenario, state.deal, 'user')
  const after = utility(scenario, draft, 'user')
  const batna = scenario.userBatna.value
  const pct = (v: number) => Math.round(((v - batna) / batna) * 100)

  const unbalanced = groups.give.length > 0 && groups.get.length === 0
  const nothingChanged = groups.give.length === 0 && groups.get.length === 0
  // Формулировка короче восьми знаков не отправляется — показываем подсказку.
  const needsWords = !nothingChanged && text.trim().length < 8

  const direction = (issueId: string): 'give' | 'get' | 'same' =>
    groups.give.some((i) => i.id === issueId) ? 'give' : groups.get.some((i) => i.id === issueId) ? 'get' : 'same'

  const row = (issueId: string) => {
    const issue = open.find((i) => i.id === issueId)!
    const dir = direction(issueId)
    return (
      <div
        key={issue.id}
        className={`relative grid grid-cols-1 gap-x-6 gap-y-2 border-b border-line2 px-5 py-3.5 transition-colors duration-200 last:border-0 sm:grid-cols-[190px_minmax(0,1fr)] sm:px-[22px] ${
          dir === 'give' ? 'bg-danger-soft/40' : dir === 'get' ? 'bg-accent-soft/50' : ''
        }`}
      >
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] transition-colors duration-200 ${
            dir === 'give' ? 'bg-danger' : dir === 'get' ? 'bg-accent' : 'bg-transparent'
          }`}
        />
        <span className="flex items-start gap-2 text-small leading-snug sm:pt-[6px]">
          {issue.label}
          {dir !== 'same' && (
            <span className={`mt-[3px] shrink-0 ${dir === 'give' ? 'text-danger' : 'text-accent'}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {dir === 'give' ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
              </svg>
              <span className="sr-only">{dir === 'give' ? 'Отдаём' : 'Получаем взамен'}</span>
            </span>
          )}
        </span>
        <div className="flex flex-wrap gap-[5px]">
          {issue.options.map((o) => {
            const active = draft[issue.id] === o.id
            return (
              <button
                key={o.id}
                onClick={() => setDraft((d) => ({ ...d, [issue.id]: o.id }))}
                aria-pressed={active}
                className={`press num flex h-[30px] items-center rounded-sm px-2.5 text-caption ${
                  active
                    ? 'border-[1.5px] border-accent bg-surface font-semibold text-accent'
                    : 'border border-line-strong bg-rail text-ink2 hover:border-accent-line hover:bg-surface hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Сводка пакета: условие переезжает между «отдаём» и «получаем», строки при этом стоят на месте.
  const ledger = (kind: 'give' | 'get') => {
    const items = kind === 'give' ? groups.give : groups.get
    return (
      <div className={`min-w-0 px-5 py-3 sm:px-[22px] ${kind === 'give' ? 'border-r border-line2' : ''}`}>
        <div className={`lbl ${kind === 'give' ? 'text-danger' : 'text-accent'}`}>
          {kind === 'give' ? 'Отдаём' : 'Получаем взамен'}
          {items.length > 0 && <span className="num whitespace-nowrap">{'\u00a0'}· {items.length}</span>}
        </div>
        <div className="mt-2 flex min-h-[26px] flex-wrap items-center gap-1.5">
          {items.length ? (
            items.map((i) => (
              <motion.span
                key={i.id}
                layoutId={`ledger-${i.id}`}
                transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                className={`rounded-sm px-2 py-[3px] text-caption font-medium ${
                  kind === 'give' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent'
                }`}
              >
                {i.label}
              </motion.span>
            ))
          ) : (
            <span className="text-caption text-ink3">
              {kind === 'give' ? 'Пока вы ничего не отдаёте.' : 'Пока вы ничего не просите взамен.'}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="scrim-in fixed inset-0 z-50 flex items-center justify-center bg-ink/28 p-4 backdrop-blur-[1px] sm:p-6"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          className="sheet-in flex max-h-full w-full max-w-[760px] flex-col overflow-hidden rounded-lg bg-surface shadow-[0_24px_64px_rgba(26,28,25,0.22)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Собрать предложение"
        >
          <div className="flex shrink-0 items-start border-b border-line px-5 pb-4 pt-[18px] sm:px-[22px]">
            <div>
              <div className="text-lead font-semibold">Собрать предложение</div>
              <div className="mt-0.5 text-small text-ink2">
                Пакет уходит целиком: {scenario.persona.name.split(' ')[0]} ответит на него одним решением.
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="press tap -mr-1.5 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink2 hover:bg-line2 md:mr-0 md:h-8 md:w-8"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <LayoutGroup>
              <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-line bg-surface">
                {ledger('give')}
                {ledger('get')}
              </div>
            </LayoutGroup>
            <div>{open.map((i) => row(i.id))}</div>

            <div className="border-t border-line2 px-5 pt-4 sm:px-[22px]">
              <div className="lbl mb-2">Как вы это сформулируете</div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder="Своими словами: что вы предлагаете и почему это выгодно обеим сторонам"
                className="w-full resize-none rounded-md border border-line-strong bg-paper px-3.5 py-3 leading-relaxed outline-none transition-colors placeholder:text-ink3 focus:border-accent"
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-[22px] gap-y-4 px-5 pb-[18px] pt-4 sm:px-[22px]">
            <div className="min-w-[260px] flex-1">
              <div className="mb-2 flex items-end justify-between gap-3">
                <span className="text-small leading-snug text-ink2">Ваш выигрыш к запасному варианту</span>
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="num text-small text-ink3">{signed(pct(before), 0)}% →</span>
                  <span className={`mono text-title font-semibold leading-none ${pct(after) < 0 ? 'text-danger' : 'text-accent'}`}>
                    {signed(pct(after), 0)}%
                  </span>
                </span>
              </div>
              <div className="relative h-[5px] overflow-hidden rounded-full bg-line2">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${pct(after) < 0 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${Math.max(2, Math.min(100, ((after - batna + 22) / 55) * 100))}%` }}
                />
                <div className="absolute -inset-y-0.5 w-[1.5px] bg-ink2" style={{ left: `${(22 / 55) * 100}%` }} />
              </div>
              <p className={`mt-[7px] text-caption ${unbalanced ? 'text-danger' : 'text-ink3'}`}>
                {unbalanced
                  ? 'Вы отдаёте условие и не просите ничего взамен.'
                  : needsWords
                    ? 'Допишите пару слов: как вы это предложите. Формулировку услышит вторая сторона.'
                    : 'Насколько пакет устроит вторую сторону, покажет только ответ.'}
              </p>
            </div>

            <button
              onClick={() => onSend(draft, text.trim())}
              disabled={busy || nothingChanged || needsWords}
              className="press flex h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-[22px] font-semibold text-white hover:bg-accent/92 disabled:opacity-35"
            >
              {busy ? 'Отправляем…' : 'Отправить пакет'}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}
