import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RULES } from '@/game/config'
import { createRng, randomSeed } from '@/game/rng'
import { DIFFICULTY, aiSetup, playAiTurn, type AiConfig } from '@/engine/ai'
import { legalActions, setupOptions } from '@/engine/legal'
import { IllegalAction, reduce } from '@/engine/reducer'
import { createMatch } from '@/engine/state'
import type { Action } from '@/engine/actions'
import type { EnergyType } from '@/game/types'
import type { MatchState } from '@/engine/types'

/**
 * Drives a match from the screen.
 *
 * All rules live in the engine; this owns only what a screen has to own — when
 * the opponent gets to move, how long the clocks have left, and a short pause
 * before the opponent acts so a human can follow what happened. The engine
 * never learns that any of this exists, which is what keeps it replayable.
 */

export interface MatchConfig {
  playerDeck: { cards: string[]; energy: EnergyType[] }
  opponentDeck: { cards: string[]; energy: EnergyType[] }
  difficulty?: AiConfig
  seed?: number
  /** Forces the coin flip, for scripted story encounters. */
  forceFirst?: 'you' | 'foe'
}

/** How long the opponent appears to think, in ms. */
const AI_THINKING_MS = 850

export function useMatch(config: MatchConfig) {
  const [state, setState] = useState<MatchState>(() =>
    createMatch({
      seed: config.seed ?? randomSeed(),
      you: { deck: config.playerDeck.cards, energy: config.playerDeck.energy },
      foe: { deck: config.opponentDeck.cards, energy: config.opponentDeck.energy },
      ...(config.forceFirst ? { forceFirst: config.forceFirst } : {}),
    }),
  )

  const [error, setError] = useState<string | null>(null)
  const [aiThinking, setAiThinking] = useState(false)

  /** Clocks in seconds. Frozen while the coin is still in the air. */
  const [clocks, setClocks] = useState<{ you: number; foe: number; turn: number }>({
    you: RULES.MATCH_SECONDS,
    foe: RULES.MATCH_SECONDS,
    turn: RULES.TURN_SECONDS,
  })
  const [coinSettled, setCoinSettled] = useState(false)

  const difficulty = config.difficulty ?? DIFFICULTY.steady

  /* --------------------------------------------------------------- acting */

  const dispatch = useCallback((action: Action) => {
    setState((current) => {
      try {
        setError(null)
        return reduce(current, action)
      } catch (e) {
        // An illegal action means the interface offered something it should
        // not have. Surface it and leave the match untouched rather than
        // crashing a game in progress.
        if (e instanceof IllegalAction) {
          setError(e.message)
          return current
        }
        throw e
      }
    })
  }, [])

  const legal = useMemo(
    () => (state.current === 'you' && state.phase === 'main' ? legalActions(state) : []),
    [state],
  )

  const mySetupOptions = useMemo(
    () => (state.phase === 'setup' ? setupOptions(state, 'you') : []),
    [state],
  )

  /* --------------------------------------------------------- the opponent */

  // The opponent places its opening board as soon as the coin settles.
  const foeSetUp = useRef(false)
  useEffect(() => {
    if (!coinSettled || state.phase !== 'setup' || foeSetUp.current) return
    if (state.players.foe.active) return

    foeSetUp.current = true
    const rng = createRng(state.rngState ^ 0x1234abcd)
    const timer = setTimeout(() => setState((s) => reduce(s, aiSetup(s, 'foe', rng))), 400)
    return () => clearTimeout(timer)
  }, [coinSettled, state])

  // The opponent's turns, and any promotion it owes after a knockout.
  useEffect(() => {
    if (!coinSettled || state.phase === 'ended' || state.phase === 'setup') return

    const foeToMove =
      state.phase === 'promote' ? state.promoting === 'foe' : state.current === 'foe'
    if (!foeToMove) {
      setAiThinking(false)
      return
    }

    setAiThinking(true)
    const timer = setTimeout(() => {
      setState((s) => {
        // Re-check inside the updater: the match may have moved on while the
        // pause elapsed, and acting on stale state would desync the board.
        const stillFoe =
          s.phase === 'promote'
            ? s.promoting === 'foe'
            : s.current === 'foe' && s.phase === 'main'
        return stillFoe ? playAiTurn(s, 'foe', difficulty) : s
      })
      setAiThinking(false)
    }, AI_THINKING_MS)

    return () => clearTimeout(timer)
  }, [coinSettled, state, difficulty])

  /* ---------------------------------------------------------------- clocks */

  useEffect(() => {
    if (!coinSettled || state.phase === 'ended' || state.phase === 'setup') return

    const side = state.current
    const id = window.setInterval(() => {
      setClocks((prev) => ({
        ...prev,
        [side]: Math.max(0, prev[side] - 1),
        turn: Math.max(0, prev.turn - 1),
      }))
    }, 1000)

    return () => window.clearInterval(id)
  }, [coinSettled, state.phase, state.current])

  // The turn clock restarts whenever the turn changes hands.
  useEffect(() => {
    setClocks((prev) => ({ ...prev, turn: RULES.TURN_SECONDS }))
  }, [state.turn, state.current])

  // Wall-clock rules live here, not in the engine, which has no notion of time.
  useEffect(() => {
    if (state.phase !== 'main' || state.current !== 'you' || clocks.turn > 0) return
    dispatch({ type: 'END_TURN' })
  }, [clocks.turn, state.phase, state.current, dispatch])

  useEffect(() => {
    if (state.phase === 'ended') return
    if (clocks.you <= 0) dispatch({ type: 'TIMEOUT', player: 'you' })
    else if (clocks.foe <= 0) dispatch({ type: 'TIMEOUT', player: 'foe' })
  }, [clocks.you, clocks.foe, state.phase, dispatch])

  return {
    state,
    dispatch,
    legal,
    mySetupOptions,
    error,
    clearError: useCallback(() => setError(null), []),
    aiThinking,
    clocks,
    coinSettled,
    settleCoin: useCallback(() => setCoinSettled(true), []),
  }
}
