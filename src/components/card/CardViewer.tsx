import { useEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'
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
import { useSettings } from '@/store/settings'

/**
 * The card, held up to the light.
 *
 * Opened by holding any card anywhere in the game — and by a single tap on
 * your Active Figure mid-match, which also carries its attacks underneath, so
 * one tap still both inspects and acts.
 *
 * The card lifts toward your thumb, as though it were being tilted up to
 * meet it, and both the holo sheen and the metal rim track that lean: the
 * pairing is what makes a rare card feel like a physical foil rather than a
 * picture of one. Release and it springs back level. Motion is dropped
 * entirely under `prefers-reduced-motion` — or its in-app equivalent, the
 * "Simplify effects" switch in Menu → Graphics.
 *
 * A held touch or mouse press is the only input — a mouse merely hovering
 * does nothing, the same as a finger that isn't down does nothing. The
 * gyroscope drove this too once, which meant a card turned on its own
 * while you were reading it.
 *
 * The overlay never scrolls. Everything is sized to fit the viewport instead,
 * because a screen that shifts under the gesture turning it is worse than a
 * card rendered slightly smaller.
 *
 * Mounted once, in App. Everything else opens it through the peek store.
 */

/** Degrees at the card's edge. Pronounced enough that the card visibly turns
 *  in space and the rim sweeps light across its whole travel. */
const MAX_TILT = 18

/** Tight and fast: a smoothing filter on a value that already tracks the
 *  thumb, not an animation chasing it. */
const TILT_SPRING = { stiffness: 420, damping: 34, mass: 0.5 }

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
  const frameRef = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)

  // Which way the card most recently moved — the one thing about a swipe
  // that state actually has to remember, since it decides which side the
  // next card enters from below. Read once per swipe, at the moment it
  // fires, rather than derived from anything that changes continuously.
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1)
  const stepWithDirection = (delta: number) => {
    setSwipeDir(delta > 0 ? 1 : -1)
    step(delta)
  }

  /*
   * The tilt runs entirely on motion values, never on React state.
   *
   * It used to setState on every pointermove, which re-rendered this component
   * and the whole Card tree beneath it — nameplate, artwork, orb, every attack
   * row, the footer's SVGs — sixty times a second. That was the jank. And the
   * rotation was a spring `animate` target, so each move re-aimed a spring that
   * was already in flight: it chased the thumb and never arrived.
   *
   * Now the pointer writes a raw value, a spring smooths it, and the result is
   * applied straight to the element. React does not re-render at all while the
   * card is turning, and the spring damps a value that already tracks the
   * pointer rather than pursuing a moving target.
   */
  const px = useMotionValue(0)
  const py = useMotionValue(0)

  const sx = useSpring(px, TILT_SPRING)
  const sy = useSpring(py, TILT_SPRING)

  /*
   * The card lifts toward the finger: touch the right edge and that edge
   * rises toward you, as though the card were tilting up to meet the touch
   * rather than pressing flat away from it.
   *
   * A positive rotateY sends the right edge away from the viewer and a
   * positive rotateX sends the top edge away, so lifting the touched edge
   * toward the viewer instead means negating both from what a plain
   * `(px, py)` reading would otherwise give.
   */
  const rotateY = useTransform(sx, (v) => -v * MAX_TILT)
  const rotateX = useTransform(sy, (v) => v * MAX_TILT)

  /*
   * The light is derived from the rotation, not from the pointer.
   *
   * Both were driven off the pointer before, which meant flipping the tilt
   * silently sent the highlight sweeping against the surface instead of across
   * it — the sort of mismatch that reads as "wrong" without being nameable.
   * Taking the rotation as the input makes the two impossible to desynchronise:
   * whichever way the card faces, the sheen and the rim's specular follow it.
   */
  // Both axes feed the angle, not just rotateY — a pure up/down drag used to
  // leave this untouched, so tilting the card toward or away from you swept
  // no sheen at all and read as no different from the resting card. The
  // rim's own highlight (below) already took both axes; the sheen just
  // hadn't caught up.
  const holoAngle = useMotionTemplate`${useTransform(
    [rotateY, rotateX] as const,
    ([y = 0, x = 0]: number[]) => 115 + y * 2.6 + x * 2.6,
  )}deg`
  const rimBase = useMotionTemplate`${useTransform(
    [rotateY, rotateX] as const,
    ([y = 0, x = 0]: number[]) => 218 + y * 1.9 + x,
  )}deg`
  const lit = useTransform([sx, sy] as const, ([x = 0, y = 0]: number[]) =>
    Math.min(1, Math.hypot(x, y)),
  )
  const holoOpacity = useTransform(lit, (v) => 0.5 + v * 0.45)
  // A high resting floor on purpose. At 0.15 a card sitting still carried
  // almost no highlight and read closer to matte than to metal — polished metal
  // is bright before you move it, and only *changes* when you do.
  const glint = useTransform(lit, (v) => 0.38 + v * 0.62)

  // Two sources feed the same flag: the OS's own prefers-reduced-motion, and
  // the player's "Simplify effects" switch in Menu → Graphics. Read directly
  // rather than through the `useReducedMotion` hook because this is consulted
  // from `track`, which runs on every pointermove and cannot afford a
  // re-render — so the media query and the store are both subscribed to once,
  // outside React, and only the ref they write is read on the hot path.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      reduced.current = mq.matches || useSettings.getState().reducedMotion
    }
    sync()
    mq.addEventListener('change', sync)
    const unsubscribe = useSettings.subscribe(sync)
    return () => {
      mq.removeEventListener('change', sync)
      unsubscribe()
    }
  }, [])

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

  // Whether a press is actually down right now — the one thing standing
  // between "turn the card" and "the pointer merely passed over it". A
  // mouse fires `pointermove` continuously just from hovering, with no
  // button held at all; without this gate, moving the mouse anywhere near
  // the card tilted it, and moving it away snapped things level again
  // (see `onPointerLeave` below, now gone) — a card that never actually
  // held still. Touch never had the hover half of that problem (a touch
  // pointer only exists while the finger is down), but it still isn't
  // "smooth" for a *held* drag to reset the instant a finger drifts a few
  // pixels past the card's own edge, which is exactly what a real touch on
  // a card this size does often enough to notice.
  const dragging = useRef(false)

  // Touch and a held mouse button are the only things that turn the card.
  // There is deliberately no `deviceorientation` listener: driving the same
  // tilt from the gyroscope meant a card could turn on its own while you
  // were looking at it.
  const track = (e: React.PointerEvent) => {
    if (reduced.current || !dragging.current) return
    const el = frameRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // -1 to 1 across the card, so MAX_TILT reads as degrees at the edge.
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2
    // Clamped as one vector, not as two independent axes: rotateX and
    // rotateY are each driven straight off this pair and composed by
    // framer as two separate CSS rotations, so a corner — where both
    // components are near their own max at once — was quietly getting a
    // full MAX_TILT turn on *both* axes together, one on top of the
    // other. Every horizontal plate on the card's own face (the
    // nameplate, each attack row, the footer) is a straight line running
    // through that rotateX turn, and stacking it under a near-full
    // rotateY on top read as those lines bowing — the card's face itself
    // looking bent — rather than as a corner leaning harder than an edge.
    // Scaling the vector down to length 1 keeps a corner drag reading as
    // more dramatic than a pure edge drag (it is still a full diagonal
    // lean), without ever handing both axes their full degrees at once.
    // Pointer capture is what lets the finger carry on past the card's
    // own edge and simply hold the tilt at its maximum instead of reading
    // some undefined, ever-growing value out past the card — this still
    // does that, just measured as one vector's length instead of two.
    const mag = Math.hypot(x, y)
    const scale = mag > 1 ? 1 / mag : 1
    px.set(x * scale)
    py.set(y * scale)
  }

  const level = () => {
    px.set(0)
    py.set(0)
  }

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
        Locked. This was a `.scroll-y`, and while the card itself carries
        touch-action: none, a drag beginning on the padding beside it — or
        continuing past its edge — still moved the whole screen. Tilting a card
        should never shift the thing being tilted, so the column does not
        scroll at all and the contents are sized to fit instead.

        No `stopPropagation` here on purpose — closing on a tap anywhere,
        card included, is the whole point now that there's no close button.
        It's still safe for the tilt gesture: `closeIfTap` on the scrim only
        fires when the pointer barely moved, so a real drag that turns the
        card in 3D never closes it, only a plain tap does.
      */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 pt-safe pb-6 gap-1 overflow-hidden">
        {/*
         * Three bounds on the width, and the last is what makes the lock work:
         * the design cap, the screen's width, and the height left after the
         * header, the rarity block and the actions tray. A tall phone gets the
         * full 300px; a short one gets a smaller card with everything still on
         * screen and nothing scrolling. 63/88 is the card's own ratio, so the
         * height bound converts cleanly into a width.
         *
         * The padding is tilt clearance: the lifted shadow reaches 48px
         * further out than the card itself.
         */}
        <motion.div
          ref={frameRef}
          className="shrink-0 px-2 py-4"
          style={{
            width: `min(300px, 78vw, calc((100dvh - ${chrome}) * 63 / 88))`,
            // Deliberately no `perspective` here. A perspective context is
            // what makes rotateX/rotateY foreshorten — the near edge of the
            // rotated plane projects wider than the far one, which is what
            // every round of "the card is warping" in this feature's history
            // turned out to be, no matter how far out the vanishing point was
            // pushed: keystoning at 1100px, keystoning (just less of it) at
            // 4800px. Without a perspective, the browser projects the
            // rotation orthographically instead — every point's screen
            // position scales by the same cos(angle) regardless of depth, so
            // the card can only ever come out as a rectangle, uniformly
            // narrower at a steeper angle, never a trapezoid. That is a
            // guarantee from how the projection math works, not a matter of
            // tuning a distance far enough away that the warp becomes too
            // small to see.
            // Without this a vertical drag on the card would scroll an ancestor
            // instead of turning the card.
            touchAction: 'none',
          }}
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onPointerMove={track}
          // Capture, so a drag keeps turning the card after it leaves the
          // card's own bounds instead of stopping dead at the edge.
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            track(e)
          }}
          onPointerUp={(e) => {
            dragging.current = false
            e.currentTarget.releasePointerCapture(e.pointerId)
            level()
            // A swipe is read from where the finger ended up relative to
            // where it went down (`down`, set by the scrim's own
            // `onPointerDown` below, which this bubbles up to before this
            // handler ever runs) — not a drag translation followed the
            // whole way, the same "read the gesture at the end" shape the
            // tilt's own tap-vs-turn split already uses. Clearly sideways
            // (never mind a diagonal tilt-drag) and past a real travel
            // distance is what tells a swipe from a tilt that happened to
            // end near an edge.
            if (!canStepBack && !canStepForward) return
            const dx = e.clientX - down.current.x
            const dy = e.clientY - down.current.y
            if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
              // Left carries to the next card, right back to the previous —
              // the same direction a photo gallery or a page-turn reads in.
              stepWithDirection(dx < 0 ? 1 : -1)
            }
          }}
          // No `onPointerLeave` any more — see `dragging` above for why a
          // drag that carries past the card's edge should hold its tilt
          // rather than reset it. `onPointerCancel` is the one genuine
          // interruption left (the OS taking the gesture for its own
          // purposes mid-drag), and that still snaps back to level.
          onPointerCancel={() => {
            dragging.current = false
            level()
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
              The custom properties ride the motion element, not the Card.
              framer-motion only subscribes a motion value on a component it
              owns, and Card is a plain function that spreads `style` onto an
              article — handed motion values there, React stringified them and
              the rim sat frozen at its rest angle. Set here they inherit down
              to the rim and the sheen, which is what `inherits: true` on each
              @property is for.

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
                style={
                  {
                    position: 'absolute',
                    inset: 0,
                    rotateX,
                    rotateY,
                    transformStyle: 'preserve-3d',
                    '--holo-angle': holoAngle,
                    '--holo-opacity': holoOpacity,
                    '--rim-base': rimBase,
                    '--rim-glint': glint,
                  } as React.ComponentProps<typeof motion.div>['style']
                }
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
