import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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

const MAX_TILT = 13

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
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const frameRef = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)

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
      setTilt({
        x: clamp(-(e.beta - 45) / 3, -MAX_TILT, MAX_TILT),
        y: clamp(e.gamma / 3, -MAX_TILT, MAX_TILT),
      })
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [])

  const onPointer = (e: React.PointerEvent) => {
    if (reduced.current) return
    const el = frameRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: -py * MAX_TILT * 2, y: px * MAX_TILT * 2 })
  }

  // Touch fires no pointerleave, so without this the card stays tilted where
  // the thumb left it and never springs back.
  const level = () => setTilt({ x: 0, y: 0 })

  // The sheen sweeps opposite the tilt, as a real foil catches light, and the
  // rim's specular turns with it so the metal reads as a struck edge rather
  // than a printed line.
  const holoAngle = 115 + tilt.y * 3.4
  const holoOpacity = 0.5 + Math.min(1, (Math.abs(tilt.x) + Math.abs(tilt.y)) / MAX_TILT) * 0.45
  const rimAngle = 218 + tilt.y * 2.6 - tilt.x * 1.4

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
        className="scroll-y flex-1 flex flex-col items-center justify-center px-8 pb-8 gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          ref={frameRef}
          className="w-full max-w-[320px] shrink-0"
          style={{ perspective: '1100px' }}
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onPointerMove={onPointer}
          onPointerLeave={level}
          onPointerUp={level}
          onPointerCancel={level}
        >
          <motion.div
            animate={{ rotateX: tilt.x, rotateY: tilt.y }}
            transition={{ type: 'spring', stiffness: 170, damping: 18 }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            <Card
              card={card}
              style={
                {
                  '--holo-angle': `${holoAngle}deg`,
                  '--holo-opacity': holoOpacity,
                  '--rim-angle': `${rimAngle}deg`,
                  boxShadow: 'var(--shadow-card-lifted)',
                } as React.CSSProperties
              }
            />
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
            className="on-dark w-full max-w-[320px] shrink-0 rounded-lg p-3"
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
