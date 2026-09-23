import type { Archetype, Scenario } from '@/lib/types'
import { defaultConfig, TONES, type AdminConfig } from './config'
import type { OpponentMode } from './storage'

/**
 * Настройка администратора, зашитая в ссылку.
 *
 * Бэкенда нет, поэтому конфигурация передаётся участнику в самом адресе:
 * он открывает ссылку и попадает в ту симуляцию, которую собрал администратор.
 *
 * Кодируются только отличия от библиотечного кейса: если поменяли одну
 * сложность, ссылка остаётся короткой.
 */
interface Packed {
  /** Кейс-основа. */
  b: string
  s?: string
  t?: string
  d?: number
  o?: Archetype
  n?: string
  e?: string
  g?: string
  r?: number
  /** Режим оппонента: 'o' — запасной движок. Основной режим не пишется. */
  m?: 'o'
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** base64url своими руками: одинаково работает в браузере, в Node и в проверочных скриптах. */
function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += ALPHABET[b0 >> 2]
    out += ALPHABET[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 === undefined) break
    out += ALPHABET[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 === undefined) break
    out += ALPHABET[b2 & 0b111111]
  }
  return out
}

function fromBase64Url(text: string): Uint8Array | null {
  const vals: number[] = []
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) return null
    vals.push(v)
  }
  const out: number[] = []
  for (let i = 0; i < vals.length; i += 4) {
    const c0 = vals[i]
    const c1 = vals[i + 1]
    const c2 = vals[i + 2]
    const c3 = vals[i + 3]
    if (c1 === undefined) return null
    out.push((c0 << 2) | (c1 >> 4))
    if (c2 === undefined) break
    out.push(((c1 & 0b1111) << 4) | (c2 >> 2))
    if (c3 === undefined) break
    out.push(((c2 & 0b11) << 6) | c3)
  }
  return new Uint8Array(out)
}

/** Кодирует настройку в строку для адреса. */
export function encodeConfig(base: Scenario, cfg: AdminConfig, mode: OpponentMode = 'auto'): string {
  const def = defaultConfig(base)
  const packed: Packed = { b: cfg.baseScenarioId }

  if (cfg.sphere !== def.sphere) packed.s = cfg.sphere
  if (cfg.topic !== def.topic) packed.t = cfg.topic
  if (cfg.difficulty !== def.difficulty) packed.d = cfg.difficulty
  if (cfg.tone !== def.tone) packed.o = cfg.tone
  if (cfg.opponentName !== def.opponentName) packed.n = cfg.opponentName
  if (cfg.opponentRole !== def.opponentRole) packed.e = cfg.opponentRole
  if (cfg.opponentGoal !== def.opponentGoal) packed.g = cfg.opponentGoal
  if (cfg.rounds !== def.rounds) packed.r = cfg.rounds
  if (mode === 'offline') packed.m = 'o'

  return toBase64Url(new TextEncoder().encode(JSON.stringify(packed)))
}

export interface DecodedLink {
  cfg: AdminConfig
  mode: OpponentMode
}

/**
 * Разбирает строку из адреса.
 *
 * Ссылку может отредактировать кто угодно, поэтому каждое поле проверяется и
 * при негодном значении берётся библиотечное. Испорченная ссылка не роняет
 * экран — она просто открывает кейс в исходном виде.
 */
export function decodeConfig(scenarios: Scenario[], code: string): DecodedLink | null {
  if (!code || code.length > 4096) return null

  const bytes = fromBase64Url(code)
  if (!bytes) return null

  let packed: Packed
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed || typeof parsed !== 'object') return null
    packed = parsed as Packed
  } catch {
    return null
  }

  const base = scenarios.find((s) => s.id === packed.b)
  if (!base) return null

  const cfg = defaultConfig(base)
  const line = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

  const sphere = line(packed.s, 120)
  if (sphere) cfg.sphere = sphere
  const topic = line(packed.t, 120)
  if (topic) cfg.topic = topic
  const name = line(packed.n, 80)
  if (name) cfg.opponentName = name
  const role = line(packed.e, 120)
  if (role) cfg.opponentRole = role
  const goal = line(packed.g, 400)
  if (goal) cfg.opponentGoal = goal

  if (typeof packed.d === 'number' && Number.isFinite(packed.d)) {
    cfg.difficulty = Math.min(5, Math.max(1, Math.round(packed.d)))
  }
  if (typeof packed.r === 'number' && Number.isFinite(packed.r)) {
    cfg.rounds = Math.min(24, Math.max(4, Math.round(packed.r)))
  }
  if (TONES.some((t) => t.value === packed.o)) cfg.tone = packed.o as Archetype

  return { cfg, mode: packed.m === 'o' ? 'offline' : 'auto' }
}
