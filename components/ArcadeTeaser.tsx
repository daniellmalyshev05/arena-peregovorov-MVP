'use client'

import '@fontsource/dela-gothic-one/cyrillic-400.css'
import { useEffect, useState } from 'react'
import { arcadeOpponents, type ArcadeLevel } from '@/lib/arcade/opponents'
import { bestTimes, clock } from '@/lib/arcade/records'

const LEVEL: Record<ArcadeLevel, { label: string; className: string }> = {
  easy: { label: 'Лёгкий', className: 'bg-[#3fd9c9] text-[#141a3c]' },
  medium: { label: 'Средний', className: 'bg-[#ffd23f] text-[#141a3c]' },
  boss: { label: 'Босс', className: 'bg-[#ff4b3e] text-white' },
}

/**
 * Раздел аркады в холле — второй уровень рядом со «Сценариями»: тот же
 * заголовок, а соперники лежат в зоне, которая начинается цветом продукта
 * и уходит в ночную палитру аркады. Плитка ведёт прямо к сопернику.
 */
export function ArcadeTeaser() {
  const [best, setBest] = useState<Record<string, number>>({})
  useEffect(() => setBest(bestTimes()), [])

  return (
    <section className="mt-12" aria-labelledby="hall-arcade">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="hall-arcade" className="lbl">
          Аркада
        </h2>
        <span className="lbl sm:ml-auto">три соперника, две минуты на переговоры</span>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2.5 rounded-lg bg-[linear-gradient(135deg,#1e5c41_0%,#141a3c_70%)] p-2.5 sm:grid-cols-3 sm:gap-3 sm:p-3">
        {arcadeOpponents.map((o) => {
          const level = LEVEL[o.level]
          const record = best[o.scenario.id]
          return (
            <li key={o.scenario.id}>
              <a
                href={`/arcade/${o.scenario.id}`}
                className="press flex h-full items-start gap-3.5 rounded-md border border-white/10 bg-white/[0.06] p-3.5 text-white transition-colors duration-200 sm:flex-col sm:gap-3 sm:p-4 [@media(hover:hover)_and_(pointer:fine)]:hover:border-[#ffd23f] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/[0.1]"
              >
                <img
                  src={`/arcade/thumb-${o.scenario.persona.portrait}`}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full border-2 border-white/20 object-cover"
                />
                <span className="flex min-w-0 flex-col items-start gap-1.5">
                  <span className={`rounded px-2 py-0.5 font-['Dela_Gothic_One'] text-[11px] leading-[1.4] ${level.className}`}>
                    {level.label}
                  </span>
                  <span className="font-['Dela_Gothic_One'] text-[17px] leading-tight">{o.scenario.title}</span>
                  <span className="text-small leading-snug text-[#c3cbf0] text-pretty">{o.situation}</span>
                  {record !== undefined && (
                    <span className="text-caption font-semibold text-[#ffd23f] tabular-nums">Лучшее: {clock(record)}</span>
                  )}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
