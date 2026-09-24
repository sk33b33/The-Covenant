import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RarityMark } from '@/art/RarityMark'
import { cx } from '@/lib/cx'
import { ActionList, type SheetOption } from '@/screens/battle/ActionSheet'
import { Card } from './Card'
import {
  METAL_LABEL,
  RARITY_LABEL,
  RARITY_METAL,
  isFigure,
  type Card as CardData,
} from '@/game/types'
import { usePeek } from '@/store/peek'

/**
 * The card, held up to the light.
 *
 * Opened by holding any card anywhere in the game — and by a single tap on
 * your Active Figure mid-match, which also carries its attacks underneath, so
 * one tap still both inspects and acts.
 *
 * The card renders exactly as it does everywhere else in the game — the
 * same static holo sheen and metal rim, at their resting angle. The
 * interactive tilt-to-the-touch this viewer once drove is on hold for now
 * (see git history for the pointer-tracking version this replaced) rather
 * than removed for good.
 *
 * The overlay never scrolls. Everything is sized to fit the viewport instead,
 * because a screen that shifts under a gesture is worse than a card rendered
 * slightly smaller.
 *
 * Mounted once, in App. Everything else opens it through the peek store.
 */

/** How far sideways a release has to land from where the finger went down
 *  before it reads as a swipe to the next or previous card rather than a
 *  tilt that happened to end near an edge. */
const SWIPE_DISTANCE = 60

/** The swipe's own enter/exit, keyed off `custom` (the direction just
 *  stepped) rather than a fixed side: paging forward brings the next card
 *  in from the right and sends the outgoing one out to the left, and paging
 *  back is the mirror of that — the same "content moves the way you dragged
 *  it" a photo gallery or a page-turn reads as. A named `variants` object
 *  rather than a function handed straight to `initial`/`animate`/`exit`:
 *  framer only resolves `custom` through a variant lookup, not through a
 *  bare function passed to those props directly. */
const SWIPE_VARIANTS = {
  enter: (dir: 1 | -1) => ({ x: `${dir * 55}%`, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: `${dir * -55}%`, opacity: 0 }),
}

export function CardViewer() {
  const card = usePeek((s) => s.card)
  const actions = usePeek((s) => s.actions)
  const actionsNote = usePeek((s) => s.actionsNote)
  const count = usePeek((s) => s.count)
  const list = usePeek((s) => s.list)
  const index = usePeek((s) => s.index)
  const step = usePeek((s) => s.step)
  const close = usePeek((s) => s.close)

  return (
    // Keyed on presence, not on the card. Keying by id meant closing a card
    // and immediately reopening the same one re-added a key that was still
    // mid-exit, and the viewer would sometimes not come back. The card is a
    // prop; it can change without remounting.
    <AnimatePresence>
      {card && (
        <Viewer
          key="viewer"
          card={card}
          actions={actions}
          actionsNote={actionsNote}
          count={count}
          canStepBack={list !== undefined && index !== undefined && index > 0}
          canStepForward={list !== undefined && index !== undefined && index < list.length - 1}
          step={step}
          close={close}
        />
      )}
    </AnimatePresence>
  )
}

function Viewer({
  card,
  actions,
  actionsNote,
  count,
  canStepBack,
  canStepForward,
  step,
  close,
}: {
  card: CardData
  actions: SheetOption[]
  actionsNote: string | undefined
  count: number | undefined
  /** Whether a swipe (or arrow key) in either direction currently has
   *  somewhere to go — false with no list at all, which is what keeps the
   *  gesture inert everywhere but My Cards. */
  canStepBack: boolean
  canStepForward: boolean
  step: (delta: number) => void
  close: () => void
}) {
  // Which way the card most recently moved — the one thing about a swipe
  // that state actually has to remember, since it decides which side the
  // next card enters from below. Read once per swipe, at the moment it
  // fires, rather than derived from anything that changes continuously.
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1)
  const stepWithDirection = (delta: number) => {
    setSwipeDir(delta > 0 ? 1 : -1)
    step(delta)
  }

  // Escape closes; the arrow keys step, when there's a list to step through
  // at all — the keyboard's own equivalent of the swipe below, for whatever
  // reaches this dialog without a touchscreen. Body scroll is locked behind
  // the overlay for the same reason it always has been.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') stepWithDirection(-1)
      else if (e.key === 'ArrowRight') stepWithDirection(1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [close])

  /*
   * The scrim closes on a tap, not on any click.
   *
   * A drag that begins beside the card still ends in a click on the scrim, so
   * reaching past the card to turn it made the card vanish instead. Ten pixels
   * of travel is the same tolerance the hold gesture uses to tell a press from
   * a scroll.
   */
  const down = useRef({ x: 0, y: 0 })
  const closeIfTap = (e: React.MouseEvent) => {
    if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 10) return
    close()
  }

  const metal = RARITY_METAL[card.rarity]

  /*
   * Everything on screen that is not the card: the rarity and verse block,
   * the top safe-area inset, and the padding around them. Measured, not
   * guessed — 180px leaves the card as large as it can be at 568px tall while
   * still fitting, and lets a tall phone reach the 300px cap. There's no
   * close button any more, but the term is still a real (if now slightly
   * generous) upper bound rather than a tight one, and generous is the safe
   * direction for a cap.
   *
   * The tray term has to be the same `dvh` the tray is capped at, not a fixed
   * pixel count. A Figure with a long attack list fills that cap exactly, and
   * a constant would have fitted the short lists and overflowed the long ones
   * on precisely the screens where it matters most.
   */
  const chrome = actions.length > 0 ? 'calc(180px + 30dvh)' : '180px'

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        background: 'var(--scrim)',
        backdropFilter: 'blur(6px)',
        // Nothing here scrolls, and no gesture may chain out to the page
        // underneath either.
        overscrollBehavior: 'contain',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY }
      }}
      onClick={closeIfTap}
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
    >
      {/*
        Locked. This was a `.scroll-y`, but a drag beginning on the padding
        beside the card — or continuing past its edge — still moved the
        whole screen. A swipe between cards should never shift the thing
        being swiped, so the column does not scroll at all and the contents
        are sized to fit instead.

        No `stopPropagation` here on purpose — closing on a tap anywhere,
        card included, is the whole point now that there's no close button.
        It's still safe for the swipe gesture: `closeIfTap` on the scrim
        only fires when the pointer barely moved, so a real drag never
        closes it, only a plain tap does.
      */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 pt-safe pb-6 gap-1 overflow-hidden">
        {/*
         * Three bounds on the width, and the last is what makes the lock work:
         * the design cap, the screen's width, and the height left after the
         * header, the rarity block and the actions tray. A tall phone gets the
         * full 300px; a short one gets a smaller card with everything still on
         * screen and nothing scrolling. 63/88 is the card's own ratio, so the
         * height bound converts cleanly into a width.
         */}
        <motion.div
          className="shrink-0 px-2 py-4"
          style={{
            width: `min(300px, 78vw, calc((100dvh - ${chrome}) * 63 / 88))`,
            // Without this a vertical drag on the card would scroll an ancestor
            // instead of registering as a swipe.
            touchAction: 'none',
          }}
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          // Capture, so a drag that ends past the card's own bounds still
          // fires this element's own `onPointerUp` rather than nothing.
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId)
            // A swipe is read from where the finger ended up relative to
            // where it went down (`down`, set by the scrim's own
            // `onPointerDown` below, which this bubbles up to before this
            // handler ever runs) — not a drag translation followed the
            // whole way. Clearly sideways and past a real travel distance is
            // what tells a swipe from an incidental drag.
            if (!canStepBack && !canStepForward) return
            const dx = e.clientX - down.current.x
            const dy = e.clientY - down.current.y
            if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
              // Left carries to the next card, right back to the previous —
              // the same direction a photo gallery or a page-turn reads in.
              stepWithDirection(dx < 0 ? 1 : -1)
            }
          }}
        >
          {/*
            A dedicated stage, sized to the card's own ratio directly rather
            than left to size from whichever card happens to be in it: the
            swipe transition below briefly holds an outgoing and an incoming
            card at once, both absolutely positioned so they can overlap
            mid-slide, and an absolutely positioned child contributes nothing
            for its own parent to size from.
          */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '63 / 88' }}>
            {/*
              Keyed on the card's own id: framer only plays enter/exit for an
              element it sees replaced, not one that merely got new props, so
              swapping the id is what turns "the card changed" into an actual
              transition rather than an instant swap. `initial={false}` on
              the presence group is what keeps the *first* card from playing
              this same enter every time the viewer itself opens — that
              entrance already belongs to the outer frame's own scale-in.
            */}
            <AnimatePresence initial={false} custom={swipeDir}>
              <motion.div
                key={card.id}
                custom={swipeDir}
                style={{ position: 'absolute', inset: 0 }}
                variants={SWIPE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              >
                <Card card={card} style={{ boxShadow: 'var(--shadow-card-lifted)' }} />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="text-center shrink-0" style={{ color: '#f0dcbc' }}>
          <div className="flex items-center justify-center gap-2">
            <RarityMark rarity={card.rarity} size={13} />
            <span className="text-sm font-medium">{RARITY_LABEL[card.rarity]}</span>
            <span className="text-xs opacity-55">· {METAL_LABEL[metal]}</span>
          </div>

          {card.verse && (
            <p className="text-xs mt-2 opacity-75">
              {card.verse}
              {card.flavor && isFigure(card) && ' · '}
              {isFigure(card) && card.flavor && <em>{card.flavor}</em>}
            </p>
          )}

          {count !== undefined && (
            <p className="text-xs mt-2 opacity-60 tabular-nums">
              {count > 0 ? `${count} in collection` : 'Not collected'}
            </p>
          )}
        </div>

        {(actions.length > 0 || actionsNote) && (
          // A solid tray, not options floating on the scrim. Over a blurred
          // battle mat the option rows alone had almost no edge, and a
          // greyed-out unavailable attack faded into the background entirely —
          // which is exactly the row whose reason you need to read. A bench
          // Figure has a note (its live HP and energy) but nothing in the
          // pool yet gives it an action from there, so the tray has to open
          // on the note alone rather than gate on an actions list that may be
          // empty for a perfectly normal reason.
          <div
            className="on-dark w-full max-w-[300px] shrink-0 rounded-lg p-3 mt-3"
            style={{
              background: 'var(--overlay-tray)',
              boxShadow:
                'inset 0 0 0 1px var(--overlay-tray-edge), 0 12px 30px -12px rgba(0,0,0,.8)',
              // The only scroller in the viewer, for a Figure with a long list.
              // Capped so it can never crowd the card out, and contained so
              // scrolling it moves nothing but itself.
              maxHeight: '30dvh',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              touchAction: 'pan-y',
            }}
          >
            {actionsNote && (
              <p
                className={cx('text-xs text-ink-muted px-1 tabular-nums', actions.length > 0 && 'pb-2')}
              >
                {actionsNote}
              </p>
            )}
            {actions.length > 0 && <ActionList options={actions} onChosen={close} />}
          </div>
        )}
      </div>
    </motion.div>
  )
}
