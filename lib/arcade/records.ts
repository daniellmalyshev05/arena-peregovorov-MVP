/**
 * Рекорды аркады и настройка звука — в своём ключе, отдельно от профиля
 * симулятора. Хранилище может быть недоступно (приватное окно), тогда
 * аркада просто играет без рекордов.
 */

const KEY = 'arena.arcade.v1'

interface ArcadeStore {
  best: Record<string, number>
  sound: boolean
}

function read(): ArcadeStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArcadeStore>
      return { best: parsed.best ?? {}, sound: parsed.sound ?? true }
    }
  } catch {}
  return { best: {}, sound: true }
}

function write(store: ArcadeStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {}
}

export function bestTimes(): Record<string, number> {
  return read().best
}

/** Записывает время сделки, если оно лучше прежнего. Возвращает, побит ли рекорд. */
export function saveTime(opponentId: string, seconds: number): boolean {
  const store = read()
  const prev = store.best[opponentId]
  if (prev !== undefined && prev <= seconds) return false
  store.best[opponentId] = seconds
  write(store)
  return true
}

export function soundOn(): boolean {
  return read().sound
}

export function setSound(on: boolean) {
  const store = read()
  store.sound = on
  write(store)
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
