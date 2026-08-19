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

const ACTIVE_W = 96
const BENCH_W = 60
const HAND_W = 68

/** Tall enough for a lifted card plus the fan's own arc and a picked card's
 *  badge, at the widest hands this game deals. */
const HAND_HEIGHT = 112

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

  const openAltar = () => {
    if (!myTurn || you.altar === null) return

    const options: SheetOption[] = figuresInPlay(you).map((figure) => ({
      id: `attach-${figure.uid}`,
      label: `Attach to ${requireCard(figure.cardId).name}`,
      detail: you.active?.uid === figure.uid ? 'Active' : 'Bench',
      disabled: !actionsFor.byUid.has(figure.uid),
      reason: 'Energy has already been attached this turn',
      onSelect: () => dispatch({ type: 'ATTACH', uid: figure.uid }),
    }))

    setSheet({ title: 'The Altar', subtitle: 'One energy may be attached each turn', options })
  }

  /* --------------------------------------------------------------- drag */

  // Drop targets for the setup-phase hand drag: the Active slot and each
  // Bench slot's own wrapping element, measured at drop time rather than
  // cached, since the mat reflows with the viewport and with orientation.
  const activeSlotRef = useRef<HTMLDivElement>(null)
  const benchSlotRefs = useRef<(HTMLDivElement | null)[]>([])

  const handleHandDragEnd = (index: number, point: { x: number; y: number }) => {
    const within = (el: HTMLDivElement | null) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom
    }
    if (within(activeSlotRef.current)) {
      placeActive(index)
      return
    }
    const slot = benchSlotRefs.current.findIndex(within)
    if (slot !== -1) placeBench(index, slot)
  }

  /* --------------------------------------------------------------- action */

  // What the small popup above the Altar offers, if anything. Promote has
  // its own instruction on the turn banner and its own targetable Bench
  // glow — nothing for this button to add there.
  const benchCount = setupBench.filter((i) => i !== null).length
  const actionLabel =
    state.phase === 'setup'
      ? setupActive === null
        ? null
        : benchCount === 0
          ? 'Start Battle — no Bench'
          : `Start Battle — ${benchCount} on the Bench`
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

          Each side is a mirror of the other: piles sit just off the mat's own
          centreline on the left, and the points/time badge sits in that
          side's own outer corner — top-right for the opponent, bottom-right
          for you, on the same shared container so "mirrored" is one rule
          applied twice rather than two hand-tuned layouts. */}
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
        className="relative z-10 flex-1 flex flex-col items-center justify-center gap-2 min-h-0 px-3 overflow-hidden"
        style={{
          paddingTop: `calc(${HAND_TRAY_CALC} / 2 + env(safe-area-inset-top, 0px))`,
          paddingBottom: `calc(${HAND_TRAY_CALC} / 2)`,
        }}
      >
        <CornerStats corner="top" points={foe.points} seconds={clocks.foe} thinking={aiThinking} />

        <div className="flex gap-1.5">
          {foe.bench.map((figure, i) => (
            <BoardFigure key={i} figure={figure} width={BENCH_W} emptyLabel="" />
          ))}
        </div>
        <BoardFigure figure={foe.active} width={ACTIVE_W} emptyLabel="Active" />

        <div className="w-full flex justify-start pl-0.5">
          <PileCount label="Deck" count={foe.deck.length} small />
          <PileCount label="Disc" count={foe.discard.length} small />
        </div>

        {/* Extra clearance: attached energy hangs below a Figure's card edge
            and would otherwise sit on top of the banner. */}
        <div className="flex items-center justify-center py-1.5 w-full">
          <TurnBanner state={state} myTurn={myTurn} seconds={clocks.turn} />
        </div>

        <div className="w-full flex justify-start pl-0.5">
          <PileCount label="Deck" count={you.deck.length} small />
          <PileCount label="Disc" count={you.discard.length} small />
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
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        <CornerStats corner="bottom" points={you.points} seconds={clocks.you} />
      </div>

      {/* ------------------------------------------------------------ hand */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-safe pb-2">
        <div className="flex items-end gap-1">
          <PlayerHand
            hand={you.hand}
            setupActive={setupActive}
            setupBench={setupBench}
            basicsInHand={basicsInHand}
            setupPhase={state.phase === 'setup'}
            myTurn={myTurn}
            playable={actionsFor.byHand}
            onTap={(index) => {
              // Setup places cards by drag only now — a tap during setup used
              // to auto-assign the next open slot, but that made the drag
              // gesture redundant instead of authoritative. Outside setup, a
              // tap still opens the card's own sheet of plays.
              if (state.phase !== 'setup') openHandCard(index)
            }}
            onDropEnd={handleHandDragEnd}
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

            <button
              onClick={openAltar}
              disabled={!myTurn || you.altar === null}
              className="rounded-pill grid place-items-center transition-transform"
              style={{
                width: 46,
                height: 46,
                background: you.altar ? 'var(--surface-raised)' : 'var(--bg-sunk)',
                boxShadow: you.altar ? '0 0 14px rgba(229,192,140,.35)' : undefined,
              }}
              aria-label={you.altar ? `Altar: ${you.altar} energy ready` : 'Altar empty'}
            >
              {you.altar ? (
                <EnergyOrb type={you.altar} size={30} />
              ) : (
                <span className="text-[9px] text-ink-faint tracking-wide">ALTAR</span>
              )}
            </button>
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
function CornerStats({
  corner,
  points,
  seconds,
  thinking,
}: {
  corner: 'top' | 'bottom'
  points: number
  seconds: number
  thinking?: boolean
}) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60

  return (
    <div
      className={cx(
        'absolute right-2 z-10 flex items-center gap-1.5 rounded-pill px-2 py-1',
        corner === 'top' && 'top-2',
      )}
      style={{
        background: 'rgba(10,7,3,.55)',
        border: '1px solid rgba(229,192,140,.25)',
        // The board now spans the full screen (see the container above), so
        // `bottom-2` would sit right behind the hand tray instead of above
        // it — this clears the tray by the same 8px the top badge sits from
        // the top edge.
        ...(corner === 'bottom' ? { bottom: `calc(${HAND_TRAY_CALC} + 8px)` } : {}),
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
}) {
  const count = hand.length
  const mid = (count - 1) / 2
  // Divided by count rather than count-1, and with no flat ceiling for the
  // hand sizes this game actually deals: the old cap saturated at max spread
  // for anything up to eight or nine cards, so drawing a card never visibly
  // tightened the fan until a hand was already unusually large.
  const rotateStep = count > 1 ? Math.min(14, Math.max(2.5, 40 / count)) : 0
  const spanStep = count > 1 ? Math.min(46, Math.max(14, 160 / count)) : 0

  return (
    <div className="flex-1 min-w-0 relative" style={{ height: HAND_HEIGHT }}>
      {hand.map((cardId, index) => {
        const pickedActive = setupActive === index
        const pickedBench = setupBench.includes(index)
        const isBasic = basicsInHand.some((b) => b.index === index)
        const draggable = setupPhase && isBasic
        const offset = index - mid

        return (
          <motion.button
            key={`${cardId}-${index}`}
            className="absolute bottom-0"
            style={{
              width: HAND_W,
              left: '50%',
              marginLeft: offset * spanStep - HAND_W / 2,
              zIndex: index,
              transformOrigin: 'bottom center',
            }}
            animate={{
              // A card further from the centre dips a little further down, so
              // the row reads as a fan held from below rather than a straight
              // line of tilted cards.
              rotate: offset * rotateStep,
              y: (pickedActive || pickedBench ? -14 : 0) + offset * offset * 1.4,
            }}
            drag={draggable}
            dragSnapToOrigin
            dragElastic={0.35}
            whileDrag={{ zIndex: 40, scale: 1.1 }}
            onDragEnd={(_event, info: PanInfo) => onDropEnd(index, info.point)}
            onClick={() => onTap(index, isBasic)}
            whileTap={{ scale: 0.95 }}
            disabled={setupPhase && !isBasic}
          >
            <div
              className="rounded-[8%]"
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
            {pickedActive && (
              <span
                className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-pill px-1.5 text-[8px] font-bold"
                style={{ background: 'var(--gold)', color: '#241a0e' }}
              >
                ACTIVE
              </span>
            )}
            {pickedBench && (
              <span
                className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-pill px-1.5 text-[8px] font-bold"
                style={{ background: 'rgba(229,192,140,.75)', color: '#241a0e' }}
              >
                BENCH
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

function PileCount({ label, count, small }: { label: string; count: number; small?: boolean }) {
  const size = small ? 26 : 34
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative rounded-sm overflow-hidden" style={{ width: size }}>
        {count > 0 ? (
          <CardBack />
        ) : (
          <div style={{ aspectRatio: '63/88', background: 'rgba(10,7,3,.4)', borderRadius: 3 }} />
        )}
      </div>
      <span className="text-[8px] tabular-nums" style={{ color: 'rgba(229,192,140,.55)' }}>
        {label} {count}
      </span>
    </div>
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
    const timer = setTimeout(onDone, 2600)
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
        <motion.div
          className="rounded-pill grid place-items-center"
          style={{
            width: 108,
            height: 108,
            background: 'var(--gold-leaf)',
            boxShadow: '0 12px 40px rgba(0,0,0,.6)',
          }}
          initial={{ rotateX: 0 }}
          animate={{ rotateX: heads ? 1800 : 1980 }}
          transition={{ duration: 1.9, ease: [0.18, 0.9, 0.3, 1] }}
        >
          <span className="font-display text-2xl font-bold" style={{ color: '#3a2a07' }}>
            {heads ? 'H' : 'T'}
          </span>
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2 }}
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
