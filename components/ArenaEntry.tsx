'use client'

import { useEffect, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { applyConfig } from '@/lib/admin/config'
import { decodeConfig, encodeConfig } from '@/lib/admin/link'
import { saveConfig, saveMode, tunedScenario } from '@/lib/admin/storage'
import { ArenaClient } from './ArenaClient'

/**
 * Вход в переговоры.
 *
 * Если администратор задал контекст для этого кейса, играется настроенный
 * сценарий, а не библиотечный. Настройка лежит в браузере, поэтому читается
 * только на клиенте — до этого экран не рисуется, чтобы не мигнуть базовой
 * версией и не сбросить состояние на первом же кадре.
 *
 * Настройка из адреса важнее сохранённой: участник открыл ссылку
 * администратора именно ради неё. Разобранная настройка тут же ложится в
 * браузер, чтобы обновление страницы не сбросило сессию к библиотечному кейсу.
 *
 * Та же настройка уходит на сервер с каждым ходом (`configCode`). Вердикты по
 * пакету и промпт модели считаются там, и без неё сервер играл бы библиотечный
 * кейс: другое имя, другая сложность, другое число раундов.
 */
export function ArenaEntry({ base }: { base: Scenario }) {
  const [resolved, setResolved] = useState<{ scenario: Scenario; configured: boolean; configCode?: string } | null>(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('cfg')
    const fromLink = code ? decodeConfig([base], code) : null
    if (fromLink) {
      saveConfig(fromLink.cfg)
      saveMode(fromLink.mode)
      setResolved({
        scenario: applyConfig(base, fromLink.cfg),
        configured: true,
        configCode: encodeConfig(base, fromLink.cfg),
      })
      return
    }
    const tuned = tunedScenario(base)
    setResolved({ ...tuned, configCode: tuned.cfg ? encodeConfig(base, tuned.cfg) : undefined })
  }, [base])

  if (!resolved) return <div className="min-h-dvh bg-paper" />

  return (
    <ArenaClient
      key={`${resolved.scenario.title}|${resolved.scenario.archetype}|${resolved.scenario.userBatna.value}`}
      scenario={resolved.scenario}
      configCode={resolved.configCode}
    />
  )
}
