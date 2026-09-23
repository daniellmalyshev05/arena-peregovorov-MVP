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
 * Если администратор задал контекст для кейса, играется настроенный сценарий.
 * Настройка лежит в браузере, поэтому экран рисуется только после чтения на
 * клиенте — иначе на первом кадре мелькнёт библиотечная версия.
 *
 * Настройка из адреса (`cfg`) важнее сохранённой и сразу сохраняется, чтобы
 * перезагрузка не сбросила сессию. С каждым ходом она уходит на сервер
 * (`configCode`): вердикты и промпт считаются там.
 */
export function ArenaEntry({ base }: { base: Scenario }) {
  const [resolved, setResolved] = useState<{ scenario: Scenario; configured: boolean; configCode?: string } | null>(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('cfg')
    const fromLink = code ? decodeConfig([base], code) : null
    if (fromLink) {
      saveConfig(fromLink.cfg)
      saveMode(fromLink.mode, base.id)
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
