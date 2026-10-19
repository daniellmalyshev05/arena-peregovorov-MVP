'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Deal, NegotiationState } from '@/lib/types'
import { createInitialState, endNow, walkAway } from '@/lib/engine/state'
import { optionOf } from '@/lib/engine/utility'
import { ARCADE_SECONDS, arcadeOpponents, getArcadeOpponent } from '@/lib/arcade/opponents'
import { accurateStrikes, appetite, charge, gain, lastStrikes, type Strike } from '@/lib/arcade/hud'
import { clock, saveTime, setSound, soundOn } from '@/lib/arcade/records'
import { plural } from '@/lib/plural'
import { appendSpoken, formatVoiceTime, useVoiceInput } from '@/lib/voice'
import { IconMic, IconStop, VoiceMeter } from '@/components/VoiceMeter'
import { sfx, setSoundEnabled } from './sound'
import { OfferPad } from './OfferPad'
import { Brief } from './Brief'
import { IconBolt, IconClose, IconHelp, IconLock, IconPackage, IconSend, IconShield, IconSound, StrikeIcon } from './icons'

type Phase = 'intro' | 'brief' | 'play' | 'over'
type Ending = 'deal' | 'time' | 'rounds' | 'exit'

interface Fx {
  id: number
  kind: 'hit' | 'miss' | 'ulta'
  delta: number
  strikes: Strike[]
}

const ENDING_TITLE: Record<Ending, string> = {
  deal: 'СДЕЛКА!',
  time: 'ВРЕМЯ ВЫШЛО',
  rounds: 'БЕЗ СДЕЛКИ',
  exit: 'ВЫ ВЫШЛИ',
}

const LESSON_PRACTICE = { exchange: 'обмен', questions: 'вопросы', criteria: 'критерии' } as const

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function offerLine(opponentId: string, offer: Deal): string {
  const s = getArcadeOpponent(opponentId)!.scenario
  const parts = s.issues
    .filter((i) => offer[i.id])
    .map((i) => `${i.label.toLowerCase()} — ${i.options.find((o) => o.id === offer[i.id])?.label}`)
  return `Предлагаю пакет: ${parts.join(', ')}.`
}

export function ArcadeFight({ opponentId, voice = false }: { opponentId: string; voice?: boolean }) {
  const opponent = getArcadeOpponent(opponentId)!
  const scenario = opponent.scenario

  const [state, setState] = useState<NegotiationState>(() => createInitialState(scenario))
  const [phase, setPhase] = useState<Phase>('intro')
  const [ending, setEnding] = useState<Ending | null>(null)
  const [seconds, setSeconds] = useState(ARCADE_SECONDS)
  const [spent, setSpent] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [fx, setFx] = useState<Fx | null>(null)
  const [flash, setFlash] = useState<{ id: number; kind: 'counter' | 'reject' } | null>(null)
  const [pulse, setPulse] = useState(0)
  const [sheet, setSheet] = useState(false)
  const [failed, setFailed] = useState<{ text: string; offer?: Deal } | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [help, setHelp] = useState(false)
  const [sound, setSoundState] = useState(true)

  const stateRef = useRef(state)
  stateRef.current = state
  const secondsRef = useRef(seconds)
  secondsRef.current = seconds
  const fxId = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const focusAfterVoice = useRef(false)
  const voiceInput = useVoiceInput({
    enabled: phase === 'play' && !busy,
    onText: (spoken) => {
      setText((t) => appendSpoken(t, spoken).slice(0, 400))
      focusAfterVoice.current = window.matchMedia('(pointer: fine)').matches
    },
  })
  const showVoice = voice && voiceInput.supported
  const transcribing = voiceInput.status === 'transcribing'
  useEffect(() => {
    if (voiceInput.active || !focusAfterVoice.current) return
    focusAfterVoice.current = false
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [voiceInput.active, text])

  useEffect(() => {
    const on = soundOn()
    setSoundState(on)
    setSoundEnabled(on)
  }, [])

  // Заставка: «РАУНД 1» → «ТОРГУЙТЕСЬ!», затем задача, и только после неё пошли часы.
  useEffect(() => {
    if (phase !== 'intro') return
    const t = setTimeout(() => setPhase('brief'), 1500)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'play') inputRef.current?.focus()
  }, [phase])

  const finish = useCallback(
    (kind: Ending, final: NegotiationState) => {
      setState(final)
      setEnding(kind)
      setPhase('over')
      setSheet(false)
      setConfirmExit(false)
      const used = ARCADE_SECONDS - secondsRef.current
      setSpent(used)
      if (kind === 'deal') {
        saveTime(opponentId, Math.round(used))
        sfx.ko()
      } else {
        sfx.lose()
      }
    },
    [opponentId],
  )

  // Часы идут, только пока ход за игроком: ожидание ответа и распознавания не съедает время.
  useEffect(() => {
    if (phase !== 'play' || busy || help || transcribing) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const next = Math.max(0, secondsRef.current - (now - last) / 1000)
      last = now
      if (Math.ceil(next) < Math.ceil(secondsRef.current) && next <= 10 && next > 0) sfx.tick()
      setSeconds(next)
      secondsRef.current = next
      if (next <= 0) {
        clearInterval(id)
        finish('time', endNow(stateRef.current))
      }
    }, 200)
    return () => clearInterval(id)
  }, [phase, busy, help, transcribing, finish])

  const send = useCallback(
    async (payload: { text: string; offer?: Deal }, offline = false) => {
      const before = stateRef.current
      setBusy(true)
      setFailed(null)
      setPending(payload.offer ? null : payload.text)
      if (!payload.offer) setText('')
      if (payload.offer) {
        sfx.ulta()
        setFx({ id: ++fxId.current, kind: 'ulta', delta: 0, strikes: [] })
      }
      try {
        const res = await fetch('/api/arcade/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            opponentId,
            state: before,
            userText: payload.text,
            offer: payload.offer,
            forceOffline: offline || undefined,
          }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { state: NegotiationState; verdict?: 'accept' | 'counter' | 'reject' }
        const next = data.state
        setPending(null)
        setText('')

        if (next.revealedInterests.length > before.revealedInterests.length) {
          setPulse((p) => p + 1)
          sfx.charge()
        }

        if (payload.offer) {
          await wait(420)
          if (data.verdict === 'accept') {
            finish('deal', endNow(next))
            return
          }
          setState(next)
          sfx.shield()
          setFlash({ id: ++fxId.current, kind: data.verdict === 'counter' ? 'counter' : 'reject' })
        } else {
          // Число удара — вклад самой реплики: полоска сравнивается в том же раунде.
          // Падение от нового раунда полоска показывает сама, без числа.
          const delta = Math.round((appetite(opponent, before) - appetite(opponent, { ...next, round: before.round })) * 100)
          const strikes = lastStrikes(next)
          const missed = delta < 0 || (strikes.some((s) => !s.good) && !strikes.some((s) => s.good))
          setState(next)
          setFx({ id: ++fxId.current, kind: missed ? 'miss' : 'hit', delta, strikes })
          if (missed) sfx.miss()
          else sfx.hit()
        }

        if (next.status !== 'active') {
          await wait(900)
          finish(next.status === 'deal' ? 'deal' : 'rounds', next)
        }
      } catch {
        setPending(null)
        setFailed(payload)
        if (!payload.offer) setText(payload.text)
        setFx(null)
      } finally {
        setBusy(false)
      }
    },
    [finish, opponent, opponentId],
  )

  const submit = () => {
    const v = text.trim()
    if (!v || busy || phase !== 'play') return
    void send({ text: v })
  }

  const restart = () => {
    setState(createInitialState(scenario))
    setSeconds(ARCADE_SECONDS)
    secondsRef.current = ARCADE_SECONDS
    setEnding(null)
    setFx(null)
    setFlash(null)
    setText('')
    setFailed(null)
    setPhase('intro')
  }

  const toggleSound = () => {
    const on = !sound
    setSoundState(on)
    setSoundEnabled(on)
    setSound(on)
  }

  const ratio = phase === 'over' && ending === 'deal' ? 0 : appetite(opponent, state)
  const { filled, total } = charge(opponent, state)
  const line = [...state.transcript].reverse().find((t) => t.role === 'opponent')?.text ?? ''
  const round = Math.min(state.round, scenario.maxRounds)
  const lost = phase === 'over' && ending !== 'deal'
  const strikes = fx && fx.kind !== 'ulta' ? fx.strikes : []
  const nextOpponent = arcadeOpponents[arcadeOpponents.findIndex((o) => o.scenario.id === opponentId) + 1]
  const hits = accurateStrikes(state)

  return (
    <main className="arc-fight" data-phase={phase}>
      <header className="arc-hud">
        <div className="arc-hud-row">
          <button
            type="button"
            className="arc-round-btn"
            aria-label="Выйти из переговоров"
            onClick={() => (phase === 'over' ? undefined : setConfirmExit(true))}
            disabled={phase === 'over'}
          >
            <IconClose size={20} />
          </button>
          <div className="arc-clock">
            <span className={`arc-timer${seconds <= 10 && phase === 'play' ? ' is-low' : ''}`} role="timer">
              {clock(seconds)}
            </span>
            <span className="arc-round">
              Раунд {round}/{scenario.maxRounds}
            </span>
          </div>
          <div className="arc-hud-tools">
            <button
              type="button"
              className="arc-round-btn"
              aria-label="Ваша задача"
              onClick={() => setHelp(true)}
              disabled={phase !== 'play'}
            >
              <IconHelp size={20} />
            </button>
            <button
              type="button"
              className="arc-round-btn"
              aria-label={sound ? 'Выключить звук' : 'Включить звук'}
              onClick={toggleSound}
            >
              <IconSound on={sound} size={20} />
            </button>
          </div>
        </div>

        <div className="arc-hud-row arc-hud-meta">
          <span className="arc-name">{scenario.title}</span>
          <span className="arc-ulta-meter" key={pulse} data-fresh={pulse > 0 || undefined}>
            <span className="arc-ulta-label">Ульта</span>
            <span className="arc-gems" aria-label={`раскрыто ${filled} из ${total}`}>
              {Array.from({ length: total }, (_, i) => (
                <i key={i} className={i < filled ? 'on' : undefined} data-last={i === filled - 1 || undefined} />
              ))}
            </span>
          </span>
        </div>

        <div className="arc-bar" role="meter" aria-label="Намерение соперника" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
          <i className="arc-bar-ghost" style={{ transform: `scaleX(${ratio})` }} />
          <i className="arc-bar-hp" style={{ transform: `scaleX(${ratio})` }} />
          <span style={{ left: '25%' }} />
          <span style={{ left: '50%' }} />
          <span style={{ left: '75%' }} />
        </div>

        <ul className="arc-table" aria-label="На столе">
          {scenario.issues.map((issue) => {
            const open = state.visibleIssues.includes(issue.id)
            if (!open) {
              return (
                <li key={issue.id} className="is-locked">
                  <IconLock size={14} />
                  скрыто
                </li>
              )
            }
            const value = optionOf(issue, state.deal[issue.id]).label
            return (
              <li key={issue.id} className={state.deal[issue.id] !== issue.defaultOptionId ? 'is-moved' : undefined} title={`${issue.label} · ${value}`}>
                <span>{issue.label}</span>
                <b>{value}</b>
              </li>
            )
          })}
        </ul>
      </header>

      <section className="arc-stage" aria-label={scenario.title}>
        {phase === 'over' && ending === 'deal' && <div className="arc-rays" aria-hidden />}
        <div className="arc-floor" aria-hidden />

        <div
          className={[
            'arc-portrait',
            phase === 'intro' ? 'is-entering' : '',
            busy ? 'is-thinking' : '',
            fx?.kind === 'miss' ? 'is-recoil' : '',
            lost ? 'is-out' : '',
            phase === 'over' && ending === 'deal' ? 'is-ko' : '',
          ].join(' ')}
          key={fx?.kind === 'miss' ? `r${fx.id}` : 'portrait'}
          style={{ ['--p' as string]: `${ratio * 360}deg` }}
        >
          <img src={`/arcade/${scenario.persona.portrait}`} alt="" draggable={false} />
        </div>

        {fx && phase !== 'over' && (
          <div className="arc-fx" key={fx.id} aria-hidden>
            {fx.kind === 'ulta' ? (
              <span className="arc-shot arc-shot-ulta">
                <IconPackage size={34} />
              </span>
            ) : (
              <>
                {fx.strikes.slice(0, 3).map((s, i) => (
                  <span
                    key={s.kind}
                    className={`arc-shot ${s.good ? 'is-good' : 'is-bad'}`}
                    style={{ ['--i' as string]: i, ['--dx' as string]: `${(i - (Math.min(3, fx.strikes.length) - 1) / 2) * 56}px` }}
                  >
                    <StrikeIcon kind={s.kind} size={26} />
                  </span>
                ))}
                {fx.kind === 'hit' && <span className="arc-burst" />}
                {fx.delta !== 0 && (
                  <span className={`arc-dmg ${fx.delta > 0 ? 'is-good' : 'is-bad'}`}>
                    {fx.delta > 0 ? `−${fx.delta}` : `+${-fx.delta}`}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {strikes.length > 0 && phase === 'play' && (
          <ul className="arc-combo" key={`c${fx?.id}`}>
            {strikes.map((s) => (
              <li key={s.kind} className={s.good ? 'is-good' : 'is-bad'} title={s.label}>
                <StrikeIcon kind={s.kind} size={18} />
                <span className="sr-only">{s.label}</span>
              </li>
            ))}
          </ul>
        )}

        {flash && phase === 'play' && (
          <div className={`arc-flash is-${flash.kind}`} key={flash.id} role="status">
            <IconShield size={56} />
            <span>{flash.kind === 'counter' ? 'ВСТРЕЧНОЕ!' : 'ОТБИЛ!'}</span>
          </div>
        )}

        {phase === 'intro' && (
          <button type="button" className="arc-intro" onClick={() => setPhase('brief')} aria-label="Начать">
            <span className="arc-intro-round">РАУНД 1</span>
            <span className="arc-intro-go">ТОРГУЙТЕСЬ!</span>
          </button>
        )}

        {phase === 'over' && ending && (
          <div className={`arc-stamp${ending === 'deal' ? '' : ' is-lost'}`} role="status">
            {ENDING_TITLE[ending]}
          </div>
        )}
      </section>

      <section className="arc-bottom">
        {phase !== 'over' ? (
          <>
            {busy && !failed ? (
              <p className="arc-line is-typing" key="typing">
                <span className="arc-who">{scenario.title}</span>
                <span className="arc-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="sr-only">Соперник отвечает</span>
              </p>
            ) : (
              <p className="arc-line" aria-live="polite" key={line}>
                <span className="arc-who">{scenario.title}</span>
                {line}
              </p>
            )}

            {pending && <p className="arc-mine">{pending}</p>}

            {state.round === 1 && !busy && !pending && phase === 'play' && (
              <div className="arc-openers">
                {(scenario.openers ?? []).map((o) => (
                  <button key={o} type="button" onClick={() => { setText(o); inputRef.current?.focus() }}>
                    {o}
                  </button>
                ))}
              </div>
            )}

            {failed && (
              <div className="arc-error" role="alert">
                <span>Связь прервалась, ответ не дошёл</span>
                <button type="button" onClick={() => void send(failed, true)}>
                  Повторить
                </button>
              </div>
            )}

            {voiceInput.error && (
              <p className="arc-voice-error" role="status">
                {voiceInput.error === 'denied' ? 'Нет доступа к микрофону' : 'Не расслышали, попробуйте ещё раз'}
              </p>
            )}

            <form
              className={`arc-dock${showVoice ? ' has-voice' : ''}`}
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <input
                ref={inputRef}
                className="arc-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ваша реплика"
                aria-label="Ваша реплика"
                disabled={phase !== 'play'}
                maxLength={400}
                hidden={voiceInput.active}
              />
              {voiceInput.active && (
                <div className="arc-voice" role="status">
                  {!transcribing && <span className="voice-dot" aria-hidden />}
                  <span className={`arc-voice-label${transcribing ? '' : ' is-speaking'}`}>{transcribing ? 'Распознаём…' : 'Говорите…'}</span>
                  <VoiceMeter ref={voiceInput.meterRef} busy={transcribing} className="arc-voice-meter" />
                  {voiceInput.status === 'recording' && (
                    <>
                      <span className="arc-voice-time">{formatVoiceTime(voiceInput.seconds)}</span>
                      <span className="arc-voice-hint">
                        {voiceInput.latched ? 'Нажмите ещё раз, чтобы вставить текст' : 'Отпустите, чтобы вставить текст'}
                      </span>
                    </>
                  )}
                </div>
              )}
              {showVoice && (
                <span className="arc-mic-wrap">
                  <span
                    ref={voiceInput.ringRef}
                    aria-hidden
                    className={`voice-ring arc-mic-ring${voiceInput.status === 'recording' ? ' is-on' : ''}`}
                  />
                  <button
                    type="button"
                    {...voiceInput.buttonProps}
                    className={`voice-btn arc-mic${voiceInput.status === 'recording' || voiceInput.status === 'starting' ? ' is-rec' : ''}`}
                    disabled={busy || phase !== 'play' || transcribing}
                    aria-label={voiceInput.latched ? 'Нажмите ещё раз, чтобы вставить текст' : 'Удерживайте и говорите'}
                    aria-pressed={voiceInput.status === 'recording'}
                    title="Удерживайте и говорите"
                  >
                    {voiceInput.latched ? <IconStop size={18} /> : <IconMic size={22} />}
                  </button>
                </span>
              )}
              <button
                type="submit"
                className="arc-send"
                aria-label="Отправить"
                disabled={!text.trim() || busy || phase !== 'play' || voiceInput.active}
              >
                <IconSend size={22} />
              </button>
              <button
                type="button"
                className={`arc-ulta${filled === total ? ' is-full' : ''}`}
                disabled={filled === 0 || busy || phase !== 'play'}
                onClick={() => setSheet(true)}
              >
                {filled === 0 ? (
                  <span className="arc-ulta-hint">Раскройте, что скрывает соперник</span>
                ) : (
                  <>
                    <IconBolt size={18} />
                    Ульта · пакет
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="arc-result">
            <dl className="arc-stats">
              <div>
                <dt>на переговоры</dt>
                <dd>{clock(spent)}</dd>
              </div>
              <div>
                <dt>{plural(hits, ['удачное решение', 'удачных решения', 'удачных решений'])}</dt>
                <dd>{hits}</dd>
              </div>
              {ending === 'deal' && (
                <div>
                  <dt>к запасному варианту</dt>
                  <dd>{`${gain(opponent, state) >= 0 ? '+' : '−'}${Math.abs(gain(opponent, state))}`}</dd>
                </div>
              )}
            </dl>
            <Link className="arc-practice" href={`/arena/${opponent.practiceCaseId}`}>
              Отработать {LESSON_PRACTICE[opponent.lesson]} на реальном кейсе
            </Link>
            <div className="arc-actions">
              {ending === 'deal' && nextOpponent ? (
                <Link className="arc-btn-main" href={`/arcade/${nextOpponent.scenario.id}`}>
                  Следующий соперник
                </Link>
              ) : (
                <button type="button" className="arc-btn-main" onClick={restart}>
                  Ещё раз
                </button>
              )}
              {ending === 'deal' && nextOpponent && (
                <button type="button" className="arc-btn" onClick={restart}>
                  Ещё раз
                </button>
              )}
              <Link className="arc-btn" href="/arcade">
                В меню
              </Link>
            </div>
          </div>
        )}
      </section>

      {sheet && (
        <OfferPad
          scenario={scenario}
          state={state}
          onClose={() => setSheet(false)}
          onSend={(offer) => {
            setSheet(false)
            const said = text.trim()
            void send({ text: said ? `${said} ${offerLine(opponentId, offer)}` : offerLine(opponentId, offer), offer })
          }}
        />
      )}

      {(phase === 'brief' || help) && (
        <Brief
          scenario={scenario}
          state={state}
          mode={phase === 'brief' ? 'start' : 'help'}
          onClose={() => (phase === 'brief' ? setPhase('play') : setHelp(false))}
        />
      )}

      {confirmExit && (
        <div className="arc-scrim" role="dialog" aria-modal="true" aria-labelledby="arc-exit-q">
          <div className="arc-confirm">
            <p id="arc-exit-q">Выйти из переговоров?</p>
            <div>
              <button type="button" className="arc-btn" onClick={() => finish('exit', walkAway(stateRef.current))}>
                Выйти
              </button>
              <button type="button" className="arc-btn-main" onClick={() => setConfirmExit(false)} autoFocus>
                Остаться
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
