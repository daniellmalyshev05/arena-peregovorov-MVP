'use client'

import type { Scenario } from '@/lib/types'
import { applyConfig, type AdminConfig } from './config'

const KEY = 'arena.admin.config.v1'
const MODE_KEY = 'arena.opponent.mode.v1'

/**
 * Режим оппонента. Главный — 'auto': играет модель, а запасной движок
 * подхватывает только если модель не ответила. 'offline' — ручная страховка
 * на случай, когда сеть или провайдер недоступны во время показа.
 */
export type OpponentMode = 'auto' | 'offline'

export function loadMode(): OpponentMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'offline' ? 'offline' : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveMode(mode: OpponentMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
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
