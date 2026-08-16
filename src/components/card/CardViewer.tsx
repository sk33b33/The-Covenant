import { useEffect, useRef } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'
import { CloseIcon } from '@/art/icons'
import { RarityMark } from '@/art/RarityMark'
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
 * The card presses away from your thumb, as though pushed flat against a
 * table, and both the holo sheen and the metal rim track that lean: the
 * pairing is what makes a rare card feel like a physical foil rather than a
 * picture of one. Release and it springs back level. Motion is dropped
 * entirely under `prefers-reduced-motion`.
 *
 * Touch is the only input. The gyroscope drove this too once, which meant a
 * card turned on its own while you were reading it.
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

export function CardViewer() {
  const card = usePeek((s) => s.card)
  const actions = usePeek((s) => s.actions)
  const actionsNote = usePeek((s) => s.actionsNote)
  const count = usePeek((s) => s.count)
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
  close,
}: {
  card: CardData
  actions: SheetOption[]
  actionsNote: string | undefined
  count: number | undefined
  close: () => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)

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
   * The card presses away from the finger: touch the right edge and that edge
   * goes down, as though you were pushing a card flat against a table.
   *
   * A positive rotateY already sends the right edge away from the viewer and a
   * positive rotateX already sends the top edge away, so this convention is
   * the one that needs no negation on either axis.
   */
  const rotateY = useTransform(sx, (v) => v * MAX_TILT)
  const rotateX = useTransform(sy, (v) => -v * MAX_TILT)

  /*
   * The light is derived from the rotation, not from the pointer.
   *
   * Both were driven off the pointer before, which meant flipping the tilt
   * silently sent the highlight sweeping against the surface instead of across
   * it — the sort of mismatch that reads as "wrong" without being nameable.
   * Taking the rotation as the input makes the two impossible to desynchronise:
   * whichever way the card faces, the sheen and the rim's specular follow it.
   */
  const holoAngle = useMotionTemplate`${useTransform(rotateY, (v) => 115 + v * 2.6)}deg`
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

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // Escape closes, and the body must not scroll behind the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [close])

  // Touch is the only thing that turns the card. There is deliberately no
  // `deviceorientation` listener: driving the same tilt from the gyroscope
  // meant a card could turn on its own while you were looking at it.
  const track = (e: React.PointerEvent) => {
    if (reduced.current) return
    const el = frameRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // -1 to 1 across the card, so MAX_TILT reads as degrees at the edge.
    px.set(clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1))
    py.set(clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1))
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
   * Everything on screen that is not the card: the close-button row, the
   * rarity and verse block, and the padding between them. Measured, not
   * guessed — 180px leaves the card as large as it can be at 568px tall while
   * still fitting, and lets a tall phone reach the 300px cap.
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
      <div className="flex justify-end pt-safe px-4">
        <button
          onClick={close}
          className="w-10 h-10 rounded-pill grid place-items-center mt-2"
          style={{ background: 'rgba(255,253,248,.14)', color: '#fdfaf3' }}
          aria-label="Close"
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {/*
        Locked. This was a `.scroll-y`, and while the card itself carries
        touch-action: none, a drag beginning on the padding beside it — or
        continuing past its edge — still moved the whole screen. Tilting a card
        should never shift the thing being tilted, so the column does not
        scroll at all and the contents are sized to fit instead.
      */}
      <div
        className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 pb-6 gap-1 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/*
         * Three bounds on the width, and the last is what makes the lock work:
         * the design cap, the screen's width, and the height left after the
         * header, the rarity block and the actions tray. A tall phone gets the
         * full 300px; a short one gets a smaller card with everything still on
         * screen and nothing scrolling. 63/88 is the card's own ratio, so the
         * height bound converts cleanly into a width.
         *
         * The padding is tilt clearance: turned in 3D the near corners project
         * outward and the lifted shadow reaches 48px further still.
         */}
        <motion.div
          ref={frameRef}
          className="shrink-0 px-2 py-4"
          style={{
            width: `min(300px, 78vw, calc((100dvh - ${chrome}) * 63 / 88))`,
            perspective: '1100px',
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
            e.currentTarget.setPointerCapture(e.pointerId)
            track(e)
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId)
            level()
          }}
          onPointerLeave={level}
          onPointerCancel={level}
        >
          {/*
            The custom properties ride the motion element, not the Card.
            framer-motion only subscribes a motion value on a component it
            owns, and Card is a plain function that spreads `style` onto an
            article — handed motion values there, React stringified them and
            the rim sat frozen at its rest angle. Set here they inherit down to
            the rim and the sheen, which is what `inherits: true` on each
            @property is for.
          */}
          <motion.div
            style={
              {
                rotateX,
                rotateY,
                transformStyle: 'preserve-3d',
                '--holo-angle': holoAngle,
                '--holo-opacity': holoOpacity,
                '--rim-base': rimBase,
                '--rim-glint': glint,
              } as React.ComponentProps<typeof motion.div>['style']
            }
          >
            <Card card={card} style={{ boxShadow: 'var(--shadow-card-lifted)' }} />
          </motion.div>
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

        {actions.length > 0 && (
          // A solid tray, not options floating on the scrim. Over a blurred
          // battle mat the option rows alone had almost no edge, and a
          // greyed-out unavailable attack faded into the background entirely —
          // which is exactly the row whose reason you need to read.
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
              <p className="text-xs text-ink-muted px-1 pb-2 tabular-nums">{actionsNote}</p>
            )}
            <ActionList options={actions} onChosen={close} />
          </div>
        )}
      </div>
    </motion.div>
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
