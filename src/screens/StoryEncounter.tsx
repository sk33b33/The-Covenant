import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GraceIcon, TalentIcon } from '@/art/icons'
import { Card } from '@/components/card/Card'
import { Button } from '@/components/ui'
import { requireCard } from '@/data/cards'
import { getEncounter } from '@/data/story/genesis'
import { randomSeed } from '@/game/rng'
import { useCollection } from '@/store/collection'
import { useEconomy } from '@/store/economy'
import { useDecks, validateDeck } from '@/store/decks'
import { useNav } from '@/store/nav'
import { useStory } from '@/store/story'
import { Battle } from './Battle'

type Stage = 'intro' | 'battle' | 'outro'

/**
 * A story encounter: dialogue, the match, then dialogue again.
 *
 * The reward is paid once, on the first clear, and the payment is decided by
 * `useStory.clear` returning whether the encounter was already cleared — so
 * replaying a favourite encounter is free of consequence rather than a way to
 * farm Talents.
 */
export function StoryEncounter({ encounterId }: { encounterId: string }) {
  const back = useNav((s) => s.back)
  const encounter = getEncounter(encounterId)

  const decks = useDecks((s) => s.decks)
  const activeDeckId = useDecks((s) => s.activeDeckId)
  const deck = decks.find((d) => d.id === activeDeckId) ?? decks[0]

  const noteAttempt = useStory((s) => s.noteAttempt)
  const clearEncounter = useStory((s) => s.clear)
  const alreadyCleared = useStory((s) => (encounter ? s.cleared.includes(encounter.id) : false))

  const addCards = useCollection((s) => s.add)
  const addTalents = useEconomy((s) => s.addTalents)
  const addGrace = useEconomy((s) => s.addGrace)

  const [stage, setStage] = useState<Stage>('intro')
  const [line, setLine] = useState(0)
  const [won, setWon] = useState(false)
  const [firstClear, setFirstClear] = useState(false)
  const [seed] = useState(() => randomSeed())

  const onFinish = useCallback(
    (didWin: boolean) => {
      if (!encounter) return
      setWon(didWin)
      noteAttempt(encounter.id)

      if (didWin) {
        // `clear` returns false when the encounter was already cleared, which
        // is what stops the reward being paid on every replay.
        const isFirst = clearEncounter(encounter.id)
        setFirstClear(isFirst)

        if (isFirst) {
          addCards([encounter.reward.cardId])
          addTalents(encounter.reward.talents)
          if (encounter.reward.grace) addGrace(encounter.reward.grace)
        }
      }

      setLine(0)
      setStage('outro')
    },
    [encounter, noteAttempt, clearEncounter, addCards, addTalents, addGrace],
  )

  if (!encounter) {
    return (
      <div className="h-full grid place-items-center px-8 text-center">
        <div>
          <p className="text-ink-muted text-sm">That encounter does not exist.</p>
          <Button className="mt-4" onClick={back}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  if (!deck || !validateDeck(deck).legal) {
    return (
      <div className="on-dark h-full grid place-items-center px-8 text-center bg-bg">
        <div>
          <p className="text-sm text-ink-muted">
            You need a legal deck before facing {encounter.opponent}.
          </p>
          <Button variant="gold" className="mt-4" onClick={back}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  if (stage === 'battle') {
    return (
      <Battle
        playerDeck={{ cards: deck.cards, energy: deck.energy }}
        opponentDeck={encounter.deck}
        difficulty={encounter.difficulty}
        seed={seed}
        {...(encounter.forceFirst ? { forceFirst: encounter.forceFirst } : {})}
        opponentName={encounter.opponent}
        themeType={encounter.theme}
        onFinish={onFinish}
        onExit={() => setStage('outro')}
      />
    )
  }

  const lines = stage === 'intro' ? encounter.intro : won ? encounter.victory : [encounter.defeat]
  const isLast = line >= lines.length - 1

  const advance = () => {
    if (!isLast) {
      setLine(line + 1)
      return
    }
    if (stage === 'intro') {
      setStage('battle')
      return
    }
    back()
  }

  return (
    <Dialogue
      title={encounter.title}
      opponent={encounter.opponent}
      verse={encounter.verse}
      theme={encounter.theme}
      lines={lines}
      index={line}
      onAdvance={advance}
      cta={
        stage === 'intro'
          ? isLast
            ? 'Begin'
            : 'Continue'
          : isLast
            ? won
              ? 'Claim'
              : 'Back to the map'
            : 'Continue'
      }
      reward={
        stage === 'outro' && won && firstClear
          ? encounter.reward
          : undefined
      }
      replayNote={stage === 'outro' && won && !firstClear && alreadyCleared}
    />
  )
}

/* -------------------------------------------------------------- dialogue */

function Dialogue({
  title,
  opponent,
  verse,
  theme,
  lines,
  index,
  onAdvance,
  cta,
  reward,
  replayNote,
}: {
  title: string
  opponent: string
  verse: string
  theme: string
  lines: string[]
  index: number
  onAdvance: () => void
  cta: string
  reward?: { cardId: string; talents: number; grace?: number }
  replayNote?: boolean
}) {
  return (
    <div
      className="on-dark fixed inset-0 flex flex-col"
      style={{
        background: `radial-gradient(130% 80% at 50% 18%, var(--energy-${theme}) -70%, #1a1409 42%, #0b0805 100%)`,
      }}
    >
      <div className="pt-safe px-6 pt-6 text-center">
        <p
          className="font-display text-[11px] tracking-[0.34em]"
          style={{ color: 'rgba(229,192,140,.55)' }}
        >
          {verse.toUpperCase()}
        </p>
        <h1
          className="font-display text-2xl mt-1.5"
          style={{
            background: 'var(--gold-leaf)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {title}
        </h1>
        <p className="text-xs mt-1" style={{ color: 'rgba(240,220,188,.55)' }}>
          {opponent}
        </p>
      </div>

      {/* Tapping anywhere advances — a dialogue box that needs a precise tap
          target is a dialogue box people stop reading. */}
      <button
        className="flex-1 flex flex-col items-center justify-center px-8 gap-6 min-h-0"
        onClick={onAdvance}
        aria-label="Continue"
      >
        <AnimatePresence mode="wait">
          {/* Body face, not Cinzel. Cinzel renders lowercase as small caps,
              which is right for a title and punishing across three lines of
              prose — this is the one place in the game with real reading to do. */}
          <motion.p
            key={index}
            className="font-body text-center"
            style={{
              fontSize: 18,
              lineHeight: 1.62,
              color: '#f0dcbc',
              maxWidth: '34ch',
              textWrap: 'balance',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
          >
            {lines[index]}
          </motion.p>
        </AnimatePresence>

        {reward && (
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 240, damping: 22 }}
          >
            <div className="w-[132px]">
              <Card card={requireCard(reward.cardId)} compact />
            </div>
            <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--gold-bright)' }}>
              <span className="flex items-center gap-1.5">
                <TalentIcon size={16} />+{reward.talents}
              </span>
              {reward.grace ? (
                <span className="flex items-center gap-1.5">
                  <GraceIcon size={16} />+{reward.grace}
                </span>
              ) : null}
            </div>
          </motion.div>
        )}

        {replayNote && (
          <p className="text-xs" style={{ color: 'rgba(240,220,188,.5)' }}>
            Already cleared — the reward was paid the first time.
          </p>
        )}

        {/* Progress through the lines, so the reader knows how much is left. */}
        <div className="flex gap-1.5">
          {lines.map((_, i) => (
            <span
              key={i}
              className="h-1 rounded-pill transition-all duration-300"
              style={{
                width: i === index ? 18 : 6,
                background: i <= index ? 'var(--gold-bright)' : 'rgba(229,192,140,.25)',
              }}
            />
          ))}
        </div>
      </button>

      <div className="px-6 pb-8 pb-safe">
        <Button variant="gold" block onClick={onAdvance}>
          {cta}
        </Button>
      </div>
    </div>
  )
}
