import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BattleMat } from '@/art/BattleMat'
import { CardBack } from '@/art/CardBack'
import { EnergyOrb } from '@/art/EnergyOrb'
import { ScrollIcon } from '@/art/icons'
import { Button } from '@/components/ui'
import { Card } from '@/components/card/Card'
import { requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { canPayCost, figureCard, figuresInPlay } from '@/engine/state'
import { isFigure, type EnergyType } from '@/game/types'
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
  // Active and Bench picks live in one object updated functionally. Held as
  // two independent pieces of state and set from a stale closure, three taps
  // inside one React batch all saw `active` as null and overwrote each other,
  // so a player who tapped quickly started with an empty Bench.
  const [setup, setSetup] = useState<{ active: number | null; bench: number[] }>({
    active: null,
    bench: [],
  })
  const setupActive = setup.active
  const setupBench = setup.bench
  const [logOpen, setLogOpen] = useState(false)

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

  const toggleSetupPick = (index: number) =>
    setSetup((prev) => {
      // First pick becomes the Active Figure.
      if (prev.active === null) return { active: index, bench: prev.bench }

      // Tapping the Active again releases it; the first benched Figure, if
      // any, steps up so the board never loses its Active spot.
      if (prev.active === index) {
        return { active: prev.bench[0] ?? null, bench: prev.bench.slice(1) }
      }

      if (prev.bench.includes(index)) {
        return { active: prev.active, bench: prev.bench.filter((i) => i !== index) }
      }

      if (prev.bench.length < RULES.BENCH_SIZE) {
        return { active: prev.active, bench: [...prev.bench, index] }
      }

      return prev
    })

  const startBattle = () => {
    if (setupActive === null) return
    dispatch({ type: 'SETUP', player: 'you', active: setupActive, bench: setupBench })
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

    setSheet({
      title: card.name,
      subtitle: `${Math.max(0, card.hp - active.damage)} of ${card.hp} HP · ${active.energy.length} energy`,
      options: [...attackOptions, ...retreatOptions],
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

  /* ------------------------------------------------------------- render */

  return (
    <div className="on-dark fixed inset-0 flex flex-col overflow-hidden">
      <BattleMat theme={themeType} />

      {/* --------------------------------------------------------- opponent */}
      <div className="relative z-10 px-3 pt-safe">
        <PlayerBar
          name={opponentName}
          points={foe.points}
          seconds={clocks.foe}
          active={state.current === 'foe'}
          thinking={aiThinking}
        />
      </div>

      {/* Both halves push their Active Figure toward the centre ring, so the
          clash reads as happening in the middle of the mat rather than leaving
          a dead band between the two boards. */}
      {/* The board is one centred block, so the two halves meet at the mat's
          clash ring instead of being pushed to the screen edges with a dead
          band between them. */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-2 min-h-0 px-3 overflow-hidden">
        {/* Opponent's piles sit on their own side; in the centre they read as
            belonging to nobody. */}
        <div className="w-full flex justify-end gap-1.5 pr-0.5">
          <PileCount label="Deck" count={foe.deck.length} small />
          <PileCount label="Disc" count={foe.discard.length} small />
        </div>

        <div className="flex gap-1.5">
          {foe.bench.map((figure, i) => (
            <BoardFigure key={i} figure={figure} width={BENCH_W} emptyLabel="" />
          ))}
        </div>
        <BoardFigure figure={foe.active} width={ACTIVE_W} emptyLabel="Active" />

        {/* Extra clearance: attached energy hangs below a Figure's card edge
            and would otherwise sit on top of the banner. */}
        <div className="flex items-center justify-center py-2.5 w-full">
          <TurnBanner state={state} myTurn={myTurn} seconds={clocks.turn} />
        </div>

        <BoardFigure
          figure={you.active}
          width={ACTIVE_W}
          emptyLabel="Active"
          onClick={you.active && myTurn ? openActive : undefined}
          selected={Boolean(you.active && myTurn)}
        />
        <div className="flex gap-1.5 mt-1">
          {you.bench.map((figure, i) => (
            <BoardFigure
              key={i}
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
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ hand */}
      <div className="relative z-10 px-3 pb-safe pb-2">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <div className="scroll-x flex gap-1.5 pb-1 items-end" style={{ minHeight: 96 }}>
              {you.hand.map((cardId, index) => {
                const pickedActive = setupActive === index
                const pickedBench = setupBench.includes(index)
                const isBasic = basicsInHand.some((b) => b.index === index)
                const setupPhase = state.phase === 'setup'

                return (
                  <motion.button
                    key={`${cardId}-${index}`}
                    layout
                    onClick={() =>
                      setupPhase ? isBasic && toggleSetupPick(index) : openHandCard(index)
                    }
                    className="shrink-0 relative"
                    style={{ width: HAND_W }}
                    animate={{ y: pickedActive || pickedBench ? -10 : 0 }}
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
                            : actionsFor.byHand.has(index) && myTurn
                              ? '0 0 0 1.5px rgba(229,192,140,.4)'
                              : undefined,
                      }}
                    >
                      <Card card={requireCard(cardId)} compact noHolo />
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
          </div>

          {/* Altar and piles */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
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
            <div className="flex gap-1">
              <PileCount label="Deck" count={you.deck.length} small />
              <PileCount label="Disc" count={you.discard.length} small />
            </div>
          </div>
        </div>

        <PlayerBar
          name="You"
          points={you.points}
          seconds={clocks.you}
          active={myTurn}
          className="mt-2"
        />

        {/* ------------------------------------------------------- controls */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setLogOpen(true)}
            className="rounded-pill w-11 h-11 grid place-items-center shrink-0"
            style={{ background: 'var(--surface)' }}
            aria-label="Battle log"
          >
            <ScrollIcon size={19} className="text-ink-muted" />
          </button>

          {state.phase === 'setup' ? (
            <Button variant="gold" block disabled={setupActive === null} onClick={startBattle}>
              {setupActive === null
                ? 'Tap a Basic Figure'
                : setupBench.length === 0
                  ? 'Start Battle — no Bench'
                  : `Start Battle — ${setupBench.length} on the Bench`}
            </Button>
          ) : mustPromote ? (
            <div
              className="flex-1 rounded-pill grid place-items-center text-sm font-medium"
              style={{ background: 'var(--bg-sunk)', color: 'var(--gold-bright)' }}
            >
              Choose a Figure to step up
            </div>
          ) : (
            <Button variant="gold" block disabled={!myTurn} onClick={() => dispatch({ type: 'END_TURN' })}>
              {myTurn ? 'End Turn' : aiThinking ? 'Opponent is thinking…' : 'Waiting…'}
            </Button>
          )}
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

      {logOpen && <BattleLog state={state} onClose={() => setLogOpen(false)} />}

      <AnimatePresence>
        {state.phase === 'ended' && (
          <Result state={state} onExit={onExit} />
        )}
      </AnimatePresence>
    </div>
  )
}

/* --------------------------------------------------------------- pieces */

function PlayerBar({
  name,
  points,
  seconds,
  active,
  thinking,
  className,
}: {
  name: string
  points: number
  seconds: number
  active: boolean
  thinking?: boolean
  className?: string
}) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60

  return (
    <div
      className={cx('flex items-center gap-2.5 rounded-pill px-3 py-1.5', className)}
      style={{
        background: active ? 'rgba(229,192,140,.14)' : 'rgba(10,7,3,.5)',
        border: `1px solid ${active ? 'rgba(229,192,140,.4)' : 'transparent'}`,
      }}
    >
      <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--ink)' }}>
        {name}
        {thinking && <span className="text-ink-faint"> · thinking</span>}
      </span>

      {/* Points as filled pips, so the race to three is readable at a glance. */}
      <span className="flex gap-1" aria-label={`${points} of ${RULES.POINTS_TO_WIN} points`}>
        {Array.from({ length: RULES.POINTS_TO_WIN }, (_, i) => (
          <span
            key={i}
            className="w-2.5 h-2.5 rounded-pill"
            style={{
              background: i < points ? 'var(--gold-bright)' : 'rgba(229,192,140,.2)',
              boxShadow: i < points ? '0 0 6px rgba(229,192,140,.6)' : undefined,
            }}
          />
        ))}
      </span>

      <span
        className="text-xs font-numeric tabular-nums"
        style={{ color: seconds < 60 ? '#ef8f7c' : 'var(--ink-muted)' }}
      >
        {minutes}:{String(rest).padStart(2, '0')}
      </span>
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
  const label =
    state.phase === 'setup'
      ? 'Choose your opening board'
      : state.phase === 'promote'
        ? state.promoting === 'you'
          ? 'Choose a Figure'
          : 'Opponent is choosing'
        : myTurn
          ? 'Your turn'
          : "Opponent's turn"

  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <span
        className="font-display text-sm tracking-wide"
        style={{ color: myTurn ? 'var(--gold-bright)' : 'rgba(229,192,140,.5)' }}
      >
        {label}
      </span>
      {state.phase === 'main' && (
        <span
          className="text-[10px] font-numeric tabular-nums"
          style={{ color: seconds <= 10 ? '#ef8f7c' : 'rgba(229,192,140,.45)' }}
        >
          {seconds}s · turn {state.turn}
        </span>
      )}

      {/* Opening with no Bench loses to the first knockout, which is a harsh
          way to learn the rule. The prompt says so up front. */}
      {state.phase === 'setup' && (
        <span
          className="text-[10px] text-center px-6 leading-snug"
          style={{ color: 'rgba(229,192,140,.5)' }}
        >
          Tap a Basic Figure for the Active spot, then up to {RULES.BENCH_SIZE} more for your
          Bench. With no Bench, one knockout ends the match.
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

function BattleLog({ state, onClose }: { state: MatchState; onClose: () => void }) {
  return (
    <ActionSheet
      title="Battle log"
      subtitle={`Turn ${state.turn}`}
      options={[...state.log]
        .reverse()
        .slice(0, 40)
        .map((entry, i) => ({
          id: `log-${i}`,
          label: entry.text,
          detail: `Turn ${entry.turn} · ${entry.player === 'you' ? 'you' : 'opponent'}`,
          disabled: true,
          reason: `Turn ${entry.turn} · ${entry.player === 'you' ? 'you' : 'opponent'}`,
          onSelect: () => {},
        }))}
      onClose={onClose}
    />
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
