import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CardBack } from '@/art/CardBack'
import { PackWrapper } from '@/art/PackWrapper'
import { RarityMark } from '@/art/RarityMark'
import { TalentIcon } from '@/art/icons'
import { Card } from '@/components/card/Card'
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

  const flipAll = () => setFlipped([true, true, true, true, true])

  const allFlipped = flipped.every(Boolean)

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
          <Sealed key="sealed" packId={pack.id} setCode={set.code} onTear={tear} onBack={back} />
        )}

        {phase === 'revealing' && pull && (
          <Revealing
            key="revealing"
            cards={pull.cards}
            flipped={flipped}
            onFlip={flip}
            onFlipAll={flipAll}
            allFlipped={allFlipped}
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
  setCode,
  onTear,
  onBack,
}: {
  packId: string
  setCode: string
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
        <PackWrapper pack={pack} setCode={setCode} />
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

function Revealing({
  cards,
  flipped,
  onFlip,
  onFlipAll,
  allFlipped,
  onDone,
  god,
}: {
  cards: CardData[]
  flipped: boolean[]
  onFlip: (i: number) => void
  onFlipAll: () => void
  allFlipped: boolean
  onDone: () => void
  god: boolean
}) {
  const [focus, setFocus] = useState(0)

  const advance = () => {
    if (!flipped[focus]) {
      onFlip(focus)
      return
    }
    if (focus < cards.length - 1) setFocus(focus + 1)
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

      <button
        className="flex-1 flex items-center justify-center px-8 min-h-0"
        onClick={advance}
        aria-label={flipped[focus] ? 'Next card' : 'Reveal card'}
      >
        <div className="w-full max-w-[290px]" style={{ perspective: '1400px' }}>
          <FlipCard card={cards[focus]!} revealed={!!flipped[focus]} />
        </div>
      </button>

      {/* Position row, so the player always knows how many are left. */}
      <div className="flex justify-center gap-2 pb-4">
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

      <div className="flex gap-3 px-6 pb-8 pb-safe">
        {!allFlipped && (
          <Button variant="sunk" block onClick={onFlipAll}>
            Reveal all
          </Button>
        )}
        <Button variant="gold" block onClick={allFlipped ? onDone : advance}>
          {allFlipped ? 'Done' : flipped[focus] ? 'Next' : 'Reveal'}
        </Button>
      </div>
    </motion.div>
  )
}

function FlipCard({ card, revealed }: { card: CardData; revealed: boolean }) {
  const chase = RARITY_ORDER[card.rarity] >= RARITY_ORDER.rare

  return (
    <div style={{ position: 'relative', transformStyle: 'preserve-3d' }}>
      <motion.div
        animate={{ rotateY: revealed ? 0 : 180 }}
        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: 'preserve-3d', position: 'relative' }}
      >
        {/* Face */}
        <div style={{ backfaceVisibility: 'hidden' }}>
          <Card card={card} />
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
              <Card card={card} compact />

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
