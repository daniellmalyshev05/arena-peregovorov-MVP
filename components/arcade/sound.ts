/**
 * Звуки аркады синтезируются на лету: без файлов и лицензий. Контекст создаётся
 * по первому действию игрока — до клика браузер звук всё равно не пустит.
 */

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, at: number, length: number, type: OscillatorType, gain: number, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + at
  const osc = a.createOscillator()
  const amp = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length)
  osc.connect(amp).connect(a.destination)
  osc.start(t)
  osc.stop(t + length + 0.02)
}

function noise(at: number, length: number, gain: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + at
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = a.createBufferSource()
  const amp = a.createGain()
  const filter = a.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1800
  src.buffer = buffer
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(a.destination)
  src.start(t)
}

export const sfx = {
  hit() {
    noise(0, 0.12, 0.35)
    tone(420, 0, 0.14, 'square', 0.08, 180)
  },
  miss() {
    tone(160, 0, 0.22, 'sawtooth', 0.07, 90)
  },
  charge() {
    tone(520, 0, 0.12, 'triangle', 0.1)
    tone(780, 0.08, 0.16, 'triangle', 0.1)
  },
  ulta() {
    tone(220, 0, 0.35, 'sawtooth', 0.06, 880)
  },
  shield() {
    tone(300, 0, 0.08, 'square', 0.08)
    noise(0.02, 0.1, 0.25)
  },
  ko() {
    noise(0, 0.25, 0.4)
    for (const [f, d] of [[392, 0.05], [523, 0.13], [659, 0.21], [784, 0.29]] as const) tone(f, d, 0.5, 'triangle', 0.09)
  },
  lose() {
    tone(330, 0, 0.3, 'triangle', 0.08, 220)
    tone(220, 0.25, 0.5, 'triangle', 0.08, 140)
  },
  tick() {
    tone(1200, 0, 0.04, 'square', 0.03)
  },
}
