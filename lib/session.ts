'use client'

import type { Deal, NegotiationState } from '@/lib/types'

/**
 * Незаконченная сессия в браузере: партия и снапшоты для возврата переживают
 * перезагрузку страницы.
 *
 * Хранится только НЕЗАКОНЧЕННАЯ партия: разбор и развилка не восстанавливаются,
 * им нужны полный расчёт и история.
 */
const KEY = 'arena.session.v1'

export interface SavedSession {
  /** Кейс и его настройка: чужую сессию в другой конфигурации не поднимаем. */
  signature: string
  state: NegotiationState
  snapshots: { turnIndex: number; state: NegotiationState }[]
  lastOffer?: Deal
}

export function saveSession(session: SavedSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Приватный режим или переполненное хранилище: сессия просто не переживёт перезагрузку.
  }
}

export function loadSession(signature: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as SavedSession
    if (!saved || saved.signature !== signature) return null
    // 'deal' здесь — не законченная сессия, а пауза: вторая сторона согласилась,
    // а игрок ещё не решил, фиксировать или торговаться дальше.
    if (!saved.state || !Array.isArray(saved.state.transcript)) return null
    if (saved.state.status !== 'active' && saved.state.status !== 'deal') return null
    // Первый раунд восстанавливать нечего: это тот же экран, что и при входе.
    if (saved.state.transcript.length < 2) return null
    return saved
  } catch {
    return null
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* пусто */
  }
}
