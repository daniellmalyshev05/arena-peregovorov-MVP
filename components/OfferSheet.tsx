'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGroup, MotionConfig, motion } from 'motion/react'
import type { Deal, NegotiationState, Scenario } from '@/lib/types'
import { optionOf, utility } from '@/lib/engine/utility'

/**
 * Сборка предложения.
 *
 * Условия автоматически раскладываются на «отдаём» и «получаем взамен» —
 * уступка без встречного условия становится видна ещё до отправки.
 * Выигрыш оппонента НЕ показывается: узнать его можно только отправив пакет,
 * иначе игра выдаёт скрытую модель и тренировка теряет смысл.
 *
 * Переход условия между колонками анимирован: пакет собирается на глазах,
 * а кнопка не исчезает из-под курсора рывком.
 */
export function OfferSheet({
  scenario,
  state,
  onClose,
  onSend,
  busy,
}: {
  scenario: Scenario
  state: NegotiationState
  onClose: () => void
  onSend: (offer: Deal, text: string) => void
  busy: boolean
}) {
  const open = scenario.issues.filter((i) => state.visibleIssues.includes(i.id))
  const [draft, setDraft] = useState<Deal>(() => ({ ...state.deal }))
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

  const picker = (issueId: string) => {
    const issue = open.find((i) => i.id === issueId)!
    return (
      <motion.div
        key={issue.id}
        layoutId={`issue-${issue.id}`}
        layout="position"
        transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
      >
        <div className="mb-2 text-small">{issue.label}</div>
        <div className="flex flex-wrap gap-[5px]">
          {issue.options.map((o) => {
            const active = draft[issue.id] === o.id
            return (
              <button
                key={o.id}
                onClick={() => setDraft((d) => ({ ...d, [issue.id]: o.id }))}
                className={`press num flex h-[30px] items-center rounded-sm px-2.5 text-caption ${
                  active
                    ? 'border-[1.5px] border-accent bg-accent-soft font-semibold text-accent'
                    : 'border border-line-strong bg-rail text-ink2 hover:border-accent-line hover:bg-surface hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </motion.div>
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
              className="press ml-auto rounded-sm p-1 text-ink2 hover:bg-line2"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <LayoutGroup>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="border-r border-line2">
                  <div className="sticky top-0 z-10 border-b border-line2 bg-surface px-5 py-2.5 sm:px-[22px]">
                    <div className="lbl text-danger">Отдаём</div>
                  </div>
                  <div className="flex flex-col gap-[18px] px-5 pb-5 pt-4 sm:px-[22px]">
                    {groups.give.length ? groups.give.map((i) => picker(i.id)) : (
                      <p className="text-small text-ink3">Пока вы ничего не отдаёте.</p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="sticky top-0 z-10 border-b border-line2 bg-surface px-5 py-2.5 sm:px-[22px]">
                    <div className="lbl text-accent">Получаем взамен</div>
                  </div>
                  <div className="flex flex-col gap-[18px] px-5 pb-5 pt-4 sm:px-[22px]">
                    {groups.get.length ? groups.get.map((i) => picker(i.id)) : (
                      <p className="text-small text-ink3">Пока вы ничего не просите взамен.</p>
                    )}
                  </div>
                </div>
              </div>

              {groups.same.length > 0 && (
                <div className="border-t border-line2">
                  <div className="sticky top-0 z-10 border-b border-line2 bg-surface px-5 py-2.5 sm:px-[22px]">
                    <div className="lbl">Без изменений</div>
                  </div>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-[18px] px-5 pb-5 pt-4 sm:grid-cols-2 sm:px-[22px]">
                    {groups.same.map((i) => picker(i.id))}
                  </div>
                </div>
              )}
            </LayoutGroup>

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
              <div className="mb-[6px] flex items-baseline justify-between gap-3">
                <span className="text-small">Ваш выигрыш к запасному варианту</span>
                <span className="num whitespace-nowrap text-small font-semibold">
                  <span className="text-ink3">{pct(before) >= 0 ? '+' : ''}{pct(before)}%</span>
                  <span className="text-ink3"> → </span>
                  <span className={pct(after) < 0 ? 'text-danger' : 'text-accent'}>
                    {pct(after) >= 0 ? '+' : ''}{pct(after)}%
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
                  : 'Насколько пакет устроит вторую сторону, покажет только ответ.'}
              </p>
            </div>

            <button
              onClick={() => onSend(draft, text.trim())}
              disabled={busy || nothingChanged || text.trim().length < 8}
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
