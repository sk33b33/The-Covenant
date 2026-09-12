import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { RULES } from '@/game/config'
import { createRng, randomSeed } from '@/game/rng'
import { DIFFICULTY, aiSetup, chooseAction, type AiConfig } from '@/engine/ai'
import { legalActions, setupOptions } from '@/engine/legal'
import { IllegalAction, reduce } from '@/engine/reducer'
import { createMatch } from '@/engine/state'
import type { Action } from '@/engine/actions'
import type { EnergyType } from '@/game/types'
import type { MatchState, PlayerId } from '@/engine/types'

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

/**
 * How long the opponent appears to think before each single action, in ms.
 *
 * This is per *action*, not per turn (see the stepping effect below), so a
 * three-action turn takes three of these. Deliberately unhurried: the whole
 * point of pacing the AI out action by action is that a human can follow
 * what it did, and at under a second per beat the energy attaching, the card
 * landing and the attack all blur into one another again.
 */
const AI_THINKING_MS = 1400

/**
 * @param presenting Blocks the AI from taking its next action while the
 *   screen is still showing the last one. The engine resolves an action the
 *   instant it is taken, but *showing* one — a strike crossing the mat, a
 *   turn hand-off card — takes well over a second, and an ATTACK ends the
 *   attacker's turn in the same reducer call it resolves in. Without this
 *   the two run over each other in both directions: the opponent's first
 *   move arriving under its own turn card, or its next move landing on top
 *   of the attack you are still watching. The screen owns what counts as
 *   "still showing"; this only agrees to wait for it.
 * @param stageAttack Offered every ATTACK the AI decides on, *before* it is
 *   applied, so the screen can fly the attacking card out first and dispatch
 *   the action itself when the card lands (see AttackSortie). Held as a ref
 *   because the screen can only build that callback out of `dispatch`, which
 *   it does not have until this hook has returned. Left unset, or set to a
 *   handler that declines, the action is applied here as it always was.
 * @param handsRevealed Holds both sides' opening-board setup back until the
 *   screen has dealt the opening hand into view. The engine deals it the
 *   instant the match is created, well before the coin has even settled —
 *   without this the opponent (and, under Simulate, "you") would place a
 *   board pulled from a hand nobody has been shown yet, out from under the
 *   screen's own "Match Start" card and empty-handed opening beat.
 */
export function useMatch(
  config: MatchConfig,
  presenting = false,
  stageAttack?: MutableRefObject<((side: PlayerId, action: Action) => boolean) | undefined>,
  handsRevealed = true,
) {
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

  // The match as of the last render, for the AI's own deferred step below to
  // read at the moment it fires rather than as it was when the pause started.
  const latest = useRef(state)
  latest.current = state

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

  // The opponent places its opening board as soon as the coin settles and
  // both hands have been dealt into view.
  const foeSetUp = useRef(false)
  useEffect(() => {
    if (!coinSettled || !handsRevealed || state.phase !== 'setup' || foeSetUp.current) return
    if (state.players.foe.active) return

    foeSetUp.current = true
    const rng = createRng(state.rngState ^ 0x1234abcd)
    const timer = setTimeout(() => setState((s) => reduce(s, aiSetup(s, 'foe', rng))), 400)
    return () => clearTimeout(timer)
  }, [coinSettled, handsRevealed, state])

  // Your own opening board, but only once you've handed the match to
  // Simulate — otherwise this is yours to place by hand, same drag-and-drop
  // as ever. Mirrors `foeSetUp` above rather than sharing it: the two run
  // under different conditions and folding them into one effect would mean
  // guarding foe's half against a flag that has nothing to do with it.
  const meSetUp = useRef(false)
  useEffect(() => {
    if (!simulating || !coinSettled || !handsRevealed || state.phase !== 'setup' || meSetUp.current) return
    if (state.players.you.active) return

    meSetUp.current = true
    const rng = createRng(state.rngState ^ 0x5a5a5a5a)
    const timer = setTimeout(() => setState((s) => reduce(s, aiSetup(s, 'you', rng))), 400)
    return () => clearTimeout(timer)
  }, [simulating, coinSettled, handsRevealed, state])

  // Whichever side the AI is driving right now — the opponent always, and
  // the player too once Simulate has taken the match over — plus any
  // promotion owed after a knockout. One effect for both rather than a
  // second copy of it for 'you': the pacing (the same thinking pause, the
  // same re-check of who's still owed the move before acting on stale
  // state) has no reason to differ between them.
  //
  // One action per pause, not the whole turn at once: attaching energy,
  // playing a card and attacking used to all land in a single state update
  // after one "thinking" pause, so a turn with more than one action in it
  // jumped straight to its end result with nothing to actually watch happen
  // in between — the same information a battle log would have narrated, just
  // never shown anywhere. Committing one action here lets this same effect's
  // own re-run (triggered by the state it just produced) discover the turn
  // isn't over yet and pace out the next action the same way, so every
  // intermediate step the AI takes plays out on the board exactly like the
  // player's own turn does, action by action.
  useEffect(() => {
    if (!coinSettled || state.phase === 'ended' || state.phase === 'setup') return
    // Wait out whatever the screen is still showing, then take the usual
    // thinking pause from there — `presenting` is in this effect's own
    // dependencies, so it re-runs and starts that pause the moment the board
    // is clear again.
    if (presenting) return

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
      setAiThinking(false)

      // Chosen out here rather than inside a `setState` updater, which is
      // where this used to live. An updater has to be pure — React is free to
      // run it twice — and handing an ATTACK to the screen to stage is a side
      // effect, which would fire two sorties for one strike. `latest` stands
      // in for the freshness the updater gave for free: it is written on
      // every render, and any commit that moved the match on would have
      // re-run this effect and cleared this timer before it could fire.
      const s = latest.current
      const stillToMove = s.phase === 'promote' ? s.promoting : s.phase === 'main' ? s.current : null
      const stillAi = stillToMove === 'foe' || (simulating && stillToMove === 'you')
      if (!stillAi || !stillToMove) return

      // A fresh Rng every step rather than one carried across the whole
      // turn — seeded off `log.length` as well as `rngState` so consecutive
      // steps within the same turn still draw independent "mistake" rolls,
      // since `rngState` itself only moves when a game action consumes
      // real randomness (a coin flip, a Blinded miss), not on every action.
      const rng = createRng(s.rngState ^ 0x9e3779b9 ^ (s.log.length * 0x1000193))
      const action = chooseAction(s, stillToMove, difficulty, rng)
      if (!action) return

      // The screen gets first refusal on a strike, so the attacking card can
      // fly before it lands. It dispatches the action itself once the card is
      // home; anything it declines is applied here and now, as ever.
      if (action.type === 'ATTACK' && stageAttack?.current?.(stillToMove, action)) return

      setState((current) => reduce(current, action))
    }, AI_THINKING_MS)

    return () => clearTimeout(timer)
  }, [coinSettled, state, difficulty, simulating, presenting])

  /* ---------------------------------------------------------------- clocks */

  useEffect(() => {
    if (!coinSettled || state.phase === 'ended' || state.phase === 'setup') return

    // Nothing on screen is asking anyone to decide anything yet: the strike
    // is still crossing the mat, or the turn card is up. Charging a player
    // for seconds they cannot act in is the one thing a chess clock must not
    // do, and here it was charging the wrong player as well — an ATTACK ends
    // the attacker's turn in the same reducer call it resolves in, so from
    // the first frame of the animation `current` is already the side that
    // has not been given the board yet. Their clock ran down through the
    // projectile, the hit, the knockout flourish and a 1.75s turn card
    // before they could touch a card.
    //
    // The same hold that keeps the AI from moving over its own animation
    // (see `presenting` above), applied to the clock as well. It is bounded
    // by the animations themselves, so it cannot be used to stall.
    if (presenting) return

    // Whose second this is. Usually the player to move — but during a
    // promotion it is whoever owes the promotion, who is often not the same
    // person. Knock out the opponent's Active and the phase turns to
    // `promote` with `current` still set to you, so the opponent's
    // deliberation was billed to your clock, for a turn that PROMOTE ends
    // anyway. Charging the promoting player instead is both the honest
    // reading and the one that keeps a stall costing the staller.
    const side = state.phase === 'promote' ? state.promoting : state.current
    if (!side) return

    const id = window.setInterval(() => {
      setClocks((prev) => ({
        ...prev,
        [side]: Math.max(0, prev[side] - 1),
        // The turn clock measures a turn in progress, and a promotion is not
        // one: PROMOTE ends the turn the moment it resolves. It is also the
        // clock the player can actually see, under their own deck, so
        // running it against a decision that is not the turn reads as time
        // being taken for nothing.
        turn: state.phase === 'main' ? Math.max(0, prev.turn - 1) : prev.turn,
      }))
    }, 1000)

    return () => window.clearInterval(id)
  }, [coinSettled, state.phase, state.current, state.promoting, presenting])

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
