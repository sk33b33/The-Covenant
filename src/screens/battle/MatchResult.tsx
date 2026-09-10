import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/card/Card'
import { PressableCard } from '@/components/card/PressableCard'
import { EnergyOrb } from '@/art/EnergyOrb'
import { CloseIcon } from '@/art/icons'
import { requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { miracleFor } from '@/game/miracles'
import { buildBreakdown, pickMvp, type PlayerStats } from '@/engine/summary'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cx } from '@/lib/cx'
import type { LogEntry, MatchEvent, MatchState, PlayerId } from '@/engine/types'
import type { EnergyType } from '@/game/types'

/**
 * What a finished match hands off to, in place of the bare "Won 3-0" text
 * this used to be.
 *
 * Two screens, one component, switched on local state rather than two
 * separate mounts: the reveal below already computes the match's MVP and the
 * breakdown wants the same `buildBreakdown` call, so keeping them siblings
 * under one parent means that work happens once regardless of which screen
 * is showing, rather than the breakdown redoing what the reveal already knew.
 */
export function MatchResult({ state, onExit }: { state: MatchState; onExit: () => void }) {
  const [stage, setStage] = useState<'reveal' | 'breakdown'>('reveal')
  const mvp = useMemo(() => pickMvp(state), [state])
  const breakdown = useMemo(() => buildBreakdown(state), [state])

  if (stage === 'reveal' && mvp) {
    return <Reveal state={state} mvp={mvp} onAdvance={() => setStage('breakdown')} />
  }

  return <Breakdown state={state} breakdown={breakdown} onExit={onExit} />
}

/* ------------------------------------------------------------------ reveal */

const WINDUP_S = 0.55
const HOLD_S = 1.5
const EXIT_S = 0.45
/** How long after the card has cleared the screen the banner takes to slam
 *  in — the two must not overlap, or the letters read as fighting the card
 *  for the same space it just occupied. */
const BANNER_DELAY_S = WINDUP_S + HOLD_S + EXIT_S + 0.1

function Reveal({
  state,
  mvp,
  onAdvance,
}: {
  state: MatchState
  mvp: { cardId: string; player: PlayerId }
  onAdvance: () => void
}) {
  const reduceMotion = useReducedMotion()
  const won = state.winner === 'you'
  const card = requireCard(mvp.cardId)
  const isYours = mvp.player === 'you'

  // Any tap skips straight to the breakdown, whatever phase this is in — a
  // flourish nobody asked to watch twice should never be the thing standing
  // between a player and the match they actually want to read about.
  const [showBanner, setShowBanner] = useState(reduceMotion)

  useEffect(() => {
    if (reduceMotion) return
    const timer = setTimeout(() => setShowBanner(true), BANNER_DELAY_S * 1000)
    return () => clearTimeout(timer)
  }, [reduceMotion])

  const flightTransition = reduceMotion
    ? { duration: 0.01 }
    : {
        duration: WINDUP_S + HOLD_S + EXIT_S,
        times: [0, WINDUP_S / (WINDUP_S + HOLD_S + EXIT_S), (WINDUP_S + HOLD_S) / (WINDUP_S + HOLD_S + EXIT_S), 1],
        ease: ['circOut', 'linear', 'easeIn'],
      }

  return (
    <button
      type="button"
      className="fixed inset-0 z-[80] overflow-hidden"
      style={{ background: '#08060380' }}
      onClick={onAdvance}
      aria-label="Skip to match breakdown"
    >
      <motion.div
        className="absolute inset-0"
        initial={{ background: 'rgba(8,6,3,0)' }}
        animate={{ background: 'rgba(8,6,3,0.94)' }}
        transition={{ duration: 0.4 }}
      />

      {/* The card itself: flies in oversized from off-screen, holds centred
          through a slow beat with its own light sweep, then clears out to
          one side before the banner takes the stage. `x`/`scale`/`rotate`
          share one timeline so the whole flight reads as one gesture rather
          than three separate animations that happen to run together. */}
      <motion.div
        className="absolute left-1/2 top-[38%] w-[62vw] max-w-[280px]"
        style={{ aspectRatio: '63 / 88', marginLeft: '-31vw', marginTop: '-44vw' }}
        initial={{ x: reduceMotion ? 0 : '120vw', scale: reduceMotion ? 1.3 : 0.7, rotate: 8, opacity: 1 }}
        animate={{
          x: reduceMotion ? 0 : [0, 0, '-130vw'],
          scale: reduceMotion ? 1.3 : [1.18, 1.18, 0.8],
          rotate: reduceMotion ? 0 : [0, 0, -10],
        }}
        transition={flightTransition}
      >
        {/* The slow-mo beat's own tell: a light band crossing the face on a
            slower, independent clock, so the card reads as being turned
            toward the light rather than merely sitting still on screen. */}
        <motion.div
          className="relative w-full h-full"
          animate={reduceMotion ? undefined : { rotateY: [0, 10, -6, 0] }}
          transition={{ duration: HOLD_S, delay: WINDUP_S, ease: 'easeInOut' }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <Card card={card} style={{ boxShadow: '0 30px 70px rgba(0,0,0,.65)' }} />
        </motion.div>
      </motion.div>

      {showBanner && (
        <motion.div
          className="absolute inset-0 grid place-items-center px-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <div className="text-center">
            <motion.h1
              className="font-display font-bold tracking-wide"
              style={{
                fontSize: 46,
                background: won ? 'var(--gold-leaf)' : 'linear-gradient(160deg,#9c8d75,#6b5d47)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 20 }}
            >
              {won ? 'VICTORY' : 'DEFEAT'}
            </motion.h1>

            <p className="text-sm mt-1" style={{ color: 'rgba(240,220,188,.7)' }}>
              {isYours ? `${card.name} carried the match.` : `${card.name} carried it against you.`}
            </p>

            <div className="flex items-center justify-center gap-6 mt-6">
              <Score label="You" value={state.players.you.points} highlight={won} />
              <Score label="Opponent" value={state.players.foe.points} highlight={!won} />
            </div>

            <p className="text-xs mt-8 animate-pulse" style={{ color: 'rgba(240,220,188,.45)' }}>
              Tap anywhere to continue
            </p>
          </div>
        </motion.div>
      )}
    </button>
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

/* --------------------------------------------------------------- breakdown */

const REASON_LABEL: Record<NonNullable<MatchState['endReason']>, string> = {
  points: `${RULES.POINTS_TO_WIN} points taken`,
  deckout: 'A deck ran out',
  'no-figures': 'No Figures left to send out',
  concede: 'Conceded',
  timeout: 'Time ran out',
}

function Breakdown({
  state,
  breakdown,
  onExit,
}: {
  state: MatchState
  breakdown: ReturnType<typeof buildBreakdown>
  onExit: () => void
}) {
  const won = state.winner === 'you'
  const reason = state.endReason ? REASON_LABEL[state.endReason] : ''

  // Grouped once, in the log's own order, so each turn's own entries render
  // together under one heading rather than the whole match as a flat list.
  const turns = useMemo(() => {
    const byTurn = new Map<number, LogEntry[]>()
    for (const entry of breakdown.timeline) {
      const list = byTurn.get(entry.turn) ?? []
      list.push(entry)
      byTurn.set(entry.turn, list)
    }
    return [...byTurn.entries()]
  }, [breakdown.timeline])

  return (
    <div className="fixed inset-0 z-[80] on-dark" style={{ background: 'var(--bg-sunk)', color: 'var(--ink)' }}>
      <div className="scroll-y h-full">
        <div className="mx-auto max-w-app px-4 pt-safe pb-safe">
          <div className="relative pt-4 pb-2 text-center">
            <h1
              className="font-display font-bold tracking-wide"
              style={{
                fontSize: 30,
                background: won ? 'var(--gold-leaf)' : 'linear-gradient(160deg,#9c8d75,#6b5d47)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {won ? 'Victory' : 'Defeat'}
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
              {reason}
            </p>
            <div className="flex items-center justify-center gap-8 mt-3">
              <Score label="You" value={state.players.you.points} highlight={won} />
              <Score label="Opponent" value={state.players.foe.points} highlight={!won} />
            </div>
          </div>

          <Section title="Stats">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="You" stats={breakdown.stats.you} />
              <StatCard label="Opponent" stats={breakdown.stats.foe} />
            </div>
          </Section>

          <Section title="Cards used — You">
            <CardStrip cardIds={breakdown.cardsUsed.you} />
          </Section>

          <Section title="Cards used — Opponent">
            <CardStrip cardIds={breakdown.cardsUsed.foe} />
          </Section>

          <Section title="Play by play">
            <div className="space-y-4">
              {turns.map(([turn, entries]) => (
                <div key={turn}>
                  <p
                    className="text-[11px] uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    Turn {turn}
                  </p>
                  <div className="space-y-1.5">
                    {entries.map((entry, i) => (
                      <TimelineRow key={i} entry={entry} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Fixed rather than scrolling away with the header — "top right
          corner of that screen" reads as a permanent fixture, not a piece of
          content a long match's play-by-play could scroll out of reach.
          `top-safe` is a padding-only utility (see global.css) — it doesn't
          exist as a position value, so a fixed element asking for it here
          gets no `top` at all and falls back to its static-flow position,
          which for the last child after a very tall scrolling sibling can
          land well below the actual viewport. The inset needs setting
          directly, the same `env()` this file already uses elsewhere. */}
      <button
        onClick={onExit}
        className="fixed right-4 w-9 h-9 rounded-pill grid place-items-center z-10"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          background: 'var(--surface-raised)',
          boxShadow: 'var(--shadow-raised-sm)',
        }}
        aria-label="Return to Battle"
      >
        <CloseIcon size={16} className="text-ink-muted" />
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h2 className="font-display text-sm tracking-wide mb-2" style={{ color: 'var(--gold-bright)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

const ENERGY_TYPES_ORDER: EnergyType[] = ['light', 'fire', 'water', 'earth', 'spirit', 'shadow']

function StatCard({ label, stats }: { label: string; stats: PlayerStats }) {
  const attached = ENERGY_TYPES_ORDER.filter((t) => stats.energyAttached[t])

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface)' }}>
      <p className="text-xs font-display mb-2" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </p>
      <dl className="space-y-1 text-xs">
        <Stat label="Damage dealt" value={stats.damageDealt} />
        <Stat label="Damage taken" value={stats.damageTaken} />
        <Stat label="Knockouts" value={stats.knockouts} />
        <Stat label="Cards played" value={stats.cardsPlayed} />
      </dl>
      {attached.length > 0 && (
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--bg-sunk)' }}>
          {attached.map((type) => (
            <span key={type} className="flex items-center gap-0.5">
              <EnergyOrb type={type} size={13} />
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                {stats.energyAttached[type]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt style={{ color: 'var(--ink-muted)' }}>{label}</dt>
      <dd className="font-numeric tabular-nums">{value}</dd>
    </div>
  )
}

function CardStrip({ cardIds }: { cardIds: string[] }) {
  if (cardIds.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Nothing reached the board.
      </p>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {cardIds.map((cardId) => (
        <div key={cardId} className="w-14 shrink-0">
          <PressableCard card={requireCard(cardId)} compact noHolo />
        </div>
      ))}
    </div>
  )
}

/** One row of the play-by-play. Everything here reads off the entry's own
 *  structured event; the prose in `entry.text` is never shown here — it was
 *  written for a hidden log no screen ever displayed, not for a layout with
 *  its own headline, icon and detail slots. */
function TimelineRow({ entry }: { entry: LogEntry }) {
  const event = entry.event as MatchEvent
  const card = requireCard(event.cardId)
  const mine = entry.player === 'you'

  const headline = event.label ?? card.name
  const detail = timelineDetail(event)

  return (
    <div
      className={cx('flex items-center gap-2 rounded-md px-2 py-1.5', mine ? '' : 'flex-row-reverse text-right')}
      style={{ background: 'var(--surface)' }}
    >
      <div className="w-8 shrink-0">
        <PressableCard card={card} compact noHolo />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{headline}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--ink-muted)' }}>
          {detail}
        </p>
      </div>
      {event.kind === 'attack' && !event.missed && (
        <span className="font-numeric text-sm shrink-0" style={{ color: 'var(--gold-bright)' }}>
          {event.damage}
        </span>
      )}
      {event.kind === 'attach' && event.energyType && <EnergyOrb type={event.energyType} size={16} />}
      {event.kind === 'knockout' && (
        <span
          className="text-[10px] font-display tracking-wide px-1.5 py-0.5 rounded-pill shrink-0"
          style={{ background: 'rgba(214,68,58,.18)', color: 'rgb(232,84,72)' }}
        >
          KO
        </span>
      )}
    </div>
  )
}

/** The one line under a timeline row's headline — what actually happened,
 *  distinct from the headline naming who or what it happened to. */
function timelineDetail(event: MatchEvent): string {
  switch (event.kind) {
    case 'play':
      return 'Takes the field.'
    case 'ascend':
      return event.otherCardId ? `Ascends from ${requireCard(event.otherCardId).name}.` : 'Ascends.'
    case 'attach':
      return 'Energy attached.'
    case 'retreat':
      return event.otherCardId ? `${requireCard(event.otherCardId).name} steps back.` : 'Steps up.'
    case 'covenant':
      return 'Covenant played.'
    case 'relic':
      return 'Relic played.'
    case 'miracle': {
      const miracle = miracleFor(event.cardId)
      return miracle?.text ?? 'A miracle is called.'
    }
    case 'attack':
      if (event.missed) return 'The attack misses.'
      return event.otherCardId
        ? `Hits ${requireCard(event.otherCardId).name}${event.weakness ? ' — a weakness' : ''}.`
        : 'Finds nothing to strike.'
    case 'knockout':
      return event.points ? `${event.points} point${event.points > 1 ? 's' : ''} earned.` : 'No points taken.'
  }
}
