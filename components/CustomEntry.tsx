'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Scenario } from '@/lib/types'
import { encodeConfig } from '@/lib/admin/link'
import { applyConfig } from '@/lib/admin/config'
import { saveConfig, saveMode, tunedScenario } from '@/lib/admin/storage'
import { loadCustom, saveCustom } from '@/lib/admin/custom'
import { CASE_HASH, decodeCase } from '@/lib/admin/share'
import { ArenaClient } from './ArenaClient'

/**
 * Вход в сгенерированный кейс.
 *
 * `/arena/custom?id=…` — кейс из этого браузера, его открывает администратор.
 * `/arena/custom#case=…` — ссылка для участников: кейс и настройка в самом
 * адресе. Такой кейс проверяется заново и сохраняется в браузере участника,
 * чтобы партия пережила перезагрузку и попала в профиль под своим названием.
 */
export function CustomEntry({ voice }: { voice: boolean }) {
  const [resolved, setResolved] = useState<
    { base: Scenario; scenario: Scenario; configCode?: string } | 'missing' | null
  >(null)

  useEffect(() => {
    let alive = true
    const open = async () => {
      const hash = window.location.hash
      if (hash.startsWith(CASE_HASH)) {
        const shared = await decodeCase(hash.slice(CASE_HASH.length))
        if (!alive) return
        if (!shared) {
          setResolved('missing')
          return
        }
        const base = shared.scenario
        saveCustom({ scenario: base, brief: { sphere: '', topic: '', goal: '' }, createdAt: Date.now() })
        if (shared.link) {
          // Как у ссылки с `cfg`: настройка из адреса важнее сохранённой.
          saveConfig(shared.link.cfg)
          saveMode(shared.link.mode, base.id)
          setResolved({
            base,
            scenario: applyConfig(base, shared.link.cfg),
            configCode: encodeConfig(base, shared.link.cfg),
          })
          return
        }
        setResolved({ base, scenario: base })
        return
      }

      const id = new URLSearchParams(window.location.search).get('id')
      const base = id ? loadCustom(id) : null
      if (!base) {
        setResolved('missing')
        return
      }
      const tuned = tunedScenario(base)
      setResolved({ base, scenario: tuned.scenario, configCode: tuned.cfg ? encodeConfig(base, tuned.cfg) : undefined })
    }
    void open()
    // Новая ссылка, вставленная в адрес открытой страницы, меняет только `#`:
    // браузер не перезагружает страницу, поэтому перезагружаем сами.
    const onHash = () => window.location.reload()
    window.addEventListener('hashchange', onHash)
    return () => {
      alive = false
      window.removeEventListener('hashchange', onHash)
    }
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
