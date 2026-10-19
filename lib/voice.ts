import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * Голосовой ввод: «удерживать и говорить».
 *
 * Запись идёт в браузере (MediaRecorder), распознаёт сервер через OpenRouter
 * (`/api/transcribe`). Текст отдаётся в поле ввода — отправляет игрок.
 *
 * Удержание дольше TAP_MS — запись до отпускания. Короткий тап — запись до
 * следующего нажатия: на тачпаде и с клавиатуры держать неудобно.
 */

export type VoiceStatus = 'idle' | 'starting' | 'recording' | 'transcribing'
export type VoiceError = 'denied' | 'unheard'

export const VOICE_BARS = 28

/** Минута — предел реплики и лимита на размер запроса. */
const MAX_MS = 60_000
const TAP_MS = 300
/** Короче — случайное касание, распознавать нечего. */
const MIN_MS = 450
/** Пик громкости ниже этого — тишина или фон, на сервер не отправляем. */
const SILENCE = 0.012
const BAR_MS = 70
const ERROR_MS = 3200

const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']

interface Take {
  stream: MediaStream
  recorder: MediaRecorder
  chunks: Blob[]
  ctx: AudioContext | null
  raf: number
  limit: ReturnType<typeof setTimeout>
  startedAt: number
  peak: number
  cancelled: boolean
}

function supportedHere() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

function makeContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Ctx ? new Ctx() : null
  } catch {
    return null
  }
}

export function useVoiceInput({ enabled, onText }: { enabled: boolean; onText: (text: string) => void }) {
  const [supported, setSupported] = useState(false)
  const [status, setStatusState] = useState<VoiceStatus>('idle')
  const [latched, setLatchedState] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<VoiceError | null>(null)

  const statusRef = useRef<VoiceStatus>('idle')
  const takeRef = useRef<Take | null>(null)
  const pendingCtx = useRef<AudioContext | null>(null)
  const holding = useRef(false)
  const alive = useRef(true)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  /** Полоски уровня: хук пишет transform прямо в DOM, без перерисовки React. */
  const meterRef = useRef<HTMLDivElement>(null)
  /** Ореол кнопки дышит громкостью голоса. */
  const ringRef = useRef<HTMLSpanElement>(null)

  const setStatus = (s: VoiceStatus) => {
    statusRef.current = s
    setStatusState(s)
  }

  const fail = (e: VoiceError) => {
    setError(e)
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(null), ERROR_MS)
  }

  useEffect(() => {
    setSupported(supportedHere())
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(errorTimer.current)
      const take = takeRef.current
      if (take) {
        take.cancelled = true
        if (take.recorder.state !== 'inactive') take.recorder.stop()
      }
      void pendingCtx.current?.close().catch(() => {})
    }
  }, [])

  const stop = useCallback(() => {
    const take = takeRef.current
    if (take && take.recorder.state === 'recording') take.recorder.stop()
  }, [])

  const cancel = useCallback(() => {
    holding.current = false
    const take = takeRef.current
    if (take) {
      take.cancelled = true
      if (take.recorder.state !== 'inactive') take.recorder.stop()
    } else if (statusRef.current === 'starting') {
      setStatus('idle')
    }
  }, [])

  const transcribe = async (blob: Blob) => {
    setStatus('transcribing')
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { text?: string }
      const text = data.text?.trim()
      if (!alive.current) return
      if (text) onTextRef.current(text)
      else fail('unheard')
    } catch {
      if (alive.current) fail('unheard')
    } finally {
      if (alive.current) setStatus('idle')
    }
  }

  const meter = (take: Take, analyser: AnalyserNode) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const buf = new Uint8Array(analyser.fftSize)
    const history: number[] = new Array(VOICE_BARS).fill(0)
    let level = 0
    let lastBar = 0
    const frame = (now: number) => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const x = (buf[i] - 128) / 128
        sum += x * x
      }
      const rms = Math.sqrt(sum / buf.length)
      take.peak = Math.max(take.peak, rms)
      // Речь в микрофон ноутбука — примерно 0,02–0,2: растягиваем до 0–1.
      // Подъём быстрый, спад медленный — так глаз читает громкость.
      const target = Math.min(1, rms * 6)
      level += (target - level) * (target > level ? 0.5 : 0.12)

      const ring = ringRef.current
      if (ring) {
        if (reduce) ring.style.opacity = String(0.25 + level * 0.75)
        else ring.style.transform = `scale(${1 + level * 0.3})`
      }
      if (now - lastBar >= BAR_MS) {
        lastBar = now
        history.shift()
        history.push(level)
        const bars = meterRef.current?.children
        if (bars) {
          for (let i = 0; i < bars.length; i++) {
            ;(bars[i] as HTMLElement).style.transform = `scaleY(${0.12 + 0.88 * (history[i] ?? 0)})`
          }
        }
      }
      take.raf = requestAnimationFrame(frame)
    }
    take.raf = requestAnimationFrame(frame)
  }

  const start = async () => {
    if (statusRef.current !== 'idle') return
    clearTimeout(errorTimer.current)
    setError(null)
    setSeconds(0)
    setStatus('starting')
    // Контекст создаётся до первого await, пока длится жест: Safari иначе
    // держит его на паузе, и индикатор стоит.
    const ctx = makeContext()
    pendingCtx.current = ctx

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      pendingCtx.current = null
      void ctx?.close().catch(() => {})
      holding.current = false
      if (alive.current) {
        setStatus('idle')
        fail('denied')
      }
      return
    }
    pendingCtx.current = null

    // Пока ждали микрофон, запись могли отменить.
    if (!alive.current || (statusRef.current as VoiceStatus) !== 'starting') {
      stream.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => {})
      return
    }

    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined)
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => {})
      holding.current = false
      setStatus('idle')
      fail('unheard')
      return
    }

    const take: Take = {
      stream,
      recorder,
      chunks: [],
      ctx,
      raf: 0,
      limit: setTimeout(stop, MAX_MS),
      startedAt: performance.now(),
      peak: 0,
      cancelled: false,
    }
    takeRef.current = take

    recorder.ondataavailable = (e) => {
      if (e.data.size) take.chunks.push(e.data)
    }
    recorder.onstop = () => {
      // Тишину отсекаем, только если индикатор действительно слушал.
      const heard = take.ctx?.state === 'running' ? take.peak >= SILENCE : true
      const long = performance.now() - take.startedAt >= MIN_MS
      cancelAnimationFrame(take.raf)
      clearTimeout(take.limit)
      const ring = ringRef.current
      if (ring) {
        ring.style.transform = ''
        ring.style.opacity = ''
      }
      take.stream.getTracks().forEach((t) => t.stop())
      void take.ctx?.close().catch(() => {})
      if (takeRef.current === take) takeRef.current = null
      if (!alive.current) return
      setLatchedState(false)
      if (take.cancelled) {
        setStatus('idle')
        return
      }
      if (!long || !heard || !take.chunks.length) {
        setStatus('idle')
        fail('unheard')
        return
      }
      void transcribe(new Blob(take.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
    }

    if (ctx) {
      try {
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(stream).connect(analyser)
        void ctx.resume().catch(() => {})
        meter(take, analyser)
      } catch {
        // Без индикатора запись всё равно идёт.
      }
    }

    recorder.start()
    setStatus('recording')
    // Отпустили, пока браузер спрашивал разрешение, — пишем до следующего нажатия.
    if (!holding.current) setLatchedState(true)
  }

  // Секундомер записи.
  useEffect(() => {
    if (status !== 'recording') return
    const id = setInterval(() => {
      const take = takeRef.current
      if (take) setSeconds(Math.floor((performance.now() - take.startedAt) / 1000))
    }, 250)
    return () => clearInterval(id)
  }, [status])

  // Esc — отменить запись без распознавания.
  useEffect(() => {
    if (status !== 'recording' && status !== 'starting') return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, cancel])

  // Ход закрылся (ушёл ответ, кончилась партия) — запись не нужна.
  useEffect(() => {
    if (!enabled) cancel()
  }, [enabled, cancel])

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !enabled) return
    e.preventDefault()
    if (statusRef.current === 'recording') {
      stop()
      return
    }
    if (statusRef.current !== 'idle') return
    holding.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Без захвата удержание работает, пока палец над кнопкой.
    }
    void start()
  }

  const onPointerUp = () => {
    if (!holding.current) return
    holding.current = false
    const take = takeRef.current
    // Микрофон ещё не открылся — запись встанет на тап, это решит start().
    if (!take) return
    if (performance.now() - take.startedAt < TAP_MS) setLatchedState(true)
    else stop()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (e.repeat || !enabled) return
    if (statusRef.current === 'recording') stop()
    else if (statusRef.current === 'idle') {
      holding.current = false
      void start()
    }
  }

  return {
    supported,
    status,
    /** Запись идёт без удержания: остановится следующим нажатием. */
    latched,
    seconds,
    error,
    active: status !== 'idle',
    meterRef,
    ringRef,
    cancel,
    buttonProps: {
      onPointerDown,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    },
  }
}

/** Какой текст вставлять в поле: голос дописывается к уже набранному. */
export function appendSpoken(current: string, spoken: string) {
  const head = current.trimEnd()
  return head ? `${head} ${spoken}` : spoken
}

export function formatVoiceTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
