import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
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
 * The sequence is the point: a sealed wrapper you tear, then five cards
 * already face up, stacked like a hand of cards fanned toward you. Swiping
 * (either direction — the swipe is the "next" gesture, not a left/right
 * choice) peels the front card away and promotes the next one forward, so
 * each card still gets its own moment in focus even though nothing is
 * hidden. A "Reveal All" skip is there for whoever already knows what they
 * want to see: the collection grid.
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

/** How many cards behind the front one show as a peeking stack. Anything
 *  further back sits at the same resting spot as the third card, invisible,
 *  so it's already in place — never flying in from off-screen — the moment
 *  it's promoted into view. */
const STACK_DEPTH = 2

/** Every card's target transform, purely a function of its distance from
 *  the front (`offset = index - focus`). Nothing here is per-card state —
 *  moving `focus`, whether by a swipe or a tap on the position row, just
 *  gives every card a new offset and lets its own `animate` prop ease
 *  there, which is what makes "jump to card 1" from card 4 look like the
 *  stack sliding back into place rather than a hard cut. */
function stackTarget(offset: number, direction: 1 | -1) {
  if (offset < 0) {
    // Already passed. Sent off in whichever direction it was swiped, so a
    // dismissal keeps travelling the way the thumb was already moving
    // rather than picking a side for it. Where it lands doesn't matter
    // beyond "invisible" — nothing here is ever seen again unless the
    // position row jumps back to it, at which point it eases back in from
    // this same spot.
    return { x: direction * EXIT_X, y: -6, scale: 0.9, opacity: 0, rotate: direction * 8 }
  }
  const depth = Math.min(offset, STACK_DEPTH + 1)
  return {
    x: 0,
    y: depth * -24,
    scale: 1 - depth * 0.08,
    opacity: depth > STACK_DEPTH ? 0 : 1 - depth * 0.3,
    rotate: 0,
  }
}

/** A departing card (`offset < 0`) gets a fast, decisive spring of its own
 *  rather than sharing the softer one the resting stack uses. Two reasons:
 *  a stiff, quick spring resolves any lingering pull from the drag gesture
 *  it just came out of (`dragConstraints` below still wants to spring the
 *  same element back to centre the instant it's released, and a slow exit
 *  spring left that fight visible for a beat); and giving the promoted
 *  cards a brief head start delay lets the departure read as its own
 *  finished beat before the stack visibly steps forward, rather than both
 *  happening on top of each other and reading as one blurry scramble. */
function transitionFor(offset: number) {
  if (offset < 0) return { type: 'spring', stiffness: 700, damping: 42 } as const
  return { type: 'spring', stiffness: 420, damping: 36, delay: 0.05 } as const
}

function Revealing({
  cards,
  onDone,
  god,
}: {
  cards: CardData[]
  onDone: () => void
  god: boolean
}) {
  const [focus, setFocus] = useState(0)
  // Mirrors `focus`, but updates the instant `advance` runs rather than on
  // the next render — see `advance`'s own comment for why that matters.
  const focusRef = useRef(0)
  focusRef.current = focus
  // Which way the last-dismissed card flew — `stackTarget` above reads this
  // for every card currently behind the front (see its own comment).
  const [direction, setDirection] = useState<1 | -1>(1)

  const front = cards[focus]!
  const chase = RARITY_ORDER[front.rarity] >= RARITY_ORDER.rare

  const advance = (dir: 1 | -1) => {
    setDirection(dir)
    // A real device can fire `onDragEnd` twice for what reads as one swipe.
    // Reading and writing `focusRef` synchronously — rather than checking
    // the `focus` this closure captured, or a `setFocus` updater — means
    // the second call sees exactly what the first one just did instead of
    // a stale value, so it can only ever call `onDone` again (harmless)
    // rather than overshoot the array and crash the screen to blank.
    // (`onDone` specifically has to run here, in a plain event handler, and
    // not inside a `setFocus` updater — updaters run during React's render
    // phase, and calling a *different* component's setter from there is a
    // silent way to break its own next update, not just a lint warning.)
    if (focusRef.current >= cards.length - 1) {
      onDone()
      return
    }
    focusRef.current += 1
    setFocus(focusRef.current)
  }

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) return
    // Either direction just means "next" — this is a stack you work through,
    // not a left/right choice — but which way it was swiped still decides
    // which way the dismissed card flies off.
    advance(info.offset.x > 0 ? 1 : -1)
  }

  return (
    <motion.div
      className="flex-1 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-start justify-between px-5 pt-safe mt-2">
        <div className="flex-1">
          {god && (
            <motion.p
              className="font-display tracking-[0.3em] text-sm"
              style={{ color: '#f2c85a' }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: [0.6, 1, 0.6], y: 0 }}
              transition={{ opacity: { duration: 2.2, repeat: Infinity }, y: { duration: 0.4 } }}
            >
              SACRED PULL
            </motion.p>
          )}
        </div>
        <button
          onClick={onDone}
          className="text-xs font-medium tracking-wide shrink-0"
          style={{ color: 'rgba(240,220,188,.55)' }}
        >
          Reveal All
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-8 min-h-0">
        <div className="relative w-full max-w-[290px]">
          <HeavenlyGlow key={`glow-${focus}`} />

          {cards.map((card, i) => {
            const offset = i - focus
            const isFront = offset === 0
            return (
              <motion.div
                key={card.id + i}
                drag={isFront ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                dragTransition={{ bounceStiffness: 2000, bounceDamping: 100 }}
                onDragEnd={isFront ? onDragEnd : undefined}
                initial={false}
                animate={stackTarget(offset, direction)}
                transition={transitionFor(offset)}
                style={{
                  position: offset === 0 ? 'relative' : 'absolute',
                  inset: offset === 0 ? undefined : 0,
                  // The just-departed card (offset -1) sits above the new
                  // front one so it visibly flies away over the top of the
                  // stack instead of vanishing behind it the instant focus
                  // moves on. Anything further back than that is invisible
                  // regardless, so its stacking order doesn't matter.
                  zIndex: offset === -1 ? cards.length + 1 : offset >= 0 ? cards.length - offset : 0,
                  pointerEvents: isFront ? 'auto' : 'none',
                }}
                className={isFront ? 'cursor-grab active:cursor-grabbing' : undefined}
              >
                <PressableCard card={card} standalone={isFront} noPeek={!isFront} />
              </motion.div>
            )
          })}

          {/* Flare behind a good pull. Keyed to `focus` so it replays fresh
              every time a rare-or-better card becomes the front one, rather
              than only once on that card's original mount. */}
          <AnimatePresence>
            {chase && (
              <motion.div
                key={`flare-${focus}`}
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
      </div>

      <p className="text-center text-xs pb-4" style={{ color: 'rgba(240,220,188,.5)' }}>
        Swipe for the next card
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
              background:
                i <= focus
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

/** A soft light traced along the front card's edge — constant and quiet,
 *  unlike the brief bright flare above reserved for a rare-or-better pull.
 *  Keyed by the caller to `focus` so it sits centred on whichever card is
 *  currently in front rather than tracking a specific card as it moves
 *  through the stack. Matches the card's own corner radius (the 4.5%/3.22%
 *  figure `Card`'s own frame uses) so the glow reads as coming from the
 *  card's edge, not from a rectangle loosely behind it. */
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
