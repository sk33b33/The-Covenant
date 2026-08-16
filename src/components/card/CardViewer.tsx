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
 * The card tilts toward the pointer or the device's gyroscope, and both the
 * holo sheen and the metal rim track the tilt: that pairing is what makes a
 * rare card feel like a physical foil rather than a picture of one. Release
 * and it springs back level. Motion is dropped entirely under
 * `prefers-reduced-motion`, and the gyroscope is only used where the browser
 * grants it without a permission prompt — asking for one on looking at a card
 * would be worse than the effect is worth.
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

  const rotateY = useTransform(sx, (v) => v * MAX_TILT)
  const rotateX = useTransform(sy, (v) => -v * MAX_TILT)

  // The sheen sweeps opposite the tilt, as a real foil catches light, and the
  // rim's specular turns with it so the metal reads as a struck edge rather
  // than a printed line. Both ride the same springs as the rotation, so the
  // light and the card move as one object.
  const holoAngle = useMotionTemplate`${useTransform(sx, (v) => 115 + v * 46)}deg`
  const rimBase = useMotionTemplate`${useTransform(
    [sx, sy] as const,
    ([x = 0, y = 0]: number[]) => 218 + x * 34 - y * 18,
  )}deg`
  const lit = useTransform([sx, sy] as const, ([x = 0, y = 0]: number[]) =>
    Math.min(1, Math.hypot(x, y)),
  )
  const holoOpacity = useTransform(lit, (v) => 0.5 + v * 0.45)
  const glint = useTransform(lit, (v) => 0.15 + v * 0.85)

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

  // Device orientation, where it is available without a permission prompt.
  useEffect(() => {
    if (reduced.current) return
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return
      px.set(clamp(e.gamma / 40, -1, 1))
      py.set(clamp(-(e.beta - 45) / 40, -1, 1))
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [px, py])

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

  const metal = RARITY_METAL[card.rarity]

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={close}
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

      <div
        className="scroll-y flex-1 flex flex-col items-center justify-center px-4 pb-6 gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/*
         * The card carries its own padding inside the scroller.
         *
         * `.scroll-y` sets overflow-y, and the Overflow spec computes the other
         * axis to `auto` alongside it — so this box clips horizontally as well
         * as vertically. Turned in 3D the card's near corners project outward
         * and its lifted shadow reaches 48px further still; with the card
         * previously running nearly edge to edge, both were being sliced. The
         * padding here is the clearance, and it is why the card is no longer
         * the full width of the screen.
         */}
        <motion.div
          ref={frameRef}
          className="w-full max-w-[300px] shrink-0 px-2 py-6"
          style={{
            perspective: '1100px',
            // Without this a vertical drag on the card scrolls this container
            // instead of turning the card, which is why tilt barely worked by
            // touch at all.
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
