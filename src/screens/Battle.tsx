import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimation, type PanInfo } from 'framer-motion'
import { BattleMat } from '@/art/BattleMat'
import { CardBack } from '@/art/CardBack'
import { EnergyOrb } from '@/art/EnergyOrb'
import { CheckIcon, DiscardIcon, ResetIcon } from '@/art/icons'
import { Button } from '@/components/ui'
import { PressableCard } from '@/components/card/PressableCard'
import { requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { canPayCost, figureCard, figuresInPlay } from '@/engine/state'
import { isFigure, type EnergyType } from '@/game/types'
import { usePeek } from '@/store/peek'
import { useProfile } from '@/store/profile'
import { asset } from '@/lib/asset'
import { cx } from '@/lib/cx'
import { ActionSheet, type SheetOption } from './battle/ActionSheet'
import { AttackFx, impactDelaySeconds, shakeFor, type AttackFxTrigger } from './battle/AttackFx'
import { BoardFigure } from './battle/BoardFigure'
import { useMatch, type MatchConfig } from './battle/useMatch'
import type { Action } from '@/engine/actions'
import type { FigureInPlay, MatchState } from '@/engine/types'

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
  use: {
    ['--cov-hand-glow-dim-ring' as string]: 'rgba(229,192,140,.55)',
    ['--cov-hand-glow-dim-blur' as string]: 'rgba(229,192,140,.3)',
    ['--cov-hand-glow-bright-ring' as string]: 'var(--gold-bright)',
    ['--cov-hand-glow-bright-blur' as string]: 'rgba(229,192,140,.75)',
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
const YOU_ROW_LIFT = 80

/** A small nudge of the opponent's Active/Bench row toward the halfway
 *  line, the mirror of YOU_ROW_LIFT but far more modest — their side
 *  already sat close to the ring, so this only needs to close the last bit
 *  of the gap rather than cross into it. */
const FOE_ROW_LIFT = 20

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
  } = useMatch(config)

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

  const you = state.players.you
  const foe = state.players.foe
  // Simulate hands your side to the AI, so none of the manual controls that
  // gate off `myTurn`/`mustPromote` should still answer to a tap once it's
  // running — the two would otherwise race to act on the same turn.
  const myTurn = state.phase === 'main' && state.current === 'you' && !simulating
  const mustPromote = state.phase === 'promote' && state.promoting === 'you' && !simulating
  const setupPhase = state.phase === 'setup'

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
  const [attackFx, setAttackFx] = useState<AttackFxTrigger | null>(null)

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

    // A bigger recoil than a routine card game needs, deliberately — this
    // effect is meant to read as amplified, not restrained.
    attacker.start({
      y: [0, lungeDir * 20, 0],
      transition: { duration: 0.42, times: [0, 0.4, 1], ease: 'easeOut' },
    })

    if (!ev.missed) {
      setTimeout(() => {
        const shake = shakeFor(ev)
        defender.start({
          x: [0, -shake.amount, shake.amount, -shake.amount * 0.6, 0],
          transition: { duration: shake.seconds, ease: 'easeOut' },
        })
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

    setAttackFx({ event: ev, fromRect: fromEl.getBoundingClientRect(), toRect: toEl.getBoundingClientRect() })
    // Re-fires only when a genuinely new attack lands — `id` only ever
    // increases, so this can't retrigger off an unrelated state update that
    // happens to carry the same `lastAttack` forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAttack?.id])

  // The SETUP action removes the placed cards from hand, which shifts every
  // later card's index down — so a picked-card's hand index left sitting in
  // local state would start pointing at a different card the moment setup
  // ends, mislabelling it ACTIVE or BENCH in the fan for the rest of the
  // match. Nothing in this state is worth keeping once it has been spent.
  useEffect(() => {
    if (state.phase !== 'setup') setSetup({ active: null, bench: Array(RULES.BENCH_SIZE).fill(null) })
  }, [state.phase])

  const recordBattle = useProfile((s) => s.recordBattle)
  const [recorded, setRecorded] = useState(false)
  useEffect(() => {
    if (state.phase !== 'ended' || recorded) return
    setRecorded(true)
    const won = state.winner === 'you'
    recordBattle(won)
    onFinish?.(won)
  }, [state.phase, state.winner, recorded, recordBattle, onFinish])

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

    const options: SheetOption[] = (actionsFor.byHand.get(index) ?? []).map((action, i) => {
      switch (action.type) {
        case 'PLAY_FIGURE':
          return {
            id: `play-${i}`,
            label: 'Place on the Bench',
            detail: `Slot ${action.slot + 1}`,
            onSelect: () => dispatch(action),
          }
        case 'ASCEND': {
          const onto = figuresInPlay(you).find((f) => f.uid === action.uid)
          return {
            id: `ascend-${i}`,
            label: 'Ascend',
            detail: onto ? `onto ${requireCard(onto.cardId).name}` : undefined,
            onSelect: () => dispatch(action),
          }
        }
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
  // rather than through React state. A card in hand fires this on every frame
  // of the drag, and re-rendering the whole board that often turned out to be
  // enough to make framer's own drag recognition occasionally drop the
  // gesture entirely — the highlight is worth showing, but not at the cost of
  // the drag itself sometimes silently failing to register. The same slot
  // refs serve two different drags — a hand card looking for an empty Active
  // or Bench slot during setup, and (below) the Altar looking for an occupied
  // one to attach to — so this checks for either child rather than assuming
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
      setHighlight(slotAt(point))
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
    setHighlight(legalHandDrop(index, point)?.el ?? null)
  }

  const handleHandDragEnd = (index: number, point: { x: number; y: number }) => {
    setHighlight(null)
    setMagnet(null)
    if (setupPhase) {
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
        <div className="flex gap-1.5" style={{ transform: `translateY(${FOE_ROW_LIFT}px)` }}>
          {foe.bench.map((figure, i) => (
            <BoardFigure key={i} figure={figure} width={BENCH_W} emptyLabel="" />
          ))}
        </div>
        <div ref={foeActiveSlotRef} style={{ transform: `translateY(${FOE_ROW_LIFT}px)` }}>
          <motion.div animate={foeFigureFx}>
            <BoardFigure figure={foe.active} width={ACTIVE_W} emptyLabel="Active" />
          </motion.div>
        </div>

        <div className="w-full flex items-center justify-between gap-2 px-0.5">
          <StatsChip points={foe.points} seconds={clocks.foe} thinking={aiThinking} />
          <div className="flex items-center gap-2">
            <PileCount count={foe.deck.length} />
            <DiscardButton count={foe.discard.length} cardIds={foe.discard} />
          </div>
        </div>

        {/* Extra clearance: attached energy hangs below a Figure's card edge
            and would otherwise sit on top of the banner. */}
        <div className="flex items-center justify-center py-0.5 w-full">
          <TurnBanner state={state} myTurn={myTurn} simulating={simulating} seconds={clocks.turn} />
        </div>

        <div className="w-full flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2">
            <PileCount count={you.deck.length} />
            <DiscardButton count={you.discard.length} cardIds={you.discard} />
          </div>
          <StatsChip points={you.points} seconds={clocks.you} />
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
            YOU_ROW_LIFT pulls it in far enough to sit inside the ring. */}
        <div
          ref={activeSlotRef}
          className="shrink-0"
          style={{ transform: `translateY(-${YOU_ROW_LIFT}px)` }}
        >
          <motion.div animate={youFigureFx}>
            <BoardFigure
              figure={you.active}
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
          style={{ transform: `translateY(-${YOU_ROW_LIFT}px)` }}
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

            <div className="relative grid place-items-center">
              {/* Charged glow: energy is attached by dragging the orb onto a
                  Figure now, so this is the zone's only "something's here"
                  tell besides the orb itself sitting on top of it. */}
              {you.altar && (
                <div
                  className="cov-altar-glow absolute rounded-full pointer-events-none"
                  style={{
                    width: 46,
                    height: 46,
                    background: 'radial-gradient(circle, rgba(229,192,140,.55), transparent 70%)',
                  }}
                />
              )}

              {/* The Altar itself — the socket, not the thing being dragged.
                  It never moves: only the orb sitting on top of it (below)
                  drags onto a Figure, so the frame stays put as the visual
                  anchor for "this is where energy comes from" whether or
                  not one is resting there right now. */}
              <div
                className="relative rounded-pill grid place-items-center"
                style={{
                  width: 46,
                  height: 46,
                  background: you.altar ? 'var(--surface-raised)' : 'var(--bg-sunk)',
                  boxShadow: you.altar ? '0 0 14px rgba(229,192,140,.35)' : undefined,
                }}
                aria-hidden={you.altar !== null}
              >
                {!you.altar && <span className="text-[9px] text-ink-faint tracking-wide">ALTAR</span>}
              </div>

              {/* The energy orb, layered on top of the (stationary) Altar.
                  No tap-to-sheet any more — dragging it onto a Figure is the
                  only way to attach energy now. */}
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
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- overlays */}
      <AnimatePresence>
        {!coinSettled && <CoinFlip first={state.first} onDone={settleCoin} />}
      </AnimatePresence>

      <AttackFx trigger={attackFx} onDone={() => setAttackFx(null)} />

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
      {state.phase === 'ended' && <Result state={state} onExit={onExit} />}
    </div>
  )
}

/* --------------------------------------------------------------- pieces */

/**
 * Points and time left, with no name attached — the name lived in a full-width
 * bar across the top and bottom of the mat; without it, this is small enough
 * to tuck into a corner of the board instead. `corner` places it in that
 * side's own outer corner, top for the opponent and bottom for you, on the
 * same mat so the two read as one mirrored rule rather than two bars.
 */
function StatsChip({
  points,
  seconds,
  thinking,
}: {
  points: number
  seconds: number
  thinking?: boolean
}) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60

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

      <span
        className="text-[11px] font-numeric tabular-nums"
        style={{ color: seconds < 60 ? '#ef8f7c' : 'rgba(229,192,140,.75)' }}
      >
        {minutes}:{String(rest).padStart(2, '0')}
        {thinking && '…'}
      </span>
    </div>
  )
}

/**
 * The hand, fanned rather than scrolled.
 *
 * Each card is rotated and lifted by its distance from the centre — framer's
 * own `rotate`/`y` style keys, not a plain CSS `transform` string, so a drag's
 * own x/y compose with the fan's static pose instead of one overwriting the
 * other. Spread narrows as the hand grows, so a big hand fans within the same
 * width a small one does rather than spilling past the Altar column.
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
  const [browsing, setBrowsing] = useState(false)
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
  // whatever `animate` currently targets for x/y — so clearing the focus the
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

  const isDraggableIndex = (index: number) => {
    const isBasic = basicsInHand.some((b) => b.index === index)
    const actions = playable.get(index) ?? []
    return (
      !simulating &&
      (setupPhase ? isBasic : myTurn && actions.some((a) => a.type === 'PLAY_FIGURE' || a.type === 'ASCEND'))
    )
  }

  /** Which of the three things make a card glow, if any — each reads as a
   *  different colour (see VIABILITY_GLOW below): gold for something
   *  placeable, white for an ascension, red for a Covenant or Relic's own
   *  ability. Unlike `isDraggableIndex`, this also covers those last two —
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

  /** The topmost card whose box contains this point, ranked by the same
   *  plain hand-order stacking the fan renders with — see the `zIndex`
   *  comment at the render site for why viability plays no part in it. */
  const hitTest = (x: number, y: number): number | null => {
    const order = Array.from({ length: hand.length }, (_, i) => i).sort((a, b) => b - a)
    for (const i of order) {
      const el = cardRefs.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
    }
    return null
  }

  // No `setPointerCapture` anywhere here, deliberately: capturing the
  // pointer on this container would retarget every subsequent event for it
  // away from whichever card the finger came down on — including the
  // native listeners Framer's own `drag` attaches directly to that card —
  // which broke the drag-to-play gesture outright rather than merely
  // competing with it cosmetically. Plain event bubbling already reaches
  // this container from any card beneath it, which is all hit-testing here
  // needs.
  const onHandPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== null) return
    activePointer.current = e.pointerId
    lastPoint.current = { x: e.clientX, y: e.clientY }
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      if (activePointer.current === null) return
      setBrowsing(true)
      setFocusIndex(hitTest(lastPoint.current.x, lastPoint.current.y))
    }, HOLD_TO_FAN_MS)
  }

  const onHandPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingCard.current) return
    if (activePointer.current !== e.pointerId) return
    lastPoint.current = { x: e.clientX, y: e.clientY }
    if (!browsing) return
    setFocusIndex(hitTest(e.clientX, e.clientY))
  }

  const endHold = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return
    clearTimeout(holdTimer.current)
    activePointer.current = null
    setBrowsing(false)
    setFocusIndex(null)
  }

  return (
    <div
      className="flex-1 min-w-0 relative"
      style={{ height: HAND_HEIGHT, touchAction: 'none' }}
      onPointerDown={onHandPointerDown}
      onPointerMove={onHandPointerMove}
      onPointerUp={endHold}
      onPointerCancel={endHold}
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
        const draggable = isDraggableIndex(index)
        // Rank among the visible cards, not the raw hand index — see the
        // comment on `visibleIndices` above.
        const rank = visibleIndices.indexOf(index)
        const offset = rank - mid
        // The glow (coloured by which of the three this is) is the *only*
        // thing that marks a card viable; there is deliberately no height
        // or position change to go with it — see the fan's `y`/`x` below,
        // which never reads viability at all.
        const viability = viabilityOf(index)
        let isFocused = focusIndex === index
        // This card is mid-drag: use the focus state frozen the instant
        // that drag began instead of the live (already-cleared) browse
        // state — see frozenPose's own comment for why.
        if (draggingIndex.current === index && frozenPose.current) {
          isFocused = frozenPose.current.isFocused
        }

        return (
          <motion.button
            key={`${cardId}-${index}`}
            ref={(el) => {
              cardRefs.current[index] = el
            }}
            className="absolute bottom-0"
            style={{
              width: HAND_W,
              left: '50%',
              marginLeft: -HAND_W / 2,
              // A plain ribbon spread: stacking order always follows hand
              // order, full stop. Whether a card is viable never changes it —
              // a viable card earlier in the hand stays exactly as overlapped
              // by its later neighbours as a non-viable one would be, rather
              // than jumping ahead of them. Only the browsed (held-and-lifted)
              // card is ever an exception, since it's meant to visibly clear
              // the row while it's focused.
              zIndex: isFocused ? 3000 : index,
              transformOrigin: 'bottom center',
            }}
            animate={{
              // The fan itself never moves — only `y` and `scale` change for
              // whichever card is focused, so there's nothing else to
              // resettle when the finger moves on to a neighbour, and the
              // handoff between the two reads as one continuous motion
              // instead of the fan itself lurching.
              x: offset * spanStep,
              rotate: offset * rotateStep,
              y: offset * offset * 1.4 - (brushed === index ? 10 : 0) - (isFocused ? BROWSE_LIFT : 0),
              scale: isFocused ? BROWSE_SCALE : 1,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onPointerEnter={() => setBrushed(index)}
            onPointerLeave={() => setBrushed((b) => (b === index ? null : b))}
            drag={draggable}
            dragSnapToOrigin
            dragElastic={0.35}
            // Straightens to upright the instant a card lifts off the fan,
            // rather than carrying its resting tilt around under the thumb —
            // a card you're holding reads as held, not still leaning the way
            // it happened to sit in the hand. Nothing here persists past the
            // gesture: whileDrag and the brush lift above both fall away on
            // their own the moment the interaction ends, so every card is
            // back at exactly the spot its offset computes, holding nothing
            // from what was just done to it.
            whileDrag={{ zIndex: 2000, scale: 1.1, rotate: 0 }}
            onDragStart={() => {
              // Freeze this card's own focus state first, then clear the
              // shared browse state — so whichever *other* card was lifted
              // settles back down immediately (nothing is fighting its
              // drag), while this one keeps rendering the exact pose it had
              // the instant it grabbed, all the way to drop.
              frozenPose.current = { isFocused }
              draggingIndex.current = index
              draggingCard.current = true
              clearTimeout(holdTimer.current)
              activePointer.current = null
              setBrowsing(false)
              setFocusIndex(null)
            }}
            onDrag={(_event, info: PanInfo) => onDragMove(index, info.point)}
            onDragEnd={(_event, info: PanInfo) => {
              draggingCard.current = false
              draggingIndex.current = null
              frozenPose.current = null
              setBrushed(null)
              onDropEnd(index, info.point)
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
            whileTap={setupPhase || simulating ? undefined : { scale: 0.95 }}
            disabled={(setupPhase && !isBasic) || simulating}
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
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * The opponent's hand, face-down and unreachable — a count of cards fanned
 * out the same way yours is, so the board reads as two hands at the table
 * rather than one player's cards and the other's invisible ones. Smaller and
 * inert: nothing here is a target for anything, it only tells you how many
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
              transform: `translateY(${offset * offset * 1.1}px) rotate(${offset * rotateStep}deg)`,
              transformOrigin: 'top center',
              zIndex: count - Math.abs(offset),
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
 * The discard pile, as a touch button rather than a pile of its own — there
 * was never a stack worth looking at here (a discard pile is public
 * information regardless of how many cards are in it, unlike a face-down
 * deck), so the slot it used to occupy now carries the game's own
 * letterform for it instead. Tapping opens the same fanned strip the old
 * pile slot did.
 */
function DiscardButton({ count, cardIds }: { count: number; cardIds: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => count > 0 && setOpen((v) => !v)}
        disabled={count === 0}
        className="relative shrink-0 rounded-pill grid place-items-center"
        style={{
          width: 34,
          height: 34,
          background: 'var(--bg-sunk)',
          border: '1px solid rgba(229,192,140,.25)',
          opacity: count === 0 ? 0.4 : 1,
        }}
        aria-label={`Discard: ${count} card${count === 1 ? '' : 's'}`}
      >
        <DiscardIcon size={15} className="text-ink-faint" />
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

      <AnimatePresence>
        {open && <DiscardStrip cardIds={cardIds} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
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

function TurnBanner({
  state,
  myTurn,
  simulating,
  seconds,
}: {
  state: MatchState
  myTurn: boolean
  simulating: boolean
  seconds: number
}) {
  // Setup carries no label at all: the mat's own slot outlines and the fanned
  // hand are the instruction now, not a line of copy above them. Simulating
  // overrides that — with dragging disabled there's nothing left on screen
  // to explain what's about to happen, so this becomes the only place that
  // does. It stays fixed through the whole hand-off rather than swinging
  // between "Your turn" and "Opponent's turn" as sides alternate, since
  // neither is true any more in the sense a player would read them.
  const label = simulating
    ? 'Simulating…'
    : state.phase === 'setup'
      ? null
      : state.phase === 'promote'
        ? state.promoting === 'you'
          ? 'Choose a Figure'
          : 'Opponent is choosing'
        : myTurn
          ? 'Your turn'
          : "Opponent's turn"

  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      {label && (
        <span
          className="font-display text-sm tracking-wide"
          style={{ color: myTurn ? 'var(--gold-bright)' : 'rgba(229,192,140,.5)' }}
        >
          {label}
        </span>
      )}
      {state.phase === 'main' && (
        <span
          className="text-[10px] font-numeric tabular-nums"
          style={{ color: seconds <= 10 ? '#ef8f7c' : 'rgba(229,192,140,.45)' }}
        >
          {seconds}s · turn {state.turn}
        </span>
      )}
    </div>
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
