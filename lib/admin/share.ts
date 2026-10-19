import type { Scenario } from '@/lib/types'
import type { AdminConfig } from './config'
import { decodeConfig, encodeConfig, type DecodedLink } from './link'
import type { OpponentMode } from './storage'
import { checkCustomScenario } from './scenario-schema'

/**
 * Ссылка на сгенерированный кейс.
 *
 * Общей базы нет, поэтому кейс едет в самом адресе: JSON сжимается и кладётся
 * после `#case=`. Эта часть адреса не уходит на сервер, так что длина ссылки
 * упирается только в браузер — около шести тысяч знаков на кейс.
 *
 * Настройка администратора едет рядом в том же формате, что `cfg` у кейсов
 * библиотеки. На входе кейс проверяется заново: схема, ссылки, аудит.
 */

interface Payload {
  /** Кейс до настройки. */
  s: Scenario
  /** Настройка администратора, как в `cfg`. */
  c?: string
}

export const CASE_HASH = '#case='

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(body).arrayBuffer())
}

export async function encodeCase(scenario: Scenario, cfg: AdminConfig, mode: OpponentMode): Promise<string> {
  const payload: Payload = { s: scenario, c: encodeConfig(scenario, cfg, mode) }
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw'))
  return toBase64Url(packed)
}

/** Кейс и настройка из адреса или null, если ссылка испорчена или кейс не проходит проверку. */
export async function decodeCase(code: string): Promise<{ scenario: Scenario; link: DecodedLink | null } | null> {
  if (!code || code.length > 20_000) return null
  const bytes = fromBase64Url(code)
  if (!bytes) return null
  try {
    const json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')))
    const payload = JSON.parse(json) as Partial<Payload>
    const scenario = checkCustomScenario(payload?.s)
    if (!scenario) return null
    const link = typeof payload.c === 'string' ? decodeConfig([scenario], payload.c) : null
    return { scenario, link }
  } catch {
    return null
  }
}
