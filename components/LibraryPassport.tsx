'use client'

import { useEffect, useRef, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { auditScenario } from '@/lib/engine/audit'
import { arcadeOpponents } from '@/lib/arcade/opponents'
import { checkCustomScenario, CUSTOM_PREFIX } from '@/lib/admin/scenario-schema'
import type { CustomCase } from '@/lib/admin/custom'
import { num, signed } from '@/lib/text'

/**
 * Паспорт библиотеки: один и тот же аудит для каждого кейса — сценариев,
 * соперников аркады и созданных в этом браузере.
 *
 * Аудит перебирает все варианты сделки, поэтому таблица считается по кнопке
 * и по строке за кадр: страница не замирает, строки заполняются по очереди.
 *
 * Здесь же загрузка кейса из JSON: файл проходит ту же проверку, что и
 * сгенерированный кейс.
 */

type Kind = 'сценарий' | 'аркада' | 'новый кейс'
type Row = { scenario: Scenario; kind: Kind; audit?: { playable: boolean; zopa: number; positional: number } }

export function LibraryPassport({
  scenarios,
  custom,
  onImported,
}: {
  scenarios: Scenario[]
  custom: CustomCase[]
  onImported: (entry: CustomCase) => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [importError, setImportError] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const list: Row[] = [
      ...scenarios.map((scenario) => ({ scenario, kind: 'сценарий' as const })),
      ...arcadeOpponents.map((o) => ({ scenario: o.scenario, kind: 'аркада' as const })),
      ...custom.map((c) => ({ scenario: c.scenario, kind: 'новый кейс' as const })),
    ]
    setRows(list)
    let i = 0
    let frame = 0
    const next = () => {
      if (i >= list.length) return
      const n = i++
      const a = auditScenario(list[n].scenario)
      setRows((prev) =>
        prev.map((r, k) =>
          k === n ? { ...r, audit: { playable: a.playable, zopa: a.zopaShare, positional: a.positional.userSurplus } } : r,
        ),
      )
      frame = requestAnimationFrame(next)
    }
    frame = requestAnimationFrame(next)
    return () => cancelAnimationFrame(frame)
  }, [open, scenarios, custom])

  const load = async (picked: File | undefined) => {
    setImportError(false)
    if (!picked) return
    try {
      const raw = JSON.parse(await picked.text()) as Record<string, unknown>
      // Кейс библиотеки или чужой файл получает свой id: иначе сервер примет его за библиотечный.
      const id =
        typeof raw?.id === 'string' && raw.id.startsWith(CUSTOM_PREFIX) ? raw.id : `${CUSTOM_PREFIX}${Date.now().toString(36)}`
      const scenario = checkCustomScenario({ ...raw, id })
      if (!scenario) throw new Error('invalid')
      onImported({ scenario, brief: { sphere: '', topic: '', goal: '' }, createdAt: Date.now() })
    } catch {
      setImportError(true)
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  return (
    <section className="border-t border-line pt-6">
      <div className="lbl mb-1">Паспорт библиотеки</div>
      <p className="text-caption leading-snug text-ink3">
        Каждый кейс проходит один и тот же аудит алгоритма — и написанный вручную, и созданный моделью.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="press h-11 rounded-md border border-line-strong bg-surface px-3.5 text-caption font-semibold text-ink2 hover:border-accent hover:text-accent md:h-9"
        >
          {open ? 'Свернуть' : 'Показать аудит всех кейсов'}
        </button>
        <button
          onClick={() => file.current?.click()}
          className="press h-11 rounded-md border border-line-strong bg-surface px-3.5 text-caption font-semibold text-ink2 hover:border-accent hover:text-accent md:h-9"
        >
          Загрузить кейс из JSON
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </div>
      {importError && (
        <p role="status" className="rise mt-2 text-caption text-danger">
          Файл не похож на кейс Арены или не прошёл аудит
        </p>
      )}

      {open && (
        <div className="rise mt-4 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[520px] text-left text-small">
            <thead>
              <tr className="border-b border-line">
                <th className="lbl px-3.5 py-2.5 font-semibold">Кейс</th>
                <th className="lbl px-3 py-2.5 text-right font-semibold">Зона соглашения</th>
                <th className="lbl px-3 py-2.5 text-right font-semibold">Позиционный торг</th>
                <th className="lbl px-3.5 py-2.5 font-semibold">Аудит</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.scenario.id}`} className="border-b border-line2 last:border-0">
                  <td className="px-3.5 py-2.5">
                    <span className="text-ink">{r.scenario.title}</span>
                    <span className="lbl ml-2 whitespace-nowrap">{r.kind}</span>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink2">{r.audit ? `${num(r.audit.zopa * 100)}%` : '…'}</td>
                  <td className="num px-3 py-2.5 text-right text-ink2">{r.audit ? signed(r.audit.positional) : '…'}</td>
                  <td className="px-3.5 py-2.5">
                    {r.audit &&
                      (r.audit.playable ? (
                        <span className="inline-flex items-center gap-1.5 text-accent">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          играбелен
                        </span>
                      ) : (
                        <span className="text-danger">требует доработки</span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
