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
  // Once set, the player's own side plays itself for the rest of the match —
  // one-way, not a pause. Nothing here needs to interrupt it partway through;
  // it exists to hand a match off to the AI, not to referee a tug-of-war over
  // who's driving.
  const [simulating, setSimulating] = useState(false)

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

  // Your own opening board, but only once you've handed the match to
  // Simulate — otherwise this is yours to place by hand, same drag-and-drop
  // as ever. Mirrors `foeSetUp` above rather than sharing it: the two run
  // under different conditions and folding them into one effect would mean
  // guarding foe's half against a flag that has nothing to do with it.
  const meSetUp = useRef(false)
  useEffect(() => {
    if (!simulating || !coinSettled || state.phase !== 'setup' || meSetUp.current) return
    if (state.players.you.active) return

    meSetUp.current = true
    const rng = createRng(state.rngState ^ 0x5a5a5a5a)
    const timer = setTimeout(() => setState((s) => reduce(s, aiSetup(s, 'you', rng))), 400)
    return () => clearTimeout(timer)
  }, [simulating, coinSettled, state])

  // Whichever side the AI is driving right now — the opponent always, and
  // the player too once Simulate has taken the match over — plus any
  // promotion owed after a knockout. One effect for both rather than a
  // second copy of it for 'you': the pacing (the same thinking pause, the
  // same re-check of who's still owed the move before acting on stale
  // state) has no reason to differ between them.
  useEffect(() => {
    if (!coinSettled || state.phase === 'ended' || state.phase === 'setup') return

    const toMove = state.phase === 'promote' ? state.promoting : state.current
    const aiControlled = toMove === 'foe' || (simulating && toMove === 'you')
    if (!aiControlled || !toMove) {
      // The "AI is thinking" tell belongs to the opponent's own chip; a
      // simulated turn on your own side isn't that, so it stays off here.
      setAiThinking(false)
      return
    }

    setAiThinking(toMove === 'foe')
    const timer = setTimeout(() => {
      setState((s) => {
        // Re-check inside the updater: the match may have moved on while the
        // pause elapsed, and acting on stale state would desync the board.
        const stillToMove = s.phase === 'promote' ? s.promoting : s.phase === 'main' ? s.current : null
        const stillAi = stillToMove === 'foe' || (simulating && stillToMove === 'you')
        return stillAi && stillToMove ? playAiTurn(s, stillToMove, difficulty) : s
      })
      setAiThinking(false)
    }, AI_THINKING_MS)

    return () => clearTimeout(timer)
  }, [coinSettled, state, difficulty, simulating])

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
    simulating,
    simulate: useCallback(() => setSimulating(true), []),
  }
}
