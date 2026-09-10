import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AnimatePresence,
  DragControls,
  animate,
  motion,
  useAnimation,
  useMotionValue,
  type PanInfo,
} from 'framer-motion'
import { BattleMat } from '@/art/BattleMat'
import { CardBack } from '@/art/CardBack'
import { EnergyOrb } from '@/art/EnergyOrb'
import { CheckIcon, ResetIcon } from '@/art/icons'
import { Button } from '@/components/ui'
import { PressableCard } from '@/components/card/PressableCard'
import { requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { canPayCost, figureCard, figuresInPlay } from '@/engine/state'
import { ENERGY_LABEL, isFigure, type EnergyType } from '@/game/types'
import { usePeek } from '@/store/peek'
import { useProfile } from '@/store/profile'
import { asset } from '@/lib/asset'
import { cx } from '@/lib/cx'
import { ActionSheet, type SheetOption } from './battle/ActionSheet'
import {
  AttackFx,
  attackGlow,
  impactDelaySeconds,
  shakeFor,
  windupDelaySeconds,
  type AttackFxTrigger,
} from './battle/AttackFx'
import { BoardFigure } from './battle/BoardFigure'
import { TurnAnnounce, type TurnCue } from './battle/TurnAnnounce'
import { useMatch, type MatchConfig } from './battle/useMatch'
import type { Action } from '@/engine/actions'
import type { FigureInPlay, MatchState, PlayerId } from '@/engine/types'

/**
 * The battle screen.
 *
 * Renders engine state and dispatches actions; it holds no rules of its own.
 * Anything the player can do comes from `legal`, which is the same list the AI
 * chooses from — so the interface cannot offer an illegal move, and cannot hide
 * a legal one.
 */

// Smaller than the original size on purpose: shrinking the Active card and
// Bench slots on both sides frees up real vertical room on the board, so nothing
// packed this tightly risks the rows themselves running into each other or into
// the hand tray below — the same class of overlap that was hiding cards in the
// hand, just one level up.
const ACTIVE_W = 80
const BENCH_W = 48
/** The discard pile's own width — narrower than the deck it sits with,
 *  since this is what has already left play. Shared with the spacer that
 *  keeps the opponent's clock/points/turn stack level with their deck once
 *  the two piles swap places, so the two never drift out of sync. */
const DISCARD_W = 42
const DISCARD_H = (DISCARD_W * 88) / 63
// Smaller than before on purpose: a smaller card overlaps its neighbour by
// less at the same fan spacing, which is real breathing room around each
// card's own tappable centre, not just a smaller footprint.
const HAND_W = 54

/** Tall enough for a lifted card plus the fan's own arc, at the widest hands
 *  this game deals — scaled down along with HAND_W. */
const HAND_HEIGHT = 90

/** How long a finger has to stay down on the hand before it starts browsing
 *  (widening the fan, popping up whichever card it's over) rather than
 *  simply being the start of an ordinary tap or drag. */
const HOLD_TO_FAN_MS = 130

/** The four custom properties `.cov-hand-glow`'s pulse (global.css) reads,
 *  one set per way a card can be viable — set inline per card rather than
 *  through a modifier class, since sibling class rules placed after
 *  `.cov-hand-glow` in that file were, for reasons never pinned down,
 *  silently dropped from the stylesheet the browser actually loaded. */
const VIABILITY_GLOW: Record<'use' | 'ascend' | 'ability', React.CSSProperties> = {
  // Twice the luminosity of the other two: alpha pushed to its ceiling
  // (doubling .55/.3/.75 and clamping at the opaque max is what "double" means
  // once a channel is already past half) and the blur radius itself doubled
  // to keep growing where alpha alone has nowhere left to go.
  use: {
    ['--cov-hand-glow-dim-ring' as string]: 'rgba(229,192,140,1)',
    ['--cov-hand-glow-dim-blur' as string]: 'rgba(229,192,140,.6)',
    ['--cov-hand-glow-bright-ring' as string]: 'var(--gold-bright)',
    ['--cov-hand-glow-bright-blur' as string]: 'rgba(229,192,140,1)',
    ['--cov-hand-glow-dim-blur-size' as string]: '12px',
    ['--cov-hand-glow-bright-blur-size' as string]: '32px',
  } as React.CSSProperties,
  ascend: {
    ['--cov-hand-glow-dim-ring' as string]: 'rgba(240,240,245,.55)',
    ['--cov-hand-glow-dim-blur' as string]: 'rgba(240,240,245,.3)',
    ['--cov-hand-glow-bright-ring' as string]: '#ffffff',
    ['--cov-hand-glow-bright-blur' as string]: 'rgba(255,255,255,.75)',
  } as React.CSSProperties,
  ability: {
    ['--cov-hand-glow-dim-ring' as string]: 'rgba(214,68,58,.55)',
    ['--cov-hand-glow-dim-blur' as string]: 'rgba(214,68,58,.3)',
    ['--cov-hand-glow-bright-ring' as string]: 'rgb(232,84,72)',
    ['--cov-hand-glow-bright-blur' as string]: 'rgba(214,68,58,.75)',
  } as React.CSSProperties,
}

/** How far your own Active/Bench row is pulled up past its normal flex flow,
 *  so it crosses into the mat's clash ring instead of merely approaching its
 *  edge — see the render site for the measurement this is based on. */
const YOU_ROW_LIFT = 139.3

/** A small nudge of the opponent's Active/Bench row toward the halfway
 *  line, the mirror of YOU_ROW_LIFT but far more modest — their side
 *  already sat close to the ring, so this only needs to close the last bit
 *  of the gap rather than cross into it. */
const FOE_ROW_LIFT = 20

/**
 * Extra air between a Bench row and its own Active, on top of the flex gap.
 *
 * Attached energy hangs 12px below a Figure's card edge (see BoardFigure's
 * `-bottom-3` energy row), and the rows were only a 4px gap apart — so the
 * orbs kept landing on the card in the next row rather than in clear space:
 * your Active's energy under your Bench, their Bench's energy on their
 * Active, and both rows reading as one stack.
 *
 * It moves each Bench *away from its own Active*, which is downward on your
 * side and upward on theirs, because the two sit on opposite sides of their
 * Active — the opponent's Bench is above their Active, not below it.
 */
const BENCH_CLEARANCE = 12

// The hand tray sits outside the flex flow (see the board container below),
// so nothing else reserves its footprint automatically any more — anything
// that needs to know its height, or clear it, reads this one calc.
const HAND_TRAY_CALC = `calc(${HAND_HEIGHT}px + 8px + env(safe-area-inset-bottom, 0px))`

export interface BattleProps extends MatchConfig {
  /** Shown in the opponent's nameplate. */
  opponentName?: string
  themeType?: EnergyType
  onFinish?: (won: boolean) => void
  onExit: () => void
}

export function Battle({ opponentName = 'Opponent', themeType = 'earth', onFinish, onExit, ...config }: BattleProps) {
  // Declared up here, ahead of `useMatch`, only so the hold below can be
  // handed to it: everything that drives them lives further down with the
  // rest of the presentation.
  const [attackFx, setAttackFx] = useState<AttackFxTrigger | null>(null)
  const [turnCue, setTurnCue] = useState<TurnCue | null>(null)

  // Nothing the engine does is allowed to land while a strike is still in
  // the air or a hand-off card is still on screen. The engine resolves an
  // action the instant it is taken, but showing one takes over a second, and
  // without this the two run over each other in both directions: the AI's
  // first move arriving under its own turn card, or its next move arriving
  // on top of the attack you just watched it make.
  const presenting = attackFx !== null || turnCue !== null

  const {
    state,
    dispatch,
    legal,
    error,
    clearError,
    aiThinking,
    clocks,
    coinSettled,
    settleCoin,
    simulating,
    simulate,
  } = useMatch(config, presenting)

  const [sheet, setSheet] = useState<{ title: string; subtitle?: string; options: SheetOption[] } | null>(
    null,
  )
  const peek = usePeek((s) => s.peek)
  // Active and Bench picks live in one object updated functionally. Held as
  // two independent pieces of state and set from a stale closure, three taps
  // inside one React batch all saw `active` as null and overwrote each other,
  // so a player who tapped quickly started with an empty Bench.
  const [setup, setSetup] = useState<{ active: number | null; bench: (number | null)[] }>({
    active: null,
    bench: Array(RULES.BENCH_SIZE).fill(null),
  })
  const setupActive = setup.active
  const setupBench = setup.bench
  const [actionOpen, setActionOpen] = useState(false)

  /**
   * Which side's discard banner is open, if either — lifted up here rather
   * than kept local to the button that opens it, and rendered from the
   * top-level overlay list below rather than beside that button.
   *
   * Both halves matter. `DiscardPile` sits deep inside the board's own
   * `z-10` column, one sibling among several at the app's root;
   * the hand tray is a *different* z-10 sibling, later in the DOM. Tying
   * for z-index resolves by DOM order, and stacking contexts don't let a
   * high z-index buried inside one sibling reach outside it to outrank a
   * different sibling — so a banner rendered from inside the board column,
   * however high its own z-index claimed to be, could never actually paint
   * above the hand tray next to it. That was the bug: opening the discard
   * strip left the fanned hand drawn on top of it. Rendering the strip from
   * this component's own top-level overlay list — the same list AttackFx,
   * TurnAnnounce and Result already use — puts it in the one stacking
   * context that is actually a sibling of the hand tray, which is what
   * lets it finally sit above it.
   */
  const [viewingDiscard, setViewingDiscard] = useState<PlayerId | null>(null)

  const you = state.players.you
  const foe = state.players.foe
  // Simulate hands your side to the AI, so none of the manual controls that
  // gate off `myTurn`/`mustPromote` should still answer to a tap once it's
  // running — the two would otherwise race to act on the same turn.
  const myTurn = state.phase === 'main' && state.current === 'you' && !simulating
  const mustPromote = state.phase === 'promote' && state.promoting === 'you' && !simulating
  const setupPhase = state.phase === 'setup'
  // Which side is to move, for the status under each deck. Unlike `myTurn`
  // these ignore Simulate: the label there reports which side the match is
  // waiting on, which stays true whoever is driving it.
  const youTurn = state.phase === 'main' && state.current === 'you'
  const foeTurn = state.phase === 'main' && state.current === 'foe'

  // Errors are transient; a stale one under a later action reads as a new bug.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(clearError, 2600)
    return () => clearTimeout(timer)
  }, [error, clearError])

  /* --------------------------------------------------------- attack effect */

  // The lunge (attacker) and hit-shake (defender) live on the real board
  // pieces, imperative controls rather than a declarative `animate` prop —
  // two attacks in a row can otherwise land on an *identical* target (same
  // Figure, same shake), which framer treats as nothing having changed and
  // never replays. Each side only ever plays one of the two roles at a time,
  // so one controls object per side covers both.
  const youFigureFx = useAnimation()
  const foeFigureFx = useAnimation()
  // Whoever was standing in each Active slot as of the previous commit.
  //
  // A knockout empties the slot the instant the engine resolves the attack —
  // `knockOut` sets `active` to null and moves the card to the discard — so
  // by the time the strike is on screen there is nothing left in the slot
  // for it to hit, and the Figure appeared to vanish before the blow that
  // killed it ever landed. Remembering the last occupant lets the board go
  // on drawing it until the strike is done. Kept current by an effect
  // declared *after* the one that reads it, so a read during the attack's
  // own commit still sees the Figure as it stood before the hit.
  const prevActives = useRef<{ you: FigureInPlay | null; foe: FigureInPlay | null }>({
    you: null,
    foe: null,
  })

  /** A Figure a fatal blow has taken off the board, held on the mat until
   *  the strike that felled it has finished playing. */
  const [dying, setDying] = useState<{ side: PlayerId; figure: FigureInPlay } | null>(null)

  /**
   * The last real type either side's Altar actually held, kept across the
   * gap after it's spent.
   *
   * The Altar goes back to `null` the instant its energy is attached — the
   * same turn it was granted — and stays `null` for the rest of that turn
   * and the whole of the opponent's, right up until the next real grant. A
   * greyed-out zone has to show *something* through that whole stretch, and
   * the honest thing to show is what was just spent, not a fresh guess.
   * Seeded from `nextAltar` rather than left empty, so the very first time a
   * side's Altar has never held anything yet — before its own opening turn
   * — there is still a real, correct type to grey out rather than nothing.
   */
  const lastAltarType = useRef<{ you: EnergyType; foe: EnergyType }>({
    you: you.nextAltar,
    foe: foe.nextAltar,
  })
  useEffect(() => {
    if (you.altar) lastAltarType.current.you = you.altar
  }, [you.altar])
  useEffect(() => {
    if (foe.altar) lastAltarType.current.foe = foe.altar
  }, [foe.altar])

  // Set the instant a strike starts and cleared when it has played out.
  // A ref rather than the `attackFx` state above because the turn hand-off
  // below has to read it *in the same commit* this effect sets it: an ATTACK
  // ends the attacker's turn in the same reducer call, so both land together,
  // and a state value set here would still read null over there.
  const fxInFlight = useRef(false)

  useEffect(() => {
    const ev = state.lastAttack
    if (!ev) return

    const fromEl = ev.by === 'you' ? activeSlotRef.current : foeActiveSlotRef.current
    const toEl = ev.by === 'you' ? foeActiveSlotRef.current : activeSlotRef.current
    // Missing either slot means there's nothing on screen yet to animate
    // between — a rare timing edge (e.g. the very first paint) rather than
    // something worth a fallback for.
    if (!fromEl || !toEl) return

    const attacker = ev.by === 'you' ? youFigureFx : foeFigureFx
    const defender = ev.by === 'you' ? foeFigureFx : youFigureFx
    // You sit below the clash ring and lunge up toward it; the opponent
    // lunges down toward you — both lunge *toward the middle*, not toward a
    // fixed compass direction.
    const lungeDir = ev.by === 'you' ? -1 : 1

    // The engine has already cleared a felled Figure out of its slot. Put
    // the one that was standing there back on the mat, exactly as it stood,
    // for as long as the strike takes.
    if (ev.knockedOut) {
      const victimSide: PlayerId = ev.by === 'you' ? 'foe' : 'you'
      const victim = prevActives.current[victimSide]
      if (victim) setDying({ side: victimSide, figure: victim })
    }

    // A bigger recoil than a routine card game needs, deliberately — this
    // effect is meant to read as amplified, not restrained.
    //
    // Prefixed with a short coil-and-glow rather than firing the lunge cold:
    // AttackFx now spends `windupSeconds` gathering the element into the
    // card before anything leaves it (see AttackFx.tsx's own `Charge`), and
    // this is the real board piece's half of that same beat — a small pull
    // *away* from the lunge direction while an element-coloured glow builds
    // on the card, both timed to peak exactly where the coil hands off to
    // the release. The glow's colour is fixed across every keyframe on
    // purpose: framer can only tween a `filter` smoothly when every stop
    // shares the same function list, so only the blur radius and brightness
    // move — a colour that also changed would make the browser step between
    // keyframes instead of blending them.
    const windupSeconds = windupDelaySeconds(ev)
    const lungeSeconds = 0.42
    const totalSeconds = windupSeconds + lungeSeconds
    const coiledAt = windupSeconds / totalSeconds
    const releasedAt = (windupSeconds + lungeSeconds * 0.4) / totalSeconds
    const glowColor = attackGlow(ev).glow

    attacker.start({
      y: [0, -lungeDir * 6, lungeDir * 20, 0],
      filter: [
        `drop-shadow(0 0 0px ${glowColor}) brightness(1)`,
        `drop-shadow(0 0 7px ${glowColor}) brightness(1.05)`,
        `drop-shadow(0 0 18px ${glowColor}) brightness(1.3)`,
        `drop-shadow(0 0 0px ${glowColor}) brightness(1)`,
      ],
      transition: {
        duration: totalSeconds,
        times: [0, coiledAt, releasedAt, 1],
        ease: 'easeOut',
      },
    })

    if (!ev.missed) {
      setTimeout(() => {
        const shake = shakeFor(ev)
        defender.start({
          x: [0, -shake.amount, shake.amount, -shake.amount * 0.6, 0],
          transition: { duration: shake.seconds, ease: 'easeOut' },
        })
        // The held Figure's HP drains at the moment of contact rather than
        // when the engine resolved the hit, so the bar empties on the blow
        // that emptied it instead of before the blow arrives.
        setDying((d) => (d ? { ...d, figure: { ...d.figure, damage: figureCard(d.figure).hp } } : d))

        // A knockout gets a little extra than just a harder shake: a beat of
        // recoil-scale on the card itself, so the "finishing blow" reads as
        // heavier than the shake alone would carry.
        if (ev.knockedOut) {
          defender.start({
            scale: [1, 0.92, 1],
            transition: { duration: 0.3, ease: 'easeOut' },
          })
        }
      }, impactDelaySeconds(ev) * 1000)
    }

    fxInFlight.current = true
    setAttackFx({ event: ev, fromRect: fromEl.getBoundingClientRect(), toRect: toEl.getBoundingClientRect() })
    // Re-fires only when a genuinely new attack lands — `id` only ever
    // increases, so this can't retrigger off an unrelated state update that
    // happens to carry the same `lastAttack` forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAttack?.id])

  // Deliberately after the effect above and deliberately without deps: it
  // has to run on every commit, and it has to run *second*, so that the
  // attack effect still reads the board as it stood before the hit.
  useEffect(() => {
    prevActives.current = { you: you.active, foe: foe.active }
  })

  /* ------------------------------------------------------- turn hand-off */

  // Announced once per hand-off, keyed by turn *and* side so a promotion
  // dropping back into 'main' on the same turn can't re-announce it. Skipped
  // while simulating: with both sides on the AI, "Your turn" would be a lie.
  //
  // Declared *after* the attack effect above, and deliberately so: effects
  // run top to bottom within a commit, and an ATTACK ends the attacker's
  // turn in the same reducer call it resolves in, so the strike and the
  // hand-off arrive together. Running second is what lets this see the flag
  // the strike just raised and hold the card back until the blow has landed
  // — otherwise the opponent's attack plays out underneath a banner already
  // announcing your turn.
  const announced = useRef<string | null>(null)
  const pendingCue = useRef<TurnCue | null>(null)
  useEffect(() => {
    if (!coinSettled || simulating || state.phase !== 'main') return
    const key = `${state.turn}:${state.current}`
    if (announced.current === key) return
    announced.current = key

    const cue: TurnCue = { key, mine: state.current === 'you' }
    if (fxInFlight.current) pendingCue.current = cue
    else setTurnCue(cue)
  }, [coinSettled, simulating, state.phase, state.turn, state.current])

  /** The strike has finished; let the felled Figure go, and show the
   *  hand-off it was holding up, if any. */
  const releaseAttackFx = () => {
    setAttackFx(null)
    setDying(null)
    fxInFlight.current = false
    if (pendingCue.current) {
      setTurnCue(pendingCue.current)
      pendingCue.current = null
    }
  }

  // The SETUP action removes the placed cards from hand, which shifts every
  // later card's index down — so a picked-card's hand index left sitting in
  // local state would start pointing at a different card the moment setup
  // ends, mislabelling it ACTIVE or BENCH in the fan for the rest of the
  // match. Nothing in this state is worth keeping once it has been spent.
  useEffect(() => {
    if (state.phase !== 'setup') setSetup({ active: null, bench: Array(RULES.BENCH_SIZE).fill(null) })
  }, [state.phase])

  // Recorded the moment the match ends, not when the result is *shown*
  // below: the win is banked even if the player backgrounds the app while
  // the finishing blow is still playing out.
  const recordBattle = useProfile((s) => s.recordBattle)
  const [recorded, setRecorded] = useState(false)
  useEffect(() => {
    if (state.phase !== 'ended' || recorded) return
    setRecorded(true)
    const won = state.winner === 'you'
    recordBattle(won)
    onFinish?.(won)
  }, [state.phase, state.winner, recorded, recordBattle, onFinish])

  /**
   * When the result screen is allowed up.
   *
   * A match-winning attack ends the match in the same reducer call it
   * resolves in, so 'ended' arrives while the strike is still crossing the
   * mat — the win screen was dropping over the top of the blow that won it.
   * It now waits for the strike to finish and the felled Figure to leave the
   * slot (both released together, see `releaseAttackFx`), plus a beat to see
   * the empty slot it left behind before the screen covers the board.
   *
   * A match that ends without an attack — a deck running out, a concede —
   * has nothing in flight and only waits out that same short beat.
   */
  const [resultReady, setResultReady] = useState(false)
  useEffect(() => {
    if (state.phase !== 'ended') return
    // Both, for the same reason the turn hand-off needs both: the winning
    // attack raises the ref in this very commit, while `setAttackFx` from
    // that same effect has not been applied yet and still reads null here.
    // The state is what re-runs this once the strike is over; the ref is
    // what stops it firing before the strike has even been drawn.
    if (attackFx || fxInFlight.current) return
    const timer = setTimeout(() => setResultReady(true), 420)
    return () => clearTimeout(timer)
  }, [state.phase, attackFx])

  /* ------------------------------------------------------------- helpers */

  const actionsFor = useMemo(() => {
    const byHand = new Map<number, Action[]>()
    const byUid = new Map<string, Action[]>()
    const attacks: Action[] = []
    const retreats: Action[] = []

    for (const action of legal) {
      switch (action.type) {
        case 'PLAY_FIGURE':
        case 'ASCEND':
        case 'PLAY_COVENANT':
        case 'PLAY_RELIC': {
          const list = byHand.get(action.hand) ?? []
          list.push(action)
          byHand.set(action.hand, list)
          break
        }
        case 'ATTACH': {
          const list = byUid.get(action.uid) ?? []
          list.push(action)
          byUid.set(action.uid, list)
          break
        }
        case 'ATTACK':
          attacks.push(action)
          break
        case 'RETREAT':
          retreats.push(action)
          break
        default:
          break
      }
    }

    return { byHand, byUid, attacks, retreats }
  }, [legal])

  /* --------------------------------------------------------------- setup */

  const basicsInHand = you.hand
    .map((cardId, index) => ({ cardId, index }))
    .filter(({ cardId }) => {
      const card = requireCard(cardId)
      return isFigure(card) && card.stage === 'basic'
    })

  // Bench is a fixed-length array of hand indices, one slot at a time — the
  // shape a drag has to target a *specific* slot, not just "the bench" as an
  // unordered set. Clearing a card's previous position before placing it
  // anywhere new is what makes both the drag drop and the tap fallback below
  // safe to call unconditionally: a card can never end up picked twice.
  const clearPick = (prev: typeof setup, index: number) => ({
    active: prev.active === index ? null : prev.active,
    bench: prev.bench.map((i) => (i === index ? null : i)),
  })

  const placeActive = (index: number) =>
    setSetup((prev) => ({ ...clearPick(prev, index), active: index }))

  const placeBench = (index: number, slot: number) =>
    setSetup((prev) => {
      const cleared = clearPick(prev, index)
      const bench = [...cleared.bench]
      bench[slot] = index
      return { active: cleared.active, bench }
    })

  /** The small reset button: clears every setup pick so a misdropped card can
   *  be dragged again from a clean hand instead of dragged a second time onto
   *  the slot it is already sitting in. */
  const resetSetup = () => setSetup({ active: null, bench: Array(RULES.BENCH_SIZE).fill(null) })

  const startBattle = () => {
    if (setupActive === null) return
    // The SETUP action only ever fills Bench slots in submission order —
    // there is no "specific slot" at this stage of the game, only a count —
    // so a sparse { null, 3, null } compacts to [3] here without losing
    // anything the reducer would have cared about.
    const bench = setupBench.filter((i): i is number => i !== null)
    dispatch({ type: 'SETUP', player: 'you', active: setupActive, bench })
  }

  /* ------------------------------------------------------------- sheets */

  const openHandCard = (index: number) => {
    const cardId = you.hand[index]
    if (cardId === undefined) return
    const card = requireCard(cardId)

    const actions = actionsFor.byHand.get(index) ?? []

    // Anything that goes *onto the board* — a Basic into a Bench slot, an
    // ascension onto a Figure already standing — is placed by dragging it
    // there, and so has no entry here. Offering both routes meant a drag
    // ending a few pixels outside a slot popped open a list asking which
    // slot to use, which is precisely the question the drag had just
    // answered by hand.
    const placed = (a: Action) => a.type === 'PLAY_FIGURE' || a.type === 'ASCEND'
    const options: SheetOption[] = actions.filter((a) => !placed(a)).map((action, i) => {
      switch (action.type) {
        case 'PLAY_RELIC': {
          const onto = figuresInPlay(you).find((f) => f.uid === action.targetUid)
          return {
            id: `relic-${i}`,
            label: onto ? `Attach to ${requireCard(onto.cardId).name}` : 'Play',
            onSelect: () => dispatch(action),
          }
        }
        default:
          return { id: `covenant-${i}`, label: 'Play', onSelect: () => dispatch(action) }
      }
    })

    // A card whose only plays are placements is drag-only right now: opening
    // an empty sheet, or one claiming it cannot be played when it plainly
    // can, would each be worse than the tap simply doing nothing. Holding it
    // still shows the card, which is what a tap would have been good for.
    if (options.length === 0 && actions.some(placed)) return

    if (options.length === 0 && myTurn) {
      options.push({
        id: 'none',
        label: 'Cannot be played',
        reason: reasonCardIsStuck(state, cardId),
        disabled: true,
        onSelect: () => {},
      })
    }

    setSheet({
      title: card.name,
      subtitle: 'text' in card ? card.text : undefined,
      options,
    })
  }

  const openActive = () => {
    const active = you.active
    if (!active || !myTurn) return

    const card = figureCard(active)

    const attackOptions: SheetOption[] = card.attacks.map((attack, attackIndex) => {
      const affordable = canPayCost(active, attack.cost)
      const legalNow = actionsFor.attacks.some(
        (a) => a.type === 'ATTACK' && a.attackIndex === attackIndex,
      )

      return {
        id: `attack-${attackIndex}`,
        label: attack.name,
        detail: attack.text,
        cost: attack.cost,
        damage: attack.damage,
        disabled: !legalNow,
        reason: !affordable
          ? 'Not enough energy attached'
          : state.turn === 1 && state.first === 'you'
            ? 'Going first: no attack on turn 1'
            : 'Not available right now',
        onSelect: () => dispatch({ type: 'ATTACK', attackIndex }),
      }
    })

    const retreatOptions: SheetOption[] = actionsFor.retreats.flatMap((action) => {
      if (action.type !== 'RETREAT') return []
      const incoming = you.bench[action.benchIndex]
      if (!incoming) return []
      return [
        {
          id: `retreat-${action.benchIndex}`,
          label: `Retreat for ${requireCard(incoming.cardId).name}`,
          detail: `Costs ${figureCard(active).retreat} energy`,
          onSelect: () => dispatch(action),
        },
      ]
    })

    // Not a sheet. Your Active Figure is the card you look at most and the one
    // you act with, so a single tap lifts it into the viewer with its attacks
    // listed beneath — you read the card at a size worth reading and choose
    // the move without a second gesture. Everything else on the mat is a
    // hold-to-inspect, and the sheet stays for lists that are about a choice
    // rather than about one card.
    peek(card, {
      actions: [...attackOptions, ...retreatOptions],
      actionsNote: `${Math.max(0, card.hp - active.damage)} of ${card.hp} HP · ${active.energy.length} energy`,
    })
  }

  const openBench = (i: number) => {
    const figure = you.bench[i]
    if (!figure || !myTurn) return

    const card = figureCard(figure)

    // No sheet, and (for now) no actions: nothing in the card pool has an
    // ability usable from the bench yet, so there is nothing to list beneath
    // it. The tap still lifts the card into the viewer for its tilt and its
    // live HP/energy — the same reason a bench Figure exists to look at, even
    // before it has something to press a second gesture to do.
    peek(card, {
      actionsNote: `${Math.max(0, card.hp - figure.damage)} of ${card.hp} HP · ${figure.energy.length} energy`,
    })
  }

  /* --------------------------------------------------------------- drag */

  // Drop targets for the setup-phase hand drag: the Active slot and each
  // Bench slot's own wrapping element, measured at drop time rather than
  // cached, since the mat reflows with the viewport and with orientation.
  const activeSlotRef = useRef<HTMLDivElement>(null)
  const benchSlotRefs = useRef<(HTMLDivElement | null)[]>([])
  // Read only for its screen position when an attack fires — see the effect
  // below. Nothing else on this side needs to find its own Active slot the
  // way setup's drag-and-drop needs yours (hence no foe equivalent of the
  // padded/hit-test helpers just below).
  const foeActiveSlotRef = useRef<HTMLDivElement>(null)

  // A drop target padded a few px beyond its own box, so a drop that lands
  // just outside a slot's visible edge — an easy miss on a small touchscreen
  // target — still counts, rather than silently snapping back to hand with no
  // explanation.
  const DROP_PAD = 14
  // A much larger, separate radius that only ever gates the *magnetic ghost
  // preview* below — never the actual drop. Wanting the card to visibly
  // start pulling toward a slot before the finger is almost on top of it
  // means this has to be generous; it never has to be exact, since the real
  // drop is still judged by DROP_PAD alone.
  const MAGNET_PAD = 46
  const withinPad = (el: HTMLDivElement | null, point: { x: number; y: number }, pad: number) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return (
      point.x >= r.left - pad && point.x <= r.right + pad && point.y >= r.top - pad && point.y <= r.bottom + pad
    )
  }
  const within = (el: HTMLDivElement | null, point: { x: number; y: number }) => withinPad(el, point, DROP_PAD)

  const slotAt = (point: { x: number; y: number }): HTMLDivElement | null => {
    if (within(activeSlotRef.current, point)) return activeSlotRef.current
    return benchSlotRefs.current.find((el) => within(el, point)) ?? null
  }

  const magnetSlotAt = (point: { x: number; y: number }): HTMLDivElement | null => {
    if (withinPad(activeSlotRef.current, point, MAGNET_PAD)) return activeSlotRef.current
    return benchSlotRefs.current.find((el) => withinPad(el, point, MAGNET_PAD)) ?? null
  }

  type MagnetTarget = { kind: 'active' } | { kind: 'bench'; index: number }

  /** Which named slot a drop-target element is, if any — resolved once at
   *  drag time rather than compared by element identity at render time, so
   *  the slots below never have to read a ref during their own render. */
  const magnetTargetOf = (el: HTMLDivElement | null): MagnetTarget | null => {
    if (!el) return null
    if (el === activeSlotRef.current) return { kind: 'active' }
    const index = benchSlotRefs.current.indexOf(el)
    return index !== -1 ? { kind: 'bench', index } : null
  }

  // The slot a dragged hand card is currently being magnetically pulled
  // toward, if any, and which card is on offer there — read by the Active
  // and Bench slots below to show a live preview of the card seated in
  // place before the finger has actually released it.
  const [magnet, setMagnet] = useState<{ target: MagnetTarget; cardId: string } | null>(null)

  // The live "will this land here?" highlight is applied straight to the DOM
  // rather than through React state. A card fires this on every frame of a
  // drag, and re-rendering the whole board that often turned out to be
  // enough to make framer's own drag recognition occasionally drop the
  // gesture entirely — the highlight is worth showing, but not at the cost of
  // the drag itself sometimes silently failing to register. The same slot
  // refs serve two different drags — the Altar looking for an occupied one to
  // attach to, and (below) a hand card during setup, where every slot is a
  // legal target and there's nothing to distinguish this from the persistent
  // multi-slot glow — so this checks for either child rather than assuming
  // which one is present.
  const lastHighlighted = useRef<HTMLDivElement | null>(null)
  const setHighlight = (el: HTMLDivElement | null) => {
    if (lastHighlighted.current === el) return
    lastHighlighted.current
      ?.querySelector('.cov-slot-outline, .cov-figure-card')
      ?.classList.remove('cov-slot-drag-target')
    el?.querySelector('.cov-slot-outline, .cov-figure-card')?.classList.add('cov-slot-drag-target')
    lastHighlighted.current = el
  }

  /** The Figure occupying a uid, resolved back to the slot element it's
   *  standing in — the inverse of `figureAt` below, needed for ASCEND
   *  targets, which name a uid rather than a slot index. */
  const elForUid = (uid: string): HTMLDivElement | null => {
    if (you.active?.uid === uid) return activeSlotRef.current
    const index = you.bench.findIndex((figure) => figure?.uid === uid)
    return index !== -1 ? (benchSlotRefs.current[index] ?? null) : null
  }

  /**
   * Every slot a hand card could legally land on right now, mid-match — a
   * PLAY_FIGURE names its own empty Bench slot directly, an ASCEND names the
   * uid of the Figure it lands on. During setup every slot is legal for any
   * Basic (a pick always overwrites whatever it was resting on), so there's
   * nothing to enumerate from `legal` there.
   */
  const viableSlotsFor = (index: number): HTMLDivElement[] => {
    if (setupPhase) {
      if (!basicsInHand.some((b) => b.index === index)) return []
      return [activeSlotRef.current, ...benchSlotRefs.current].filter(
        (el): el is HTMLDivElement => el !== null,
      )
    }
    const actions = actionsFor.byHand.get(index) ?? []
    const els: HTMLDivElement[] = []
    for (const action of actions) {
      const el =
        action.type === 'PLAY_FIGURE'
          ? benchSlotRefs.current[action.slot]
          : action.type === 'ASCEND'
            ? elForUid(action.uid)
            : null
      if (el) els.push(el)
    }
    return els
  }

  // The green "you can drop it here" glow that fills every viable slot for
  // the whole length of a hand-card drag, not just whichever one the finger
  // is nearest — computed once, the moment the card leaves the fan, rather
  // than on every frame like `setHighlight` above: the set of legal targets
  // for a given card can't change mid-drag (nothing but this player's own
  // dispatch changes `legal`, and dragging isn't one), so there's nothing to
  // re-derive on each frame, only to set once and clear once.
  const glowingSlots = useRef<HTMLDivElement[]>([])
  const setViableGlow = (els: HTMLDivElement[]) => {
    glowingSlots.current.forEach((el) =>
      el.querySelector('.cov-slot-outline, .cov-figure-card')?.classList.remove('cov-slot-viable-glow'),
    )
    glowingSlots.current = els
    els.forEach((el) =>
      el.querySelector('.cov-slot-outline, .cov-figure-card')?.classList.add('cov-slot-viable-glow'),
    )
  }

  const handleHandDragStart = (index: number) => setViableGlow(viableSlotsFor(index))

  /** The Figure a drop target's own ref currently belongs to, if any — the
   *  Active slot's ref and each Bench slot's ref outlive whichever Figure
   *  (or nothing) currently occupies them. */
  const figureAt = (el: HTMLDivElement | null): FigureInPlay | null => {
    if (el === activeSlotRef.current) return you.active
    const slot = benchSlotRefs.current.indexOf(el)
    return slot !== -1 ? (you.bench[slot] ?? null) : null
  }

  /**
   * What a hand card dropped at this point would actually do, mid-battle.
   *
   * Setup places cards through its own local state — there is no Figure in
   * play yet to evolve, and the legal-action list doesn't exist until SETUP
   * is dispatched. Once the match is running, both drops a hand card can make
   * are real dispatches: an empty Bench slot takes a Basic via PLAY_FIGURE, an
   * occupied one (Active included) takes its next stage via ASCEND if the
   * card in hand ascends from what's standing there. Reading the answer off
   * `legal` rather than re-deriving eligibility here is what keeps a drag from
   * ever being able to offer a move the engine wouldn't.
   */
  const legalDropAt = (index: number, el: HTMLDivElement | null) => {
    if (!el) return null
    const actions = actionsFor.byHand.get(index) ?? []
    const figure = figureAt(el)
    const action = figure
      ? actions.find((a) => a.type === 'ASCEND' && a.uid === figure.uid)
      : actions.find((a) => a.type === 'PLAY_FIGURE' && el === benchSlotRefs.current[a.slot])
    return action ? { el, action } : null
  }

  const legalHandDrop = (index: number, point: { x: number; y: number }) => legalDropAt(index, slotAt(point))

  const handleHandDrag = (index: number, point: { x: number; y: number }) => {
    if (setupPhase) {
      // Any slot within magnet range is a legal target during setup — a
      // pick always overwrites whatever it was resting on (clearPick), so
      // there's no equivalent of an "occupied, not for you" slot to exclude.
      const target = magnetTargetOf(magnetSlotAt(point))
      setMagnet(target ? { target, cardId: you.hand[index]! } : null)
      return
    }
    const magnetEl = magnetSlotAt(point)
    const magnetDrop = magnetEl ? legalDropAt(index, magnetEl) : null
    // Only for landing a Basic in an empty slot, not for ascending onto one
    // that's already occupied — that Figure is already visibly right there,
    // and a ghost card layered over it would just look like a collision
    // rather than a preview of where this one is headed.
    const target = magnetDrop && magnetDrop.action.type === 'PLAY_FIGURE' ? magnetTargetOf(magnetDrop.el) : null
    setMagnet(target ? { target, cardId: you.hand[index]! } : null)
  }

  const handleHandDragEnd = (index: number, point: { x: number; y: number }) => {
    setViableGlow([])
    setMagnet(null)
    if (setupPhase) {
      // Only a Basic Figure can open on the board. This used to be enforced
      // by the card being an inert, undraggable button — now that every card
      // in hand can be picked up and moved, the rule has to live where the
      // drop is actually resolved, or a Covenant could be dropped into the
      // Active slot and set as your opening Figure.
      if (!basicsInHand.some((b) => b.index === index)) return

      const el = slotAt(point)
      if (el === activeSlotRef.current) placeActive(index)
      else {
        const slot = benchSlotRefs.current.indexOf(el)
        if (el && slot !== -1) placeBench(index, slot)
      }
      return
    }
    const drop = legalHandDrop(index, point)
    if (drop) dispatch(drop.action)
  }

  const handleAltarDrag = (point: { x: number; y: number }) => {
    const figure = figureAt(slotAt(point))
    setHighlight(figure && actionsFor.byUid.has(figure.uid) ? slotAt(point) : null)
  }

  const handleAltarDragEnd = (point: { x: number; y: number }) => {
    const figure = figureAt(slotAt(point))
    setHighlight(null)
    if (figure && actionsFor.byUid.has(figure.uid)) dispatch({ type: 'ATTACH', uid: figure.uid })
  }

  /* --------------------------------------------------------------- action */

  // What the small popup above the Altar offers, if anything. Promote has
  // its own instruction on the turn banner and its own targetable Bench
  // glow — nothing for this button to add there. The label itself stays
  // fixed — "Start Match" or "End Turn" — rather than folding in a Bench
  // count: a label that changes shape as picks are made read as a second
  // status readout competing with the picks' own badges in the hand.
  const benchCount = setupBench.filter((i) => i !== null).length
  const actionLabel =
    state.phase === 'setup'
      ? setupActive === null
        ? null
        : 'Start Match'
      : !mustPromote && myTurn
        ? 'End Turn'
        : null

  const runAction = () => {
    if (state.phase === 'setup') startBattle()
    else if (myTurn) dispatch({ type: 'END_TURN' })
    setActionOpen(false)
  }

  // Simulate hands your side to the AI for the rest of the match — at the
  // same pace it already plays the opponent at, not a fast-forward, so a
  // hand-off partway through still reads as the same match continuing
  // rather than cutting straight to a result. Offered any time there's
  // still a match to play and nobody's already simulating it.
  const canSimulate = !simulating && state.phase !== 'ended'
  const runSimulate = () => {
    simulate()
    setActionOpen(false)
  }

  /* ------------------------------------------------------------- render */

  // What each slot shows in place of its empty outline, if anything: a
  // *committed* pick (setup's own local state, already picked for that
  // slot) always wins over a merely *tentative* one (a card presently being
  // magnetically pulled toward it, not yet dropped) — the latter only ever
  // applies while nothing has actually landed there yet.
  const activePreview =
    setupPhase && setupActive !== null
      ? { cardId: you.hand[setupActive]!, tentative: false }
      : magnet?.target.kind === 'active'
        ? { cardId: magnet.cardId, tentative: true }
        : null

  const benchPreview = (i: number) => {
    const picked = setupPhase ? setupBench[i] : null
    if (picked !== null && picked !== undefined) return { cardId: you.hand[picked]!, tentative: false }
    if (magnet?.target.kind === 'bench' && magnet.target.index === i) {
      return { cardId: magnet.cardId, tentative: true }
    }
    return null
  }

  return (
    <div className="on-dark fixed inset-0 flex flex-col overflow-hidden">
      <BattleMat theme={themeType} />

      {/* The opponent's own Altar, mirrored to their corner of the table —
          a point reflection of yours (bottom-right) rather than a plain
          flip, matching how their hand fan already leans the opposite way
          for the same reason: this is their side of the table, seen from
          across it. Nothing here is ever the player's own to touch, so it's
          `AltarSocket` with no interactive child at all — a plain static
          orb once charged, the shared greyed display at every other
          moment, exactly like yours but read-only. */}
      <div className="absolute left-0 top-0 pt-safe px-3 pt-2 z-10">
        <AltarSocket current={foe.altar} lastKnown={lastAltarType.current.foe} next={foe.nextAltar}>
          {foe.altar && <EnergyOrb type={foe.altar} size={30} />}
        </AltarSocket>
      </div>

      {/* Both halves push their Active Figure toward the centre ring, so the
          clash reads as happening in the middle of the mat rather than leaving
          a dead band between the two boards. The board is one centred block,
          so the two halves meet at the mat's clash ring instead of being
          pushed to the screen edges.

          Each side's row spans the full width with its two pieces at
          opposite ends rather than clustered on one side: the opponent's
          points/time chip sits at the far left with their piles at the far
          right, and yours is the mirror of that — piles far left, chip far
          right — so the two rows read as one rule applied twice, not two
          hand-tuned layouts. */}
      {/* The hand tray below is positioned outside the flex flow (an absolute
          overlay pinned to the bottom) rather than as a flex sibling, so this
          board area spans the *entire* screen instead of (screen − hand tray
          height). Padding top and bottom by half the tray's height keeps the
          centred content the same size it always was — nothing shrinks — but
          re-centres it on the screen's true midpoint, which is where the
          mat's own halfway line is drawn. A flex sibling ate that clearance
          asymmetrically only at the bottom, which is what pushed every piece
          of this board, deck and discard piles included, above the line. */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-center gap-1 min-h-0 px-3 overflow-hidden"
        style={{
          paddingTop: `calc(${HAND_TRAY_CALC} / 2 + env(safe-area-inset-top, 0px))`,
          paddingBottom: `calc(${HAND_TRAY_CALC} / 2)`,
        }}
      >
        <OpponentHand count={foe.hand.length} />

        {/* Nudged down via `transform`, same reasoning as YOU_ROW_LIFT below:
            a margin here would shrink this row's own share of the centred
            flex column and silently re-centre the whole block, pulling
            *your* side up to compensate. A transform moves the paint
            position only. */}
        <div
          className="flex gap-1.5"
          style={{ transform: `translateY(${FOE_ROW_LIFT - BENCH_CLEARANCE}px)` }}
        >
          {foe.bench.map((figure, i) => (
            <BoardFigure key={i} figure={figure} width={BENCH_W} emptyLabel="" />
          ))}
        </div>
        <div ref={foeActiveSlotRef} style={{ transform: `translateY(${FOE_ROW_LIFT}px)` }}>
          <motion.div animate={foeFigureFx}>
            {/* `dying` only ever fills a slot the engine has already
                emptied, and only until the strike ends — a real Figure
                stepping up mid-effect wins over it. */}
            <BoardFigure
              figure={foe.active ?? (dying?.side === 'foe' ? dying.figure : null)}
              width={ACTIVE_W}
              emptyLabel="Active"
            />
          </motion.div>
        </div>

        {/* A point reflection of your own row below, not a copy shifted
            sideways: the clock/points/turn stack moves to the row's LEFT
            edge (yours sits at the right) and flushes against *that* edge
            instead, while the deck/discard column moves to the right (yours
            sits at the left) and stays centred exactly as yours does — the
            same two rules from your row, just read from the opponent's own
            side of the table.

            Discard and deck swap places on this side only: the deck sits
            *below* the discard here, so it can sit closer to the row's own
            edge and further from the clash ring's halfway line than a
            straight copy of your own (deck-above-discard) order would have
            left it. The clock/points/turn stack still has to land level
            with the deck, not with whatever is first in its own column now
            — a plain spacer, `DISCARD_H` tall, stands in for the discard
            pile's own slot at the top of that column so the two stay in
            sync without hand-tuning a pixel offset that would silently go
            stale the moment either pile's own size changes.

            The swap alone pushes the deck's own bottom edge past the mat's
            halfway line — putting the discard where the deck used to sit
            moves the deck down by the discard's own height, and there
            wasn't that much clearance to spare. `translateY`, not a margin,
            for the same reason `FOE_ROW_LIFT` elsewhere in this file uses
            one: it moves the paint position without taking space out of
            the flex column's own measurement, so nothing above or below
            this row has to re-flow to make room for it. */}
        <div
          className="w-full flex items-start justify-between gap-2 px-0.5"
          style={{ transform: 'translateY(-22px)' }}
        >
          <div className="flex flex-col items-start gap-1">
            <div style={{ height: DISCARD_H }} aria-hidden="true" />
            <MatchClock seconds={clocks.foe} thinking={aiThinking} />
            <StatsChip points={foe.points} />
            <TurnStatus label="Opponent" active={foeTurn} seconds={clocks.turn} />
          </div>

          <div className="flex flex-col items-center gap-1">
            <DiscardPile cardIds={foe.discard} onOpen={() => setViewingDiscard('foe')} />
            <PileCount count={foe.deck.length} />
          </div>
        </div>

        {/* Extra clearance: attached energy hangs below a Figure's card edge
            and would otherwise sit on top of the banner. */}
        <div className="flex items-center justify-center py-0.5 w-full">
          <TurnBanner state={state} simulating={simulating} />
        </div>

        {/* Your own row reorganised around the deck rather than a mirror of
            the opponent's own arrangement above: the discard pile sits
            face up directly under the deck it came from — its own vertical
            stack — and the clock, points and turn countdown form a second
            stack on the row's other edge, the clock first so it's "in line
            with" (level with) the deck it stands opposite. */}
        <div className="w-full flex items-start justify-between gap-2 px-0.5">
          <div className="flex flex-col items-center gap-1">
            <PileCount count={you.deck.length} />
            <DiscardPile cardIds={you.discard} onOpen={() => setViewingDiscard('you')} />
          </div>

          <div className="flex flex-col items-end gap-1">
            <MatchClock seconds={clocks.you} />
            <StatsChip points={you.points} />
            <TurnStatus label="Your Turn" active={youTurn} seconds={clocks.turn} />
          </div>
        </div>

        {/* Lifted via `transform`, not margin: this whole board block is
            centred with `justify-center` above, so a negative margin here
            only half-worked — shrinking this row's own space in the flow
            shortened the block, and re-centring a shorter block shifted the
            *opponent's* rows down by the other half of the change, which is
            exactly what this must not touch. A transform moves the paint
            position without changing what the flex column measures, so the
            opponent's side and the turn banner's own spacing stay exactly
            where they were.

            Measured on a 390×844 phone viewport, your Active's top edge
            used to sit almost exactly on the clash ring's outer boundary —
            a ~117px gap from the true halfway line versus the opponent's
            ~73px above it — rather than crossing into the ring at all.
            YOU_ROW_LIFT pulls it in far enough to sit inside the ring.

            It also now carries the extra lift that brings Active level
            with your deck once the deck/discard swap moved the deck to
            sit just under the halfway line: the deck's top and Active's
            top were 59.3px apart, so that's the amount added here. Bench
            reads off the same constant (`YOU_ROW_LIFT - BENCH_CLEARANCE`),
            so it rides up by the same 59.3px and keeps its existing gap
            to Active untouched. */}
        <div
          ref={activeSlotRef}
          className="shrink-0"
          style={{ transform: `translateY(-${YOU_ROW_LIFT}px)` }}
        >
          <motion.div animate={youFigureFx}>
            <BoardFigure
              figure={you.active ?? (dying?.side === 'you' ? dying.figure : null)}
              width={ACTIVE_W}
              emptyLabel="Active"
              onClick={you.active && myTurn ? openActive : undefined}
              selected={Boolean(you.active && myTurn)}
              noPeek={Boolean(you.active && myTurn)}
              previewCardId={activePreview?.cardId}
              previewTentative={activePreview?.tentative}
            />
          </motion.div>
        </div>
        <div
          className="flex gap-1.5 mt-1"
          style={{ transform: `translateY(-${YOU_ROW_LIFT - BENCH_CLEARANCE}px)` }}
        >
          {you.bench.map((figure, i) => {
            const preview = benchPreview(i)
            return (
              <div
                key={i}
                className="shrink-0"
                ref={(el) => {
                  benchSlotRefs.current[i] = el
                }}
              >
                <BoardFigure
                  figure={figure}
                  width={BENCH_W}
                  emptyLabel=""
                  targetable={mustPromote && figure !== null}
                  onClick={
                    mustPromote && figure
                      ? () => dispatch({ type: 'PROMOTE', benchIndex: i })
                      : figure && myTurn
                        ? () => openBench(i)
                        : undefined
                  }
                  noPeek={Boolean(figure && myTurn && !mustPromote)}
                  previewCardId={preview?.cardId}
                  previewTentative={preview?.tentative}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------ hand */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-safe pb-2">
        <div className="relative">
          {/* The hand gets the tray's *full* width to itself now, rather than
              sharing a flex row with the Altar column: `PlayerHand` centres
              its fan with `left: 50%` on whatever box it's given, and a
              flex-1 box squeezed narrower by the Altar's own width centred
              the fan on that smaller box instead of the true screen — a
              constant, structural left-of-centre offset, worse the wider the
              Altar's column got. Positioning it as its own absolute layer
              spanning the tray means that 50% is always 50% of the screen. */}
          <div className="absolute inset-x-0 bottom-0">
            <PlayerHand
              hand={you.hand}
              setupActive={setupActive}
              setupBench={setupBench}
              basicsInHand={basicsInHand}
              setupPhase={setupPhase}
              myTurn={myTurn}
              simulating={simulating}
              playable={actionsFor.byHand}
              onTap={(index) => {
                // Setup places cards by drag only now — a tap during setup used
                // to auto-assign the next open slot, but that made the drag
                // gesture redundant instead of authoritative. Outside setup, a
                // tap still opens the card's own sheet of plays.
                if (!setupPhase) openHandCard(index)
              }}
              onDragStart={handleHandDragStart}
              onDropEnd={handleHandDragEnd}
              onDragMove={handleHandDrag}
            />
          </div>

          {/* Altar, with the small popup action trigger stacked above it —
              its own layer now, pinned to the tray's right edge instead of
              sharing the hand's row (see above). Sits above the hand fan in
              paint order, which only matters for a hand large enough to
              spread near the tray's edges. */}
          <div className="absolute right-0 bottom-0 flex flex-col items-center gap-1.5 shrink-0">
            <AnimatePresence>
              {actionOpen && (actionLabel || canSimulate) && (
                <motion.div
                  className="absolute bottom-full mb-2 right-0 flex flex-col items-end gap-2 whitespace-nowrap"
                  initial={{ opacity: 0, y: 6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                >
                  {/* Above the primary action rather than below: it's the
                      less common choice of the two, and shouldn't sit where
                      a thumb reaching for "Start Match"/"End Turn" would
                      land on it by accident. */}
                  {canSimulate && (
                    <Button variant="raised" className="!px-4 !py-2 text-sm" onClick={runSimulate}>
                      Simulate Match
                    </Button>
                  )}
                  {actionLabel && (
                    <Button variant="gold" className="!px-4 !py-2 text-sm" onClick={runAction}>
                      {actionLabel}
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {state.phase === 'setup' && (
              <button
                onClick={resetSetup}
                disabled={setupActive === null && benchCount === 0}
                className="rounded-pill w-8 h-8 grid place-items-center"
                style={{
                  background: 'var(--bg-sunk)',
                  opacity: setupActive === null && benchCount === 0 ? 0.4 : 1,
                }}
                aria-label="Reset setup picks"
              >
                <ResetIcon size={14} className="text-ink-faint" />
              </button>
            )}

            <button
              onClick={() => setActionOpen((v) => !v)}
              disabled={!actionLabel && !canSimulate}
              className="rounded-pill w-9 h-9 grid place-items-center"
              style={{
                background: actionLabel || canSimulate ? 'var(--surface-raised)' : 'var(--bg-sunk)',
                opacity: actionLabel || canSimulate ? 1 : 0.5,
              }}
              aria-label={actionLabel ?? (canSimulate ? 'Simulate Match' : 'No action available')}
              aria-expanded={actionOpen}
            >
              <CheckIcon
                size={16}
                className={actionLabel || canSimulate ? 'text-[var(--gold-bright)]' : 'text-ink-faint'}
              />
            </button>

            {/* The Altar itself. `AltarSocket` is the shared, passive
                display — the drag button below is the only thing that
                makes *yours* interactive, and it only ever renders while
                there's actually something to drag. It never moves: only
                the orb inside it drags onto a Figure, so the socket stays
                put as the visual anchor for "this is where energy comes
                from" regardless of what it's currently showing. */}
            <AltarSocket current={you.altar} lastKnown={lastAltarType.current.you} next={you.nextAltar}>
              {you.altar && (
                <motion.button
                  disabled={!myTurn}
                  className="absolute inset-0 grid place-items-center rounded-pill"
                  drag={myTurn}
                  dragSnapToOrigin
                  dragElastic={0.35}
                  whileDrag={{ zIndex: 2000, scale: 1.15 }}
                  onDrag={(_event, info: PanInfo) => handleAltarDrag(info.point)}
                  onDragEnd={(_event, info: PanInfo) => handleAltarDragEnd(info.point)}
                  aria-label={`Altar: ${you.altar} energy ready — drag onto a Figure`}
                >
                  <EnergyOrb type={you.altar} size={30} />
                </motion.button>
              )}
            </AltarSocket>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- overlays */}
      <AnimatePresence>
        {!coinSettled && <CoinFlip first={state.first} onDone={settleCoin} />}
      </AnimatePresence>

      <AttackFx trigger={attackFx} onDone={releaseAttackFx} />

      <AnimatePresence>
        {turnCue && <TurnAnnounce key={turnCue.key} cue={turnCue} onDone={() => setTurnCue(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {viewingDiscard && (
          <DiscardStrip
            cardIds={viewingDiscard === 'you' ? you.discard : foe.discard}
            onClose={() => setViewingDiscard(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            className="fixed left-1/2 -translate-x-1/2 z-[60] rounded-pill px-4 py-2 text-sm"
            style={{ bottom: 120, background: 'rgba(140,45,30,.95)', color: '#fff' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {sheet && (
        <ActionSheet
          title={sheet.title}
          subtitle={sheet.subtitle}
          options={sheet.options}
          onClose={() => setSheet(null)}
        />
      )}

      {/*
        No `AnimatePresence` here. `state.phase` is one-way — a match that
        reaches 'ended' never leaves it, so Result never needs an exit
        transition of its own; the only way it ever disappears is the whole
        Battle screen unmounting when the player navigates away, which is a
        transition the *App-level* route AnimatePresence already owns.
        This was the first thing tried against the "Continue does nothing"
        bug — a nested AnimatePresence whose child never gets its own exit
        signal looked exactly like the kind of thing that could confuse an
        ancestor AnimatePresence waiting on the whole subtree. Removing it
        alone did not fix the bug (see App.tsx for what actually did — its
        `mode="wait"`), but it still is not doing anything useful: Result
        gets nothing from carrying an exit animation it can structurally
        never run, so there is no reason to put it back.
      */}
      {resultReady && <Result state={state} onExit={onExit} />}
    </div>
  )
}

/* --------------------------------------------------------------- pieces */

/**
 * Points, with no name attached — the name lived in a full-width bar across
 * the top and bottom of the mat; without it, this is small enough to tuck
 * into a corner of the board instead. Placed in that side's own outer
 * corner, top for the opponent and bottom for you, on the same mat so the
 * two read as one mirrored rule rather than two bars.
 *
 * The match clock used to live here too, but that put a side's own time
 * left on the opposite edge of the row from everything else that's theirs —
 * their deck, their turn countdown. `MatchClock` now sits with those
 * instead, directly under the deck it belongs to, which leaves this chip
 * with only what doesn't already have a home: the points.
 */
function StatsChip({ points }: { points: number }) {
  return (
    <div
      className="shrink-0 z-10 flex items-center gap-1.5 rounded-pill px-2 py-1"
      style={{
        background: 'rgba(10,7,3,.55)',
        border: '1px solid rgba(229,192,140,.25)',
      }}
    >
      <span className="flex gap-1" aria-label={`${points} of ${RULES.POINTS_TO_WIN} points`}>
        {Array.from({ length: RULES.POINTS_TO_WIN }, (_, i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-pill"
            style={{
              background: i < points ? 'var(--gold-bright)' : 'rgba(229,192,140,.2)',
              boxShadow: i < points ? '0 0 5px rgba(229,192,140,.6)' : undefined,
            }}
          />
        ))}
      </span>
    </div>
  )
}

/**
 * The total match time this side has left, stacked under `TurnStatus` in
 * the same column as the deck it belongs to. Unlike `TurnStatus`, which
 * only shows anything on that side's own turn, this is always visible —
 * the match clock keeps running on both sides regardless of whose turn it
 * is, so hiding it the rest of the time would misrepresent it as paused.
 */
function MatchClock({ seconds, thinking }: { seconds: number; thinking?: boolean }) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60

  return (
    <span
      className="mt-0.5 font-numeric tabular-nums text-[9px]"
      style={{ color: seconds < 60 ? '#ef8f7c' : 'rgba(229,192,140,.5)' }}
    >
      {minutes}:{String(rest).padStart(2, '0')}
      {thinking && '…'}
    </span>
  )
}

/**
 * The hand, fanned rather than scrolled.
 *
 * Each card is rotated and lifted by its distance from the centre. The
 * rotation and scale are framer's own `animate` keys and the offset is a pair
 * of `x`/`y` motion values, never a plain CSS `transform` string — a drag
 * moves those same two values, so the fan's pose and the drag compose instead
 * of one overwriting the other. Spread narrows as the hand grows, so a big
 * hand fans within the same width a small one does rather than spilling past
 * the Altar column.
 *
 * Two gestures start the same way here, and telling them apart is what most
 * of the code below is for. Dragging a finger *across* the fan riffles
 * through it, lifting each card as it passes — the same thing you'd do with a
 * real hand of cards to see what you're holding. Pulling a card *up* takes it
 * out of the hand to play it. So a card is never dragged by framer's own
 * pointerdown listener (`dragListener={false}`); the tray watches the gesture
 * first and only hands it over once the finger has clearly gone upward.
 *
 * Long-press-to-peek is switched off for the whole phase (`noPeek`) rather
 * than only on the cards that can be dragged: a hold that starts sizing up a
 * drag and a hold that is patiently timing out to open the viewer are the
 * same gesture for the first several hundred milliseconds, and setup is about
 * placing a card, not reading one.
 */
function PlayerHand({
  hand,
  setupActive,
  setupBench,
  basicsInHand,
  setupPhase,
  myTurn,
  simulating,
  playable,
  onTap,
  onDragStart,
  onDropEnd,
  onDragMove,
}: {
  hand: string[]
  setupActive: number | null
  setupBench: (number | null)[]
  basicsInHand: { cardId: string; index: number }[]
  setupPhase: boolean
  myTurn: boolean
  /** The AI is playing this side now — every gesture here is inert. */
  simulating: boolean
  playable: Map<number, Action[]>
  onTap: (index: number, isBasic: boolean) => void
  onDragStart: (index: number) => void
  onDropEnd: (index: number, point: { x: number; y: number }) => void
  onDragMove: (index: number, point: { x: number; y: number }) => void
}) {
  // Which hand indices are actually rendered right now — a card picked for
  // a slot during setup is hidden (the early `return null` below), and the
  // fan has to be built from *this* list rather than from raw hand indices.
  // Spacing every card by its own index minus the raw array's own midpoint
  // left a hole exactly where a picked card used to sit: picking anything
  // but the dead-centre card split the remaining cards unevenly between the
  // two sides of that hole, and the whole fan read as tipped lopsided
  // rather than centred and one card shorter. Ranking within the visible
  // list instead means the fan always closes back up around its own true
  // centre, for any hand size and whichever card was just picked.
  const visibleIndices = hand
    .map((_, i) => i)
    .filter((i) => !(setupPhase && (setupActive === i || setupBench.includes(i))))
  const count = visibleIndices.length
  const mid = (count - 1) / 2
  // Divided by count rather than count-1, and with no flat ceiling for the
  // hand sizes this game actually deals: the old cap saturated at max spread
  // for anything up to eight or nine cards, so drawing a card never visibly
  // tightened the fan until a hand was already unusually large.
  const rotateStep = count > 1 ? Math.min(10, Math.max(2, 30 / count)) : 0
  // The floor keeps a very large hand from packing so tight that neighbours
  // bury most of each other's card — the z-index rule below is what actually
  // guarantees a draggable card stays tappable regardless of overlap, this
  // just keeps the overlap itself from getting absurd at extreme hand sizes.
  const spanStep = count > 1 ? Math.min(34, Math.max(18, 120 / count)) : 0

  // The lift a card gets as a thumb brushes across the fan without yet
  // committing to a drag — the same tell a hand of real cards gives when
  // you're riffling through it. Pointer enter/leave rather than framer's own
  // `whileHover` because the latter is gated to non-touch pointers in some
  // browsers, and this game is touch-first.
  const [brushed, setBrushed] = useState<number | null>(null)

  // A little extra lift and size for whichever card a held finger is
  // currently resting on while browsing the hand — a small, quiet tell
  // rather than a card popping out to full size: the fan itself never moves,
  // so there's nothing else to settle before this one card can rise and its
  // predecessor can fall back, which is what keeps the handoff between two
  // cards feeling like one continuous motion instead of a jump.
  const BROWSE_LIFT = 22
  const BROWSE_SCALE = 1.14

  // A held finger browses the hand, lifting whichever card sits under it —
  // distinct from the drag-to-play gesture below. It lives at the tray level
  // rather than on each card, because the card the finger ends up over after
  // a hold has *moved* is not necessarily the one it started on; a per-card
  // gesture would lose the finger the instant it crossed into a neighbour's
  // box.
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activePointer = useRef<number | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout>>()
  const lastPoint = useRef({ x: 0, y: 0 })
  // Set the instant Framer recognises an actual drag (not just a held
  // finger). Once a card is really being dragged, the browse gesture has to
  // get completely out of the way: hit-testing on every move re-renders the
  // whole hand, and that fight against Framer's own drag tracking is what
  // made moving a card feel glitchy. Both stop the moment this flips true.
  const draggingCard = useRef(false)
  // Which card that is, and whether it was the focused (lifted) one the
  // instant its drag began. Framer adds the live drag offset on top of
  // whatever the fan currently targets for x/y — so clearing the focus the
  // moment a drag starts (needed so whichever *other* card was lifted settles
  // back down) was itself a bug: it changed the dragged card's own target
  // mid-gesture, and the render jumped by the difference before the rest of
  // the drag continued smoothly from the new baseline. Freezing this card's
  // own focus state here and reusing it for the rest of its drag keeps its
  // target constant throughout, so only the drag offset moves it. It settles
  // back to its real resting pose with a normal spring once the drag actually
  // ends, since only then does this stop being read.
  const draggingIndex = useRef<number | null>(null)
  const frozenPose = useRef<{ isFocused: boolean } | null>(null)

  /**
   * Every card in hand can be picked up and carried anywhere on your side of
   * the mat, whether or not it has a legal home to land in.
   *
   * Restricting the gesture to cards with a play available meant a card you
   * could not use right now simply would not come away from the fan — you
   * could put a finger on it and pull and it stayed glued there, which reads
   * as the hand holding on to it rather than as the game telling you the
   * card has nowhere to go. Picking one up and finding nothing lights up for
   * it says the same thing and lets you look at the board while you decide.
   *
   * What a card is *allowed to do* when released has not moved: mid-match
   * every drop is still checked against the engine's own legal-action list,
   * and setup checks the Basic-only rule where it resolves the drop. Anything
   * without a legal landing simply springs back to the fan.
   */
  const canLift = !simulating

  // One handle per card, so the tray can start a *particular* card's drag
  // from a gesture that began somewhere else in the fan. `useDragControls`
  // would be the usual way to make one, but there is no hook to call per item
  // inside a `.map()` over a hand whose length changes; the class behind that
  // hook is exported for exactly this, and the ref keeps each handle stable
  // for as long as a card is rendered at that index.
  const dragHandles = useRef(new Map<number, DragControls>())
  const handleFor = (index: number) => {
    const existing = dragHandles.current.get(index)
    if (existing) return existing
    const created = new DragControls()
    dragHandles.current.set(index, created)
    return created
  }

  /** Which of the three things make a card glow, if any — each reads as a
   *  different colour (see VIABILITY_GLOW below): gold for something
   *  placeable, white for an ascension, red for a Covenant or Relic's own
   *  ability. Unlike a card's *liftability*, this also covers those last two —
   *  they're played through the tap sheet, not a drag, but are every bit as
   *  "viable right now" as the cards that are. */
  const viabilityOf = (index: number): 'use' | 'ascend' | 'ability' | null => {
    if (simulating) return null
    if (setupPhase) return basicsInHand.some((b) => b.index === index) ? 'use' : null
    if (!myTurn) return null
    const actions = playable.get(index) ?? []
    if (actions.some((a) => a.type === 'PLAY_FIGURE')) return 'use'
    if (actions.some((a) => a.type === 'ASCEND')) return 'ascend'
    if (actions.some((a) => a.type === 'PLAY_COVENANT' || a.type === 'PLAY_RELIC')) return 'ability'
    return null
  }

  /** Which card in the fan a DOM element belongs to, if any. */
  const cardIndexOf = (el: Element | null | undefined): number | null => {
    const button = el?.closest('button')
    if (!button) return null
    const index = cardRefs.current.indexOf(button as HTMLButtonElement)
    return index === -1 ? null : index
  }

  /** The card actually under this point — the browser's own answer, which
   *  respects both the real painted stacking and each card's rotation.
   *  Ranking bounding boxes by hand order looks equivalent and isn't: a
   *  rotated element's box is its *axis-aligned* bounds, noticeably wider
   *  than the card inside it, so the outer cards of the fan claimed points
   *  that visibly belonged to their neighbours and a finger resting on one
   *  card would riffle — or pull out — another. */
  const hitTest = (x: number, y: number): number | null =>
    cardIndexOf(document.elementFromPoint(x, y))

  /* ------------------------------------------------- reading the gesture */

  // How far sideways before the hand decides you are riffling through it.
  const SCRUB_SLACK = 10
  // How far *up* before it decides you are taking a card out instead. Both
  // are measured from where the finger went down; the upward pull also has
  // to be the larger of the two, so a diagonal sweep across the fan riffles
  // rather than yanking a card out of it.
  const LIFT_PULL = 14
  // Once riffling, the bar to pull a card out rises: the finger is already
  // travelling, and a fan is an arc, so a scrub along it drifts upward a
  // little on its own. Measured from the lowest point the finger has reached
  // rather than from where it started, so it is a genuine change of
  // direction that lifts a card, not the tail end of a long sideways sweep.
  const LIFT_FROM_BROWSE = 26

  /** How the gesture in flight is being read. Undecided until the finger has
   *  moved far enough in one direction or the other to say. */
  const reading = useRef<'undecided' | 'browse' | 'lift'>('undecided')
  // Where the gesture began, and which card it began on. The card comes from
  // the pointerdown's own target rather than from a hit test: the browser
  // already knows exactly what was pressed, and that answer stays right even
  // once the finger has moved off it.
  const from = useRef<{ x: number; y: number; index: number | null }>({ x: 0, y: 0, index: null })
  const lowest = useRef(0)
  // The focused card as a ref as well as state: the gesture handlers below
  // run outside React's render, and need the *current* focus to know which
  // card an upward pull is asking for.
  const focused = useRef<number | null>(null)
  const focusOn = (index: number | null) => {
    focused.current = index
    setFocusIndex(index)
  }

  // The gesture is tracked on the window rather than on this tray. A card
  // grabbed near the top of the fan stands proud of the tray's own box, and
  // an upward pull leaves it within a few pixels — long before there is
  // enough movement to tell a lift from a scrub, so a tray-level listener
  // would simply stop hearing the gesture it is trying to read. No
  // `setPointerCapture` either: retargeting every event to one element is a
  // much heavier tool than this needs, and it has broken drag recognition in
  // this hand before.
  const untrack = useRef<() => void>()
  const endGesture = () => {
    untrack.current?.()
    untrack.current = undefined
    clearTimeout(holdTimer.current)
    activePointer.current = null
    reading.current = 'undecided'
    focusOn(null)
  }

  /** Hand the gesture over to Framer: this card leaves the fan and follows
   *  the finger from wherever it is right now. */
  const liftOut = (event: PointerEvent, index: number | null) => {
    if (index === null || !canLift) return
    reading.current = 'lift'
    clearTimeout(holdTimer.current)
    handleFor(index).start(event)
  }

  const onGestureMove = (event: PointerEvent) => {
    // Framer owns the gesture from here — see `draggingCard`.
    if (draggingCard.current || reading.current === 'lift') return
    if (activePointer.current !== event.pointerId) return
    const x = event.clientX
    const y = event.clientY
    lastPoint.current = { x, y }

    if (reading.current === 'undecided') {
      const sideways = Math.abs(x - from.current.x)
      const pull = from.current.y - y
      if (pull >= LIFT_PULL && pull > sideways) {
        liftOut(event, from.current.index)
        return
      }
      if (sideways < SCRUB_SLACK) return
      reading.current = 'browse'
      clearTimeout(holdTimer.current)
    }

    // Only ever *move* the highlight, never drop it: the pull that takes a
    // card out of the hand carries the finger off the fan almost immediately,
    // and clearing the focus on the way out would leave nothing to lift.
    const over = hitTest(x, y)
    if (over !== null) focusOn(over)
    lowest.current = Math.max(lowest.current, y)
    if (lowest.current - y >= LIFT_FROM_BROWSE) liftOut(event, focused.current ?? from.current.index)
  }

  const onHandPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== null) return
    activePointer.current = e.pointerId
    lastPoint.current = { x: e.clientX, y: e.clientY }
    from.current = { x: e.clientX, y: e.clientY, index: cardIndexOf(e.target as Element) }
    lowest.current = e.clientY
    reading.current = 'undecided'

    const move = (ev: PointerEvent) => onGestureMove(ev)
    const up = () => endGesture()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    untrack.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }

    // A finger that comes down and stays down is browsing too — you are
    // looking at what you're holding, you just haven't moved yet.
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      if (activePointer.current === null || reading.current !== 'undecided') return
      reading.current = 'browse'
      focusOn(hitTest(lastPoint.current.x, lastPoint.current.y) ?? from.current.index)
    }, HOLD_TO_FAN_MS)
  }

  useEffect(
    () => () => {
      untrack.current?.()
      clearTimeout(holdTimer.current)
    },
    [],
  )

  return (
    <div
      className="flex-1 min-w-0 relative"
      style={{ height: HAND_HEIGHT, touchAction: 'none' }}
      onPointerDown={onHandPointerDown}
    >
      {hand.map((cardId, index) => {
        const pickedActive = setupActive === index
        const pickedBench = setupBench.includes(index)
        // Once setup has actually picked a card for a slot, it belongs
        // there and nowhere else — showing it in both places at once (a
        // ring around it here, the same card seated in the slot there) read
        // as it never having left. Mid-match has no equivalent limbo: a
        // played card leaves `hand` for real, immediately, on dispatch.
        if (setupPhase && (pickedActive || pickedBench)) return null
        const isBasic = basicsInHand.some((b) => b.index === index)
        // Rank among the visible cards, not the raw hand index — see the
        // comment on `visibleIndices` above.
        const rank = visibleIndices.indexOf(index)
        const offset = rank - mid
        // The glow (coloured by which of the three this is) is the *only*
        // thing that marks a card viable; there is deliberately no height
        // or position change to go with it — see the pose below, which never
        // reads viability at all.
        const viability = viabilityOf(index)
        let isFocused = focusIndex === index
        // This card is mid-drag: use the focus state frozen the instant
        // that drag began instead of the live (already-cleared) browse
        // state — see frozenPose's own comment for why.
        if (draggingIndex.current === index && frozenPose.current) {
          isFocused = frozenPose.current.isFocused
        }

        return (
          <HandCard
            key={`${cardId}-${index}`}
            elementRef={(el) => {
              cardRefs.current[index] = el
            }}
            controls={handleFor(index)}
            canLift={canLift}
            pose={{
              // The fan itself never moves — only `y` and `scale` change for
              // whichever card is focused, so there's nothing else to
              // resettle when the finger moves on to a neighbour, and the
              // handoff between the two reads as one continuous motion
              // instead of the fan itself lurching.
              x: offset * spanStep,
              y: offset * offset * 1.4 - (brushed === index ? 10 : 0) - (isFocused ? BROWSE_LIFT : 0),
              rotate: offset * rotateStep,
              scale: isFocused ? BROWSE_SCALE : 1,
              // A plain ribbon spread: stacking order always follows hand
              // order, full stop. Whether a card is viable never changes it —
              // a viable card earlier in the hand stays exactly as overlapped
              // by its later neighbours as a non-viable one would be, rather
              // than jumping ahead of them. Only the browsed (held-and-lifted)
              // card is ever an exception, since it's meant to visibly clear
              // the row while it's focused.
              zIndex: isFocused ? 3000 : index,
            }}
            onBrush={() => setBrushed(index)}
            onUnbrush={() => setBrushed((b) => (b === index ? null : b))}
            onLift={() => {
              // Freeze this card's own focus state first, then clear the
              // shared browse state — so whichever *other* card was lifted
              // settles back down immediately (nothing is fighting its
              // drag), while this one keeps rendering the exact pose it had
              // the instant it grabbed, all the way to drop.
              frozenPose.current = { isFocused }
              draggingIndex.current = index
              draggingCard.current = true
              endGesture()
              onDragStart(index)
            }}
            onCarry={(point) => onDragMove(index, point)}
            onRelease={(point) => {
              draggingCard.current = false
              draggingIndex.current = null
              frozenPose.current = null
              setBrushed(null)
              onDropEnd(index, point)
            }}
            // Setup is drag-only, full stop — a tap here used to be a no-op
            // already, but the button still visibly pressed down under a
            // finger, which reads as "this does something" even when it
            // doesn't. No click handler and no press animation is what
            // actually looks like a card that can only be dragged. Simulate
            // gets the same treatment for the same reason: a tap that opened
            // the play sheet mid-simulation could dispatch a real action out
            // from under the AI turn about to land on this same card.
            onClick={setupPhase || simulating ? undefined : () => onTap(index, isBasic)}
            // Only Simulate makes a card inert. Marking non-Basics disabled
            // during setup also blocked every pointer event on them, which is
            // exactly what stopped them being picked up; what a *tap* does is
            // still gated on its own, just above.
            disabled={simulating}
          >
            {/* Every card in hand stays fully visible — the glow above is
                the only thing that marks a card viable, not how much of the
                rest of the hand fades out around it. */}
            <div
              className={cx('rounded-[8%]', viability && 'cov-hand-glow')}
              style={viability ? VIABILITY_GLOW[viability] : undefined}
            >
              <PressableCard card={requireCard(cardId)} compact noHolo noPeek={setupPhase} />
            </div>
          </HandCard>
        )
      })}
    </div>
  )
}

/** How the fan settles a card into place, and how it takes one back. */
const FAN_SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const

/**
 * One card in the fan.
 *
 * Its own component because each card needs two things a `.map()` body can't
 * hold: a drag handle the tray can pull on (see `dragHandles` above), and its
 * own `x`/`y` motion values.
 *
 * Those motion values are the whole reason a released card finds its way
 * home. Framer's `dragSnapToOrigin` returns a card to x=0, y=0 — which is the
 * *centre* of the fan, not this card's own seat in it, so every card but the
 * middle one came back to the wrong place and stayed there, since the fan's
 * target for it hadn't changed and so was never re-animated. Owning the two
 * values here means the drop can simply animate them back to the pose the fan
 * asks for, whatever that is.
 */
function HandCard({
  pose,
  canLift,
  controls,
  elementRef,
  disabled,
  onClick,
  onBrush,
  onUnbrush,
  onLift,
  onCarry,
  onRelease,
  children,
}: {
  pose: { x: number; y: number; rotate: number; scale: number; zIndex: number }
  canLift: boolean
  controls: DragControls
  elementRef: (el: HTMLButtonElement | null) => void
  disabled: boolean
  onClick?: (() => void) | undefined
  onBrush: () => void
  onUnbrush: () => void
  onLift: () => void
  onCarry: (point: { x: number; y: number }) => void
  onRelease: (point: { x: number; y: number }) => void
  children: React.ReactNode
}) {
  const x = useMotionValue(pose.x)
  const y = useMotionValue(pose.y)
  const dragging = useRef(false)

  // The fan's offset is a target to animate toward, not a style to render —
  // a drag moves these same two values, so re-rendering would fight it.
  useEffect(() => {
    if (dragging.current) return
    const settleX = animate(x, pose.x, FAN_SPRING)
    const settleY = animate(y, pose.y, FAN_SPRING)
    return () => {
      settleX.stop()
      settleY.stop()
    }
  }, [pose.x, pose.y, x, y])

  return (
    <motion.button
      ref={elementRef}
      className="absolute bottom-0"
      style={{
        x,
        y,
        width: HAND_W,
        left: '50%',
        marginLeft: -HAND_W / 2,
        zIndex: pose.zIndex,
        transformOrigin: 'bottom center',
      }}
      animate={{ rotate: pose.rotate, scale: pose.scale }}
      transition={FAN_SPRING}
      onPointerEnter={onBrush}
      onPointerLeave={onUnbrush}
      drag={canLift}
      // Never from this card's own pointerdown: the tray reads the gesture
      // first and starts the drag itself, so that riffling sideways through
      // the hand doesn't pull a card out of it. See PlayerHand's own doc.
      dragListener={false}
      dragControls={controls}
      // Both off so that releasing a card leaves it exactly where the finger
      // let go, with nothing of Framer's still animating it — the drop
      // handler below is the only thing that decides where it goes next.
      dragMomentum={false}
      dragSnapToOrigin={false}
      // Straightens to upright the instant a card lifts off the fan, rather
      // than carrying its resting tilt around under the thumb — a card you're
      // holding reads as held, not still leaning the way it happened to sit
      // in the hand. Nothing here persists past the gesture.
      whileDrag={{ zIndex: 2000, scale: 1.1, rotate: 0 }}
      onDragStart={() => {
        dragging.current = true
        onLift()
      }}
      onDrag={(_event, info: PanInfo) => onCarry(info.point)}
      onDragEnd={(_event, info: PanInfo) => {
        dragging.current = false
        onRelease(info.point)
        // Back to its seat in the fan. If the drop played the card this is
        // moot — it has already left the hand and unmounted.
        animate(x, pose.x, FAN_SPRING)
        animate(y, pose.y, FAN_SPRING)
      }}
      whileTap={onClick ? { scale: 0.95 } : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  )
}

/**
 * The opponent's hand, face-down and unreachable — a count of cards fanned
 * across the table from you, so the board reads as two hands at the table
 * rather than one player's cards and the other's invisible ones.
 *
 * Fanned as *they* hold it, not as you hold yours: a point reflection of
 * your own fan rather than a copy of it. Yours converges below the cards, at
 * your own hand; theirs converges above, off the top of the screen where
 * they are sitting — so their outer cards ride up where yours dip down, they
 * lean the opposite way, and the ribbon stacks right-to-left, which is
 * left-to-right from their side of the table. Fanning it the same way as
 * yours read as a second hand belonging to you.
 *
 * Smaller and inert: nothing here is a target for anything, it only tells
 * you how many
 * cards are left to worry about.
 */
function OpponentHand({ count }: { count: number }) {
  if (count === 0) return null

  const mid = (count - 1) / 2
  const rotateStep = count > 1 ? Math.min(9, Math.max(2, 26 / count)) : 0
  const spanStep = count > 1 ? Math.min(16, Math.max(8, 56 / count)) : 0
  const width = 30

  return (
    <div className="relative shrink-0 pointer-events-none" style={{ height: 34, width: '100%' }}>
      {Array.from({ length: count }, (_, index) => {
        const offset = index - mid
        return (
          <div
            key={index}
            className="absolute top-0 rounded-[8%] overflow-hidden"
            style={{
              width,
              aspectRatio: '63/88',
              left: '50%',
              marginLeft: offset * spanStep - width / 2,
              // Both the lean and the arc are negated against your own hand's
              // (`rotate: offset * step`, `y: offset² * k`, pivoting at the
              // bottom): pivoting at the top with the signs flipped is the
              // same fan turned to face the other way down the table.
              transform: `translateY(${-offset * offset * 1.1}px) rotate(${-offset * rotateStep}deg)`,
              transformOrigin: 'top center',
              zIndex: count - index,
              boxShadow: '0 2px 8px rgba(0,0,0,.5)',
            }}
          >
            <CardBack />
          </div>
        )
      })}
    </div>
  )
}

/**
 * The deck: a pile of face-down cards, read by its art alone. A tap answers
 * the only question a label used to — how many are left — as a digit over
 * the card back, left to fade on its own rather than needing a second tap
 * to dismiss.
 */
/**
 * Whose turn it is and how long is left on it, sitting under that player's
 * own deck — one under each, so the answer is attached to the side it is
 * about instead of floating in the middle of the mat belonging to neither.
 *
 * Only the side to move shows anything; the other is blank rather than
 * absent, so the row keeps its height and the board does not shift a few
 * pixels every time the turn changes hands.
 */
/**
 * The Altar's own passive display: a 46px socket holding one orb — the
 * current type, full colour and glowing, once it's actually been granted;
 * the last type this side's Altar ever held, greyed out, at every other
 * moment (including before the very first grant, when "last held" is really
 * "about to hold") — plus a small corner badge always naming next turn's
 * type. Grey rather than blank so there is always something concrete to
 * read, whether that's a promise not yet kept or one already spent.
 *
 * Purely visual, and shared by both sides: the player's own Altar wraps
 * this with the drag button that actually attaches the current orb to a
 * Figure, layered on top only while `current` is set; the opponent's has
 * nothing layered over it at all, since nothing here is ever the player's
 * to drag.
 */
function AltarSocket({
  current,
  lastKnown,
  next,
  children,
}: {
  current: EnergyType | null
  lastKnown: EnergyType
  next: EnergyType
  /** What fills the socket once `current` is actually granted — a
   *  draggable button for the player's own Altar, a plain static orb for
   *  the opponent's. Never rendered while `current` is null: the socket
   *  shows its own greyed `lastKnown` orb in that case instead, so a
   *  caller can pass this unconditionally without duplicating that check. */
  children?: ReactNode
}) {
  return (
    <div className="relative grid place-items-center">
      {/* Charged glow: the zone's only "something's here" tell besides the
          orb's own colour switching on. */}
      {current && (
        <div
          className="cov-altar-glow absolute rounded-full pointer-events-none"
          style={{
            width: 46,
            height: 46,
            background: 'radial-gradient(circle, rgba(229,192,140,.55), transparent 70%)',
          }}
        />
      )}

      <div
        className="relative rounded-pill grid place-items-center"
        style={{
          width: 46,
          height: 46,
          background: current ? 'var(--surface-raised)' : 'var(--bg-sunk)',
          boxShadow: current ? '0 0 14px rgba(229,192,140,.35)' : undefined,
        }}
      >
        {current ? (
          children
        ) : (
          <span className="grayscale opacity-55">
            <EnergyOrb type={lastKnown} size={30} />
          </span>
        )}
      </div>

      <div
        className="absolute -bottom-1 -right-1 rounded-pill grid place-items-center pointer-events-none"
        style={{
          width: 20,
          height: 20,
          background: 'var(--bg-sunk)',
          border: '1.5px solid rgba(229,192,140,.4)',
        }}
        role="img"
        aria-label={`Next turn's Altar energy: ${ENERGY_LABEL[next]}`}
      >
        <EnergyOrb type={next} size={13} />
      </div>
    </div>
  )
}

function TurnStatus({ label, active, seconds }: { label: string; active: boolean; seconds: number }) {
  return (
    <div
      className="mt-1 flex flex-col items-center justify-start whitespace-nowrap leading-tight"
      // Stacked rather than set on one line, and no wider than the pile it
      // sits under: both piles are at the outer edge of their row, so a
      // single line long enough to hold the label *and* the clock ran off
      // the side of the screen.
      style={{ width: 52, height: 22 }}
    >
      {active && (
        <>
          <span className="font-display text-[9px] tracking-wide" style={{ color: 'var(--gold-bright)' }}>
            {label}
          </span>
          <span
            className="font-numeric tabular-nums text-[9px]"
            style={{ color: seconds <= 10 ? '#ef8f7c' : 'rgba(229,192,140,.5)' }}
          >
            {seconds}s
          </span>
        </>
      )}
    </div>
  )
}

function PileCount({ count }: { count: number }) {
  // Twice the card's former 26px width — the size the layout otherwise
  // reserved for a label underneath now goes to the pile itself.
  const size = 52

  const [revealed, setRevealed] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(fadeTimer.current), [])

  const tap = () => {
    if (count === 0) return
    setRevealed(true)
    clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => setRevealed(false), 2200)
  }

  return (
    <button
      onClick={tap}
      disabled={count === 0}
      className="relative rounded-sm overflow-hidden"
      style={{ width: size, aspectRatio: '63/88' }}
      aria-label={`Deck: ${count} card${count === 1 ? '' : 's'} left`}
    >
      {count > 0 ? (
        <CardBack />
      ) : (
        <div className="absolute inset-0 rounded-sm" style={{ background: 'rgba(10,7,3,.4)' }} />
      )}

      <AnimatePresence>
        {revealed && (
          <motion.span
            className="absolute inset-0 grid place-items-center font-numeric tabular-nums"
            style={{ fontSize: 18, color: '#fdfaf3', textShadow: '0 1px 6px rgba(0,0,0,.85)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

/**
 * The discard pile itself, face up — the last card actually discarded,
 * shown at its own size rather than a generic "D" glyph, sat directly
 * under the deck it belongs to on both sides now. A bit smaller than the
 * deck: this is what has already left play, not the pile still deciding
 * the game.
 *
 * Tapping it opens the fanned strip below (see `viewingDiscard` on the
 * Battle component, which owns that state so this doesn't have to), not a
 * peek at this one card — `noPeek` on the `PressableCard` beneath turns off
 * its own long-press viewer for exactly that reason, and the actual click
 * handler lives on this wrapping button, not on the card.
 */
function DiscardPile({ cardIds, onOpen }: { cardIds: string[]; onOpen: () => void }) {
  const count = cardIds.length
  const size = DISCARD_W
  const top = cardIds[count - 1]

  return (
    <button
      onClick={() => count > 0 && onOpen()}
      disabled={count === 0}
      className="relative shrink-0 rounded-sm overflow-hidden"
      style={{ width: size, aspectRatio: '63/88' }}
      aria-label={`Discard: ${count} card${count === 1 ? '' : 's'}`}
    >
      {top ? (
        <PressableCard card={requireCard(top)} compact noHolo noPeek standalone />
      ) : (
        <div
          className="absolute inset-0 rounded-sm"
          style={{ background: 'var(--bg-sunk)', border: '1px dashed rgba(229,192,140,.2)' }}
        />
      )}

      {count > 0 && (
        <span
          className="absolute -bottom-1 -right-1 rounded-pill grid place-items-center font-numeric tabular-nums"
          style={{
            minWidth: 15,
            height: 15,
            padding: '0 3px',
            fontSize: 9,
            background: 'var(--surface-raised)',
            border: '1px solid rgba(229,192,140,.3)',
            color: 'rgba(229,192,140,.85)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** The discard pile opened into a horizontal strip. Sits below the card
 *  viewer's own z-index, deliberately: tapping a card in the strip opens it
 *  in the viewer on top, and closing that viewer leaves this strip open
 *  rather than dismissing both at once. */
function DiscardStrip({ cardIds, onClose }: { cardIds: string[]; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end"
      style={{ background: 'rgba(8,6,3,.82)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full pb-safe pt-3 px-3"
        style={{ background: 'var(--surface-raised)', borderTop: '1px solid rgba(229,192,140,.25)' }}
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-[11px] tracking-wide mb-2" style={{ color: 'rgba(229,192,140,.6)' }}>
          Discard · {cardIds.length} card{cardIds.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {cardIds.map((id, i) => (
            <div key={i} className="shrink-0" style={{ width: 64 }}>
              <PressableCard card={requireCard(id)} compact standalone />
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function TurnBanner({ state, simulating }: { state: MatchState; simulating: boolean }) {
  // Whose turn it is and how long is left on it now sit under each player's
  // own deck (see `TurnStatus`), which is where they belong — in the middle
  // of the mat they belonged to neither side, and they sat in the one place
  // the clash ring wants kept clear.
  //
  // What is left here is only what has no other home: the hand-off to
  // Simulate, and the prompt owed after a knockout. Setup still carries no
  // label at all — the mat's own slot outlines and the fanned hand are the
  // instruction, not a line of copy above them.
  const mine = state.promoting === 'you'
  const label = simulating
    ? 'Simulating…'
    : state.phase === 'promote'
      ? mine
        ? 'Choose a Figure'
        : 'Opponent is choosing'
      : null

  if (!label) return null

  return (
    <span
      className="font-display text-sm tracking-wide"
      style={{ color: simulating || mine ? 'var(--gold-bright)' : 'rgba(229,192,140,.5)' }}
    >
      {label}
    </span>
  )
}

/** How long the coin spins before settling — a beat longer than the reveal
 *  text and the overlay's own dismissal below, so both keep pace with it. */
const COIN_FLIP_S = 3.1

function CoinFlip({ first, onDone }: { first: 'you' | 'foe'; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, (COIN_FLIP_S + 0.7) * 1000)
    return () => clearTimeout(timer)
  }, [onDone])

  const heads = first === 'you'

  return (
    <motion.div
      className="fixed inset-0 z-[70] grid place-items-center"
      style={{ background: 'rgba(8,6,3,.88)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* The circular clip lives here, on the static wrapper, rather than
            on the two rotating faces below. A border-radius clip on an
            element that's also being 3D-transformed forces a lot of mobile
            browsers to give up on pure GPU compositing and re-rasterise the
            clip every frame — exactly what read as "laggy" on a handheld,
            even with the spin's timing already right. Clipping the
            non-rotating viewport onto it instead costs nothing per frame:
            the coin behind it can stay a plain, uninterrupted transform. */}
        <div
          style={{ width: 108, height: 108, perspective: 600, borderRadius: '50%', overflow: 'hidden' }}
        >
          <motion.div
            className="relative w-full h-full"
            style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
            initial={{ rotateY: 0 }}
            // A single continuous deceleration across the whole spin — fast
            // at the tap, steadily slowing, coming to rest right at the end
            // — rather than two segments stitched together (a constant pace
            // that only eases off in its last fraction reads as a coin that
            // suddenly decides to stop, not one that was spinning down the
            // whole time).
            animate={{ rotateY: heads ? 1800 : 1980 }}
            transition={{ duration: COIN_FLIP_S, ease: 'easeOut' }}
          >
            {/* Heads: the Covenant mark, facing the viewer at rest. */}
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
              <img src={asset('art/coin-heads.webp')} alt="" className="w-full h-full object-cover" />
            </div>
            {/* Tails: the book, pre-rotated so it faces the viewer once the
                parent has turned the rest of the way around. */}
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <img src={asset('art/coin-tails.webp')} alt="" className="w-full h-full object-cover" />
            </div>
          </motion.div>
        </div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: COIN_FLIP_S + 0.1 }}
        >
          <p className="font-display text-lg" style={{ color: 'var(--gold-bright)' }}>
            {heads ? 'Heads' : 'Tails'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'rgba(240,220,188,.7)' }}>
            {heads
              ? 'You go first — no energy this turn, and no attack.'
              : 'Your opponent goes first. You receive energy immediately.'}
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}

function Result({ state, onExit }: { state: MatchState; onExit: () => void }) {
  const won = state.winner === 'you'

  const reason =
    state.endReason === 'points'
      ? `${RULES.POINTS_TO_WIN} points taken`
      : state.endReason === 'deckout'
        ? 'A deck ran out'
        : state.endReason === 'no-figures'
          ? 'No Figures left to send out'
          : state.endReason === 'timeout'
            ? 'Time ran out'
            : 'Conceded'

  return (
    <motion.div
      className="fixed inset-0 z-[80] grid place-items-center px-8"
      style={{ background: 'rgba(8,6,3,.9)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="text-center w-full max-w-[320px]"
        initial={{ scale: 0.9, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <h1
          className="font-display font-bold tracking-wide"
          style={{
            fontSize: 44,
            background: won
              ? 'var(--gold-leaf)'
              : 'linear-gradient(160deg,#9c8d75,#6b5d47)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {won ? 'VICTORY' : 'DEFEAT'}
        </h1>

        <p className="text-sm mt-2" style={{ color: 'rgba(240,220,188,.7)' }}>
          {reason}
        </p>

        <div className="flex items-center justify-center gap-6 mt-6">
          <Score label="You" value={state.players.you.points} highlight={won} />
          <Score label="Opponent" value={state.players.foe.points} highlight={!won} />
        </div>

        <Button variant="gold" block className="mt-8" onClick={onExit}>
          Continue
        </Button>
      </motion.div>
    </motion.div>
  )
}

function Score({ label, value, highlight }: { label: string; value: number; highlight: boolean }) {
  return (
    <div className="text-center">
      <div
        className="font-numeric font-bold"
        style={{ fontSize: 34, color: highlight ? 'var(--gold-bright)' : 'rgba(240,220,188,.45)' }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: 'rgba(240,220,188,.5)' }}>
        {label}
      </div>
    </div>
  )
}

/** Why a card in hand currently has no legal play — shown instead of silence. */
function reasonCardIsStuck(state: MatchState, cardId: string): string {
  const card = requireCard(cardId)
  const you = state.players.you

  if (isFigure(card)) {
    if (card.stage === 'basic') {
      return you.bench.every((s) => s !== null) ? 'The Bench is full' : 'Not playable right now'
    }
    const base = card.ascendsFrom ? requireCard(card.ascendsFrom).name : 'its earlier form'
    const inPlay = figuresInPlay(you).some((f: FigureInPlay) => f.cardId === card.ascendsFrom)
    return inPlay
      ? `${base} entered play this turn and cannot ascend yet`
      : `${base} must be in play first`
  }

  if (card.kind === 'covenant') {
    if (you.covenantsLocked) return 'Covenants are locked this turn'
    return 'Only one Covenant may be played each turn'
  }

  return 'Not playable right now'
}
