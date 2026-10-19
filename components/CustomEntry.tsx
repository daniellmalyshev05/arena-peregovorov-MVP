'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { encodeConfig } from '@/lib/admin/link'
import { tunedScenario } from '@/lib/admin/storage'
import { loadCustom } from '@/lib/admin/custom'
import { ArenaClient } from './ArenaClient'

/**
 * Вход в сгенерированный кейс: `/arena/custom?id=…`.
 *
 * Кейс лежит в браузере, поэтому экран рисуется после чтения на клиенте.
 * Настройка администратора применяется так же, как к кейсам библиотеки.
 */
export function CustomEntry({ voice }: { voice: boolean }) {
  const [resolved, setResolved] = useState<
    { base: Scenario; scenario: Scenario; configCode?: string } | 'missing' | null
  >(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    const base = id ? loadCustom(id) : null
    if (!base) {
      setResolved('missing')
      return
    }
    const tuned = tunedScenario(base)
    setResolved({ base, scenario: tuned.scenario, configCode: tuned.cfg ? encodeConfig(base, tuned.cfg) : undefined })
  }, [])

  if (!resolved) return <div className="min-h-dvh bg-paper" />

  if (resolved === 'missing') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper px-4">
        <div className="rise max-w-[420px] text-center">
          <h1 className="text-title font-semibold text-ink">Кейса нет на этом устройстве</h1>
          <p className="mt-2 text-body text-ink2">
            Созданные кейсы хранятся в браузере, где их сделали. Откройте ссылку для участников или создайте кейс заново.
          </p>
          <Link
            href="/admin"
            className="press mt-6 inline-flex h-11 items-center rounded-md bg-accent px-5 font-semibold text-white hover:bg-accent/92"
          >
            В настройку симуляции
          </Link>
        </div>
      </main>
    )
  }

  return (
    <ArenaClient
      key={`${resolved.scenario.id}|${resolved.configCode ?? ''}`}
      scenario={resolved.scenario}
      configCode={resolved.configCode}
      customBase={resolved.base}
      voice={voice}
    />
  )
}
