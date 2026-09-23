'use client'

import type { Scenario } from '@/lib/types'
import { applyConfig, type AdminConfig } from './config'

const KEY = 'arena.admin.config.v1'
const MODE_KEY = 'arena.opponent.mode.v1'

/**
 * Режим оппонента. Главный — 'auto': играет модель, а запасной движок
 * подхватывает только если модель не ответила. 'offline' — ручная страховка
 * на случай, когда сеть или провайдер недоступны во время показа.
 *
 * Режим привязан к кейсу, как и остальной контекст администратора. Раньше он
 * лежал в браузере одним значением на весь продукт: достаточно было один раз
 * переключиться на запасной движок в админке — и все семь сценариев до конца
 * играли на правилах, без единого обращения к модели. Человек, заглянувший в
 * настройку из любопытства, дальше оценивал страховку вместо продукта.
 */
export type OpponentMode = 'auto' | 'offline'

interface StoredMode {
  scenarioId: string
  mode: OpponentMode
}

export function loadMode(scenarioId: string): OpponentMode {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (!raw) return 'auto'
    // Значение старого формата — голая строка на весь продукт. Оно не разбирается
    // и молча означает 'auto': браузер, испорченный прежней версией, чинится сам.
    const stored = JSON.parse(raw) as StoredMode
    if (!stored || stored.scenarioId !== scenarioId) return 'auto'
    return stored.mode === 'offline' ? 'offline' : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveMode(mode: OpponentMode, scenarioId: string) {
  try {
    localStorage.setItem(MODE_KEY, JSON.stringify({ scenarioId, mode } satisfies StoredMode))
  } catch {
    /* пусто */
  }
}

/** Настройка живёт в браузере: демо не ломается перезапуском и не требует сервера. */
export function saveConfig(cfg: AdminConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* приватный режим — настройка просто не сохранится */
  }
}

export function loadConfig(): AdminConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw)
    return cfg && typeof cfg.baseScenarioId === 'string' ? (cfg as AdminConfig) : null
  } catch {
    return null
  }
}

export function clearConfig() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* пусто */
  }
}

/** Возвращает сценарий с применённым контекстом администратора, если он задан для этого кейса. */
export function tunedScenario(base: Scenario): { scenario: Scenario; configured: boolean; cfg?: AdminConfig } {
  const cfg = loadConfig()
  if (!cfg || cfg.baseScenarioId !== base.id) return { scenario: base, configured: false }
  return { scenario: applyConfig(base, cfg), configured: true, cfg }
}
