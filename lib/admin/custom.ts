'use client'

import type { Scenario } from '@/lib/types'
import { checkCustomScenario } from './scenario-schema'

/**
 * Сгенерированные кейсы живут в браузере администратора, как и настройка:
 * общей базы нет. Хранилище только добавляется к существующим ключам.
 */
const KEY = 'arena.custom.v1'
/** Больше не нужно: это черновики под конкретную сессию, а не вторая библиотека. */
const LIMIT = 12

export interface CustomCase {
  scenario: Scenario
  /** Описание, по которому кейс написан, — чтобы администратор помнил, откуда он. */
  brief: { sphere: string; topic: string; goal: string }
  createdAt: number
}

function read(): CustomCase[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(list)) return []
    // Запись могли поправить руками или оставить старой версией: берём только то, что проходит проверку.
    return list.flatMap((c) => {
      const scenario = c && typeof c === 'object' ? checkCustomScenario((c as CustomCase).scenario, { audit: false }) : null
      return scenario ? [{ ...(c as CustomCase), scenario }] : []
    })
  } catch {
    return []
  }
}

function write(list: CustomCase[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)))
  } catch {
    /* приватный режим или нет места — кейс просто не сохранится */
  }
}

export function loadCustomCases(): CustomCase[] {
  return read()
}

export function loadCustom(id: string): Scenario | null {
  return read().find((c) => c.scenario.id === id)?.scenario ?? null
}

/** Новый — первым; тот же id заменяет прежнюю запись. */
export function saveCustom(entry: CustomCase) {
  write([entry, ...read().filter((c) => c.scenario.id !== entry.scenario.id)])
}

export function removeCustom(id: string) {
  write(read().filter((c) => c.scenario.id !== id))
}
