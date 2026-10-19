'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { arcadeOpponents, type ArcadeLevel } from '@/lib/arcade/opponents'
import { bestTimes, clock } from '@/lib/arcade/records'
import { IconBack, LessonIcon } from './icons'

const LEVEL: Record<ArcadeLevel, string> = { easy: 'Лёгкий', medium: 'Средний', boss: 'Босс' }
const LESSON = { exchange: 'Обмен', questions: 'Вопросы', criteria: 'Критерии' } as const

export function ArcadeLobby() {
  const [best, setBest] = useState<Record<string, number>>({})
  useEffect(() => setBest(bestTimes()), [])

  return (
    <main className="arc-lobby">
      <Link href="/" className="arc-back">
        <IconBack size={18} />В меню
      </Link>

      <header className="arc-lobby-head">
        <h1>Аркада</h1>
        <p>Три соперника на выбор, две минуты на переговоры. Шкала соперника — его намерение: чем меньше, тем легче договориться.</p>
      </header>

      <ol className="arc-roster">
        {arcadeOpponents.map((o, i) => {
          const record = best[o.scenario.id]
          return (
            <li key={o.scenario.id} style={{ ['--i' as string]: i }} data-level={o.level}>
              <Link href={`/arcade/${o.scenario.id}`} className="arc-card">
                <span className="arc-card-face">
                  <img src={`/arcade/${o.scenario.persona.portrait}`} alt="" />
                </span>
                <span className="arc-card-level">{LEVEL[o.level]}</span>
                <span className="arc-card-title">{o.scenario.title}</span>
                <span className="arc-card-situation">{o.situation}</span>
                <span className="arc-card-meta">
                  <span className="arc-card-lesson">
                    <LessonIcon lesson={o.lesson} size={16} />
                    Чему учит: {LESSON[o.lesson]}
                  </span>
                  {record !== undefined && <span className="arc-card-best">Лучшее: {clock(record)}</span>}
                </span>
                <span className="arc-card-go">Начать переговоры</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
