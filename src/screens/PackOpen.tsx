import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { CardBack } from '@/art/CardBack'
import { PackWrapper } from '@/art/PackWrapper'
import { RarityMark } from '@/art/RarityMark'
import { TalentIcon } from '@/art/icons'
import { PressableCard } from '@/components/card/PressableCard'
import { Button } from '@/components/ui'
import { getPack, getSet } from '@/data/sets'
import { duplicateValue, isGodPack, openPack } from '@/game/packs'
import { createRng, randomSeed } from '@/game/rng'
import { RARITY_ORDER, type Card as CardData } from '@/game/types'
import { useCollection } from '@/store/collection'
import { useEconomy } from '@/store/economy'
import { useNav } from '@/store/nav'
import { useProfile } from '@/store/profile'
import { cx } from '@/lib/cx'

type Phase = 'sealed' | 'revealing' | 'summary'

/**
 * Opening a pack.
 *
 * The sequence is the point: a sealed wrapper you tear, five face-down cards,
 * then one flip at a time so each card gets its own beat. Revealing all five at
 * once would take the same information and throw away the only moment in the
 * game where a card arrives.
 *
 * The pull is resolved once, up front, from a seeded RNG — the animation
 * reveals a decided result rather than deciding as it goes, so nothing can
 * desync if the player skips ahead.
 */
export function PackOpen({ packId, source }: { packId: string; source: 'free' | 'talents' }) {
  const back = useNav((s) => s.back)
  const pack = getPack(packId)
  const set = pack ? getSet(pack.set) : undefined

  const economy = useEconomy()
  const notePull = useEconomy((s) => s.notePull)
  const addTalents = useEconomy((s) => s.addTalents)
  const useFreeSlot = useEconomy((s) => s.useFreeSlot)
  const buyWithTalents = useEconomy((s) => s.buyWithTalents)
  const addCards = useCollection((s) => s.add)
  const ownedBefore = useCollection((s) => s.owned)
  const recordPackOpened = useProfile((s) => s.recordPackOpened)

  const [phase, setPhase] = useState<Phase>('sealed')
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false, false, false])
  const [pull, setPull] = useState<{ cards: CardData[]; newIds: string[]; talents: number } | null>(
    null,
  )

  const bestRarity = useMemo(() => {
    if (!pull) return null
    return pull.cards.reduce((best, c) =>
      RARITY_ORDER[c.rarity] > RARITY_ORDER[best.rarity] ? c : best,
    ).rarity
  }, [pull])

  const tear = useCallback(() => {
    if (!pack) return

    // Charged here, not on entry: opening the screen and backing out costs
    // nothing. Both stores refuse to go negative, so a double-fire of the drag
    // handler cannot double-charge or produce a free pack.
    const paid = source === 'free' ? useFreeSlot() : buyWithTalents()
    if (!paid) {
      back()
      return
    }

    const result = openPack(pack.id, createRng(randomSeed()), economy.sincePity)

    // Duplicates pay out Talents. Counted against the collection as it was
    // before this pack, so two copies of the same new card in one pack score
    // correctly: the first is new, the second is a duplicate.
    const seen = { ...ownedBefore }
    let talents = 0
    const newIds: string[] = []

    for (const card of result.cards) {
      if (seen[card.id]) {
        talents += duplicateValue(card.rarity)
      } else {
        newIds.push(card.id)
      }
      seen[card.id] = (seen[card.id] ?? 0) + 1
    }

    addCards(result.cards.map((c) => c.id))
    notePull(result.hitRareOrBetter)
    recordPackOpened()
    if (talents > 0) addTalents(talents)

    setPull({ cards: result.cards, newIds, talents })
    setPhase('revealing')
  }, [
    pack,
    source,
    useFreeSlot,
    buyWithTalents,
    back,
    economy.sincePity,
    ownedBefore,
    addCards,
    notePull,
    recordPackOpened,
    addTalents,
  ])

  const flip = (index: number) => {
    setFlipped((prev) => {
      if (prev[index]) return prev
      const next = [...prev]
      next[index] = true
      return next
    })
  }

  if (!pack || !set) {
    return (
      <div className="h-full grid place-items-center px-8 text-center">
        <div>
          <p className="text-ink-muted">That pack does not exist.</p>
          <Button className="mt-4" onClick={back}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="on-dark fixed inset-0 z-40 flex flex-col"
      style={{
        background:
          'radial-gradient(120% 80% at 50% 30%, #2a2112 0%, #120d07 55%, #0a0704 100%)',
      }}
    >
      <AnimatePresence mode="wait">
        {phase === 'sealed' && (
          <Sealed key="sealed" packId={pack.id} onTear={tear} onBack={back} />
        )}

        {phase === 'revealing' && pull && (
          <Revealing
            key="revealing"
            cards={pull.cards}
            flipped={flipped}
            onFlip={flip}
            onDone={() => setPhase('summary')}
            god={isGodPack(pull.cards)}
          />
        )}

        {phase === 'summary' && pull && bestRarity && (
          <Summary
            key="summary"
            cards={pull.cards}
            newIds={pull.newIds}
            talents={pull.talents}
            onDone={back}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------------------------------------------- sealed */

function Sealed({
  packId,
  onTear,
  onBack,
}: {
  packId: string
  onTear: () => void
  onBack: () => void
}) {
  const pack = getPack(packId)!
  const [dragged, setDragged] = useState(0)

  return (
    <motion.div
      className="flex-1 flex flex-col items-center justify-center px-8 gap-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="w-full max-w-[240px] cursor-grab active:cursor-grabbing"
        style={{ filter: 'drop-shadow(0 22px 40px rgba(0,0,0,.6))' }}
        drag="y"
        dragConstraints={{ top: -110, bottom: 0 }}
        dragElastic={0.25}
        onDrag={(_, info) => setDragged(Math.max(0, -info.offset.y))}
        onDragEnd={(_, info) => {
          if (-info.offset.y > 70) onTear()
          else setDragged(0)
        }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <PackWrapper pack={pack} />
      </motion.div>

      <div className="text-center" style={{ color: '#f0dcbc' }}>
        <p className="font-display text-md tracking-wide">
          {dragged > 40 ? 'Let go' : 'Swipe up to open'}
        </p>
        <p className="text-xs opacity-60 mt-1">{pack.tagline}</p>
      </div>

      <button onClick={onBack} className="text-sm" style={{ color: 'rgba(240,220,188,.55)' }}>
        Not now
      </button>
    </motion.div>
  )
}

/* -------------------------------------------------------------- revealing */

/** How far a swipe has to travel before it commits to something — reveal
 *  the card, or send it away — rather than springing back to center. */
const SWIPE_THRESHOLD = 90

/** How far off-screen a dismissed card flies. Comfortably past both edges
 *  of even a wide phone, so it's fully gone rather than clipped mid-flight. */
const EXIT_X = 560

function Revealing({
  cards,
  flipped,
  onFlip,
  onDone,
  god,
}: {
  cards: CardData[]
  flipped: boolean[]
  onFlip: (i: number) => void
  onDone: () => void
  god: boolean
}) {
  const [focus, setFocus] = useState(0)
  // Which way the card in hand should fly off, once it's dismissed rather
  // than snapped back — read from the swipe that dismissed it, so the exit
  // continues in the same direction the thumb was already moving instead of
  // picking a side for you.
  const [exitX, setExitX] = useState(EXIT_X)

  const revealed = !!flipped[focus]

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) return

    // First swipe on a face-down card reveals it in place — the card stays
    // put and springs back to centre (framer's own constraint spring, since
    // nothing here overrides it) while `FlipCard` turns it face-up. Only a
    // swipe on an *already revealed* card sends it away.
    if (!revealed) {
      onFlip(focus)
      return
    }

    setExitX(info.offset.x > 0 ? EXIT_X : -EXIT_X)
    if (focus < cards.length - 1) setFocus((f) => f + 1)
    else onDone()
  }

  return (
    <motion.div
      className="flex-1 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {god && (
        <motion.p
          className="text-center font-display tracking-[0.3em] text-sm pt-safe mt-4"
          style={{ color: '#f2c85a' }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: [0.6, 1, 0.6], y: 0 }}
          transition={{ opacity: { duration: 2.2, repeat: Infinity }, y: { duration: 0.4 } }}
        >
          SACRED PULL
        </motion.p>
      )}

      <div className="relative flex-1 flex items-center justify-center px-8 min-h-0">
        <div className="relative w-full max-w-[290px]" style={{ perspective: '1400px' }}>
          {/* `popLayout` lets the dismissed card fly out of flow immediately
              rather than leaving a gap the next one has to animate into —
              the incoming card is just already there, centred, the instant
              the outgoing one starts leaving. */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={focus}
              drag="x"
              // A zero-width box: there is nowhere the card is allowed to
              // rest *except* centre, so any release that isn't a dismissal
              // springs straight back there on its own, for free.
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={onDragEnd}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ x: exitX, opacity: 0, rotate: exitX > 0 ? 8 : -8 }}
              transition={{ type: 'spring', stiffness: 480, damping: 34 }}
              // Tapping still works too — a swipe is the primary gesture,
              // but a plain tap costs nothing to also honour, the same way
              // a hold is additive over a tap everywhere else in this game.
              onClick={() => (revealed ? onDragEnd(null, { offset: { x: EXIT_X } } as PanInfo) : onFlip(focus))}
              className="cursor-grab active:cursor-grabbing"
              aria-label={revealed ? 'Swipe to continue' : 'Swipe to reveal'}
              role="button"
            >
              <FlipCard card={cards[focus]!} revealed={revealed} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <p
        className="text-center text-xs pb-4"
        style={{ color: 'rgba(240,220,188,.5)' }}
      >
        {revealed ? 'Swipe to continue' : 'Swipe to reveal'}
      </p>

      {/* Position row, so the player always knows how many are left. */}
      <div className="flex justify-center gap-2 pb-8 pb-safe">
        {cards.map((card, i) => (
          <button
            key={i}
            onClick={() => setFocus(i)}
            aria-label={`Card ${i + 1} of ${cards.length}`}
            className={cx(
              'rounded-sm transition-all duration-300',
              i === focus ? 'w-8 h-2.5' : 'w-2.5 h-2.5',
            )}
            style={{
              background: flipped[i]
                ? RARITY_ORDER[card.rarity] >= RARITY_ORDER.rare
                  ? 'var(--gold-bright)'
                  : 'rgba(240,220,188,.5)'
                : 'rgba(240,220,188,.16)',
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}

/** A soft light traced along the card's own edge, win or not — separate
 *  from the flare below, which is a brief, bright burst reserved for a
 *  rare-or-better pull. This one is constant and quiet, and it lives inside
 *  the same box the card sits in rather than the screen behind it, so it
 *  rides along with every drag, flip and exit instead of staying put while
 *  the card moves out from under it. Matches the card's own corner radius
 *  (the 4.5%/3.22% figure `Card`'s own frame uses) so the glow reads as
 *  coming from the card's edge, not from a rectangle loosely behind it. */
function HeavenlyGlow() {
  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        borderRadius: '4.5% / 3.22%',
        boxShadow:
          '0 0 22px 2px rgba(255,246,222,.34), 0 16px 40px 6px rgba(255,224,160,.3)',
      }}
      animate={{ opacity: [0.7, 1, 0.7] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

function FlipCard({ card, revealed }: { card: CardData; revealed: boolean }) {
  const chase = RARITY_ORDER[card.rarity] >= RARITY_ORDER.rare

  return (
    <div style={{ position: 'relative', transformStyle: 'preserve-3d' }}>
      <HeavenlyGlow />

      <motion.div
        animate={{ rotateY: revealed ? 0 : 180 }}
        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: 'preserve-3d', position: 'relative' }}
      >
        {/* Face. Inert until it is turned over: the face stays in the DOM
            behind the back, so without this a hold — or a Tab from the
            keyboard — would open the card and spoil its own reveal. */}
        <div style={{ backfaceVisibility: 'hidden' }}>
          <PressableCard card={card} standalone={revealed} noPeek={!revealed} />
        </div>

        {/* Back, pre-rotated so it faces the viewer while the card is unflipped */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <CardBack />
        </div>
      </motion.div>

      {/* Flare behind a good pull, timed to land as the flip finishes. */}
      <AnimatePresence>
        {revealed && chase && (
          <motion.div
            className="absolute inset-0 -z-10 pointer-events-none"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 0.95, 0.35], scale: 1.7 }}
            transition={{ duration: 1.1, times: [0, 0.35, 1], ease: 'easeOut' }}
            style={{
              background:
                'radial-gradient(circle, rgba(255,228,160,.85) 0%, rgba(255,196,92,.32) 42%, transparent 68%)',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* --------------------------------------------------------------- summary */

function Summary({
  cards,
  newIds,
  talents,
  onDone,
}: {
  cards: CardData[]
  newIds: string[]
  talents: number
  onDone: () => void
}) {
  return (
    <motion.div
      className="flex-1 flex flex-col pt-safe"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Title travels with the grid so the block stays optically centred
          rather than leaving a gap under a pinned heading. */}
      <div className="scroll-y flex-1 px-5 flex flex-col justify-center">
        <h2
          className="text-center font-display text-lg tracking-wide mb-4"
          style={{ color: '#f0dcbc' }}
        >
          {newIds.length > 0 ? `${newIds.length} new` : 'No new cards'}
        </h2>

        <div className="grid grid-cols-3 gap-2.5">
          {cards.map((card, i) => (
            <motion.div
              key={`${card.id}-${i}`}
              className="relative"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.32 }}
            >
              <PressableCard card={card} compact standalone />

              {/* Both markers sit along the foot. Anchoring "NEW" to the top
                  left covered the card's own name, which is the one thing the
                  summary exists to show. */}
              <span className="absolute inset-x-1 bottom-1 flex items-center justify-between">
                {newIds.includes(card.id) ? (
                  <span
                    className="rounded-pill px-1.5 py-0.5 text-[9px] font-bold leading-none"
                    style={{ background: 'var(--negative)', color: '#fff' }}
                  >
                    NEW
                  </span>
                ) : (
                  <span />
                )}
                <RarityMark rarity={card.rarity} size={9} />
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="px-6 pb-8 pb-safe pt-4 space-y-3">
        {talents > 0 && (
          <p
            className="flex items-center justify-center gap-2 text-sm"
            style={{ color: 'var(--gold-bright)' }}
          >
            <TalentIcon size={16} />+{talents} Talents from duplicates
          </p>
        )}
        <Button variant="gold" block onClick={onDone}>
          Done
        </Button>
      </div>
    </motion.div>
  )
}
