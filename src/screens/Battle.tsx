import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { BattleMat } from '@/art/BattleMat'
import { CardBack } from '@/art/CardBack'
import { EnergyOrb } from '@/art/EnergyOrb'
import { CheckIcon, ResetIcon } from '@/art/icons'
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
  const { state, dispatch, legal, error, clearError, aiThinking, clocks, coinSettled, settleCoin } =
    useMatch(config)

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
  const myTurn = state.phase === 'main' && state.current === 'you'
  const mustPromote = state.phase === 'promote' && state.promoting === 'you'
  const setupPhase = state.phase === 'setup'

  // Errors are transient; a stale one under a later action reads as a new bug.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(clearError, 2600)
    return () => clearTimeout(timer)
  }, [error, clearError])

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

  // A drop target padded a few px beyond its own box, so a drop that lands
  // just outside a slot's visible edge — an easy miss on a small touchscreen
  // target — still counts, rather than silently snapping back to hand with no
  // explanation.
  const DROP_PAD = 14
  const within = (el: HTMLDivElement | null, point: { x: number; y: number }) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return (
      point.x >= r.left - DROP_PAD &&
      point.x <= r.right + DROP_PAD &&
      point.y >= r.top - DROP_PAD &&
      point.y <= r.bottom + DROP_PAD
    )
  }

  const slotAt = (point: { x: number; y: number }): HTMLDivElement | null => {
    if (within(activeSlotRef.current, point)) return activeSlotRef.current
    return benchSlotRefs.current.find((el) => within(el, point)) ?? null
  }

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
  const legalHandDrop = (index: number, point: { x: number; y: number }) => {
    const el = slotAt(point)
    if (!el) return null
    const actions = actionsFor.byHand.get(index) ?? []
    const figure = figureAt(el)
    const action = figure
      ? actions.find((a) => a.type === 'ASCEND' && a.uid === figure.uid)
      : actions.find((a) => a.type === 'PLAY_FIGURE' && el === benchSlotRefs.current[a.slot])
    return action ? { el, action } : null
  }

  const handleHandDrag = (index: number, point: { x: number; y: number }) => {
    if (setupPhase) {
      setHighlight(slotAt(point))
      return
    }
    setHighlight(legalHandDrop(index, point)?.el ?? null)
  }

  const handleHandDragEnd = (index: number, point: { x: number; y: number }) => {
    setHighlight(null)
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

  /* ------------------------------------------------------------- render */

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

        <div className="flex gap-1.5">
          {foe.bench.map((figure, i) => (
            <BoardFigure key={i} figure={figure} width={BENCH_W} emptyLabel="" />
          ))}
        </div>
        <BoardFigure figure={foe.active} width={ACTIVE_W} emptyLabel="Active" />

        <div className="w-full flex items-center justify-between gap-2 px-0.5">
          <StatsChip points={foe.points} seconds={clocks.foe} thinking={aiThinking} />
          <div className="flex items-center gap-2">
            <PileCount kind="deck" count={foe.deck.length} />
            <PileCount kind="discard" count={foe.discard.length} cardIds={foe.discard} />
          </div>
        </div>

        {/* Extra clearance: attached energy hangs below a Figure's card edge
            and would otherwise sit on top of the banner. */}
        <div className="flex items-center justify-center py-0.5 w-full">
          <TurnBanner state={state} myTurn={myTurn} seconds={clocks.turn} />
        </div>

        <div className="w-full flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2">
            <PileCount kind="deck" count={you.deck.length} />
            <PileCount kind="discard" count={you.discard.length} cardIds={you.discard} />
          </div>
          <StatsChip points={you.points} seconds={clocks.you} />
        </div>

        <div ref={activeSlotRef} className="shrink-0">
          <BoardFigure
            figure={you.active}
            width={ACTIVE_W}
            emptyLabel="Active"
            onClick={you.active && myTurn ? openActive : undefined}
            selected={Boolean(you.active && myTurn)}
            noPeek={Boolean(you.active && myTurn)}
          />
        </div>
        <div className="flex gap-1.5 mt-1">
          {you.bench.map((figure, i) => (
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
              />
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ hand */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-safe pb-2">
        <div className="flex items-end gap-1">
          <PlayerHand
            hand={you.hand}
            setupActive={setupActive}
            setupBench={setupBench}
            basicsInHand={basicsInHand}
            setupPhase={setupPhase}
            myTurn={myTurn}
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

          {/* Altar, with the small popup action trigger stacked above it. */}
          <div className="relative flex flex-col items-center gap-1.5 shrink-0">
            <AnimatePresence>
              {actionOpen && actionLabel && (
                <motion.div
                  className="absolute bottom-full mb-2 right-0 whitespace-nowrap"
                  initial={{ opacity: 0, y: 6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                >
                  <Button variant="gold" className="!px-4 !py-2 text-sm" onClick={runAction}>
                    {actionLabel}
                  </Button>
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
              disabled={!actionLabel}
              className="rounded-pill w-9 h-9 grid place-items-center"
              style={{
                background: actionLabel ? 'var(--surface-raised)' : 'var(--bg-sunk)',
                opacity: actionLabel ? 1 : 0.5,
              }}
              aria-label={actionLabel ?? 'No action available'}
              aria-expanded={actionOpen}
            >
              <CheckIcon size={16} className={actionLabel ? 'text-[var(--gold-bright)]' : 'text-ink-faint'} />
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

              <motion.button
                disabled={!myTurn || you.altar === null}
                className="relative rounded-pill grid place-items-center"
                style={{
                  width: 46,
                  height: 46,
                  background: you.altar ? 'var(--surface-raised)' : 'var(--bg-sunk)',
                  boxShadow: you.altar ? '0 0 14px rgba(229,192,140,.35)' : undefined,
                }}
                // No tap-to-sheet any more — dragging the orb onto a Figure is
                // the only way to attach energy now.
                drag={myTurn && you.altar !== null}
                dragSnapToOrigin
                dragElastic={0.35}
                whileDrag={{ zIndex: 2000, scale: 1.15 }}
                onDrag={(_event, info: PanInfo) => handleAltarDrag(info.point)}
                onDragEnd={(_event, info: PanInfo) => handleAltarDragEnd(info.point)}
                aria-label={you.altar ? `Altar: ${you.altar} energy ready — drag onto a Figure` : 'Altar empty'}
              >
                {you.altar ? (
                  <EnergyOrb type={you.altar} size={30} />
                ) : (
                  <span className="text-[9px] text-ink-faint tracking-wide">ALTAR</span>
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- overlays */}
      <AnimatePresence>
        {!coinSettled && <CoinFlip first={state.first} onDone={settleCoin} />}
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

      <AnimatePresence>
        {state.phase === 'ended' && (
          <Result state={state} onExit={onExit} />
        )}
      </AnimatePresence>
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
  playable: Map<number, Action[]>
  onTap: (index: number, isBasic: boolean) => void
  onDropEnd: (index: number, point: { x: number; y: number }) => void
  onDragMove: (index: number, point: { x: number; y: number }) => void
}) {
  const count = hand.length
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

  return (
    <div className="flex-1 min-w-0 relative" style={{ height: HAND_HEIGHT }}>
      {hand.map((cardId, index) => {
        const pickedActive = setupActive === index
        const pickedBench = setupBench.includes(index)
        const isBasic = basicsInHand.some((b) => b.index === index)
        const actions = playable.get(index) ?? []
        const draggable = setupPhase
          ? isBasic
          : myTurn && actions.some((a) => a.type === 'PLAY_FIGURE' || a.type === 'ASCEND')
        const offset = index - mid
        // Only an unspent Basic during setup — the moment it's picked it has
        // already been found, and a card already resting in the Active or
        // Bench outline doesn't need to keep asking for a drag that would
        // just undo the pick.
        const glows = setupPhase && isBasic && !pickedActive && !pickedBench

        return (
          <motion.button
            key={`${cardId}-${index}`}
            className="absolute bottom-0"
            style={{
              width: HAND_W,
              left: '50%',
              marginLeft: offset * spanStep - HAND_W / 2,
              // A tight fan means neighbours overlap enough that a card's own
              // centre can sit *under* the card next to it. Ordering by hand
              // position alone put a non-draggable neighbour on top of a
              // basic Figure often enough that a tap meant for the Figure
              // landed on the inert card covering it instead — nothing
              // happened, and it looked like the drag itself had failed.
              // Draggable cards now always win the stacking order over
              // non-draggable ones, so the card you can actually act on is
              // never the one buried underneath.
              zIndex: (draggable ? 1000 : 0) + index,
              transformOrigin: 'bottom center',
            }}
            animate={{
              // A card further from the centre dips a little further down, so
              // the row reads as a fan held from below rather than a straight
              // line of tilted cards.
              rotate: offset * rotateStep,
              y:
                (pickedActive || pickedBench ? -14 : 0) +
                offset * offset * 1.4 -
                (brushed === index ? 10 : 0),
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
            onDrag={(_event, info: PanInfo) => onDragMove(index, info.point)}
            onDragEnd={(_event, info: PanInfo) => {
              setBrushed(null)
              onDropEnd(index, info.point)
            }}
            // Setup is drag-only, full stop — a tap here used to be a no-op
            // already, but the button still visibly pressed down under a
            // finger, which reads as "this does something" even when it
            // doesn't. No click handler and no press animation is what
            // actually looks like a card that can only be dragged.
            onClick={setupPhase ? undefined : () => onTap(index, isBasic)}
            whileTap={setupPhase ? undefined : { scale: 0.95 }}
            disabled={setupPhase && !isBasic}
          >
            <div
              className={cx('rounded-[8%]', glows && 'cov-hand-glow')}
              style={{
                opacity: setupPhase && !isBasic ? 0.4 : 1,
                boxShadow: pickedActive
                  ? '0 0 0 2.5px var(--gold-bright)'
                  : pickedBench
                    ? '0 0 0 2px rgba(229,192,140,.6)'
                    : playable.has(index) && myTurn
                      ? '0 0 0 1.5px rgba(229,192,140,.4)'
                      : undefined,
              }}
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
 * A pile of face-down cards — the deck, or the discard.
 *
 * No text label any more; the pile reads by its art alone, and a tap answers
 * the question a label used to. On the deck that's a count, shown as a
 * digit over the card back and left to fade on its own rather than needing a
 * second tap to dismiss. On the discard it's the pile itself, fanned open
 * into a scrollable strip — public information in a card game, worth more
 * than a number.
 */
function PileCount({
  kind,
  count,
  cardIds,
}: {
  kind: 'deck' | 'discard'
  count: number
  cardIds?: string[]
}) {
  // Twice the card's former 26px width — the size the layout otherwise
  // reserved for a label underneath now goes to the pile itself.
  const size = 52

  const [revealed, setRevealed] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(fadeTimer.current), [])

  const tap = () => {
    if (count === 0) return
    if (kind === 'discard') {
      setRevealed((v) => !v)
      return
    }
    setRevealed(true)
    clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => setRevealed(false), 2200)
  }

  return (
    <>
      <button
        onClick={tap}
        disabled={count === 0}
        className="relative rounded-sm overflow-hidden"
        style={{ width: size, aspectRatio: '63/88' }}
        aria-label={
          kind === 'deck' ? `Deck: ${count} card${count === 1 ? '' : 's'} left` : `Discard: ${count} card${count === 1 ? '' : 's'}`
        }
      >
        {count > 0 ? (
          <CardBack />
        ) : (
          <div className="absolute inset-0 rounded-sm" style={{ background: 'rgba(10,7,3,.4)' }} />
        )}

        <AnimatePresence>
          {kind === 'deck' && revealed && (
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

      {kind === 'discard' && (
        <AnimatePresence>
          {revealed && <DiscardStrip cardIds={cardIds ?? []} onClose={() => setRevealed(false)} />}
        </AnimatePresence>
      )}
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
  seconds,
}: {
  state: MatchState
  myTurn: boolean
  seconds: number
}) {
  // Setup carries no label at all: the mat's own slot outlines and the fanned
  // hand are the instruction now, not a line of copy above them.
  const label =
    state.phase === 'setup'
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

function CoinFlip({ first, onDone }: { first: 'you' | 'foe'; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200)
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
        <div style={{ width: 108, height: 108, perspective: 600 }}>
          <motion.div
            className="relative w-full h-full"
            style={{ transformStyle: 'preserve-3d' }}
            initial={{ rotateY: 0 }}
            animate={{ rotateY: heads ? 1800 : 1980 }}
            transition={{ duration: 2.5, ease: [0.18, 0.9, 0.3, 1] }}
          >
            {/* Heads: the Covenant mark, facing the viewer at rest. */}
            <div
              className="absolute inset-0 rounded-pill overflow-hidden"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <img src={asset('art/coin-heads.webp')} alt="" className="w-full h-full object-cover" />
            </div>
            {/* Tails: the book, pre-rotated so it faces the viewer once the
                parent has turned the rest of the way around. */}
            <div
              className="absolute inset-0 rounded-pill overflow-hidden"
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
          transition={{ delay: 2.6 }}
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
      exit={{ opacity: 0 }}
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
