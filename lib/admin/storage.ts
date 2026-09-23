'use client'

import type { Scenario } from '@/lib/types'
import { applyConfig, type AdminConfig } from './config'

const KEY = 'arena.admin.config.v1'
const MODE_KEY = 'arena.opponent.mode.v1'

/**
 * Режим оппонента. Главный — 'auto': играет модель, а запасной движок
 * подхватывает, только если модель не ответила. 'offline' — ручная страховка
 * на случай, когда сеть или провайдер недоступны.
 *
 * Режим привязан к кейсу, как и остальной контекст администратора, чтобы
 * переключение в одном кейсе не переводило на запасной движок все остальные.
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
    // Значение старого формата (строка на весь продукт) не разбирается
    // и означает 'auto'.
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

/** Настройка хранится в браузере: сервер для неё не нужен. */
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
