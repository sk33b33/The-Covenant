import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CloseIcon } from '@/art/icons'
import { RarityMark } from '@/art/RarityMark'
import { Card } from './Card'
import { RARITY_LABEL, isFigure, type Card as CardData } from '@/game/types'

/**
 * Full-screen card viewer.
 *
 * The card tilts toward the pointer or the device's gyroscope, and the holo
 * sheen tracks the tilt — that pairing is what makes a rare card feel like a
 * physical foil rather than a picture of one. Motion is dropped entirely under
 * `prefers-reduced-motion`, and the gyroscope is only used where the browser
 * grants it without a permission prompt, since asking for one on tapping a card
 * would be worse than the effect is worth.
 */

const MAX_TILT = 13

export function CardDetail({
  card,
  count,
  onClose,
}: {
  card: CardData
  count: number
  onClose: () => void
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const frameRef = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // Escape closes, and the body must not scroll behind the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

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

  // The sheen sweeps opposite the tilt, as a real foil catches light.
  const holoAngle = 115 + tilt.y * 3.4
  const holoOpacity = 0.5 + Math.min(1, (Math.abs(tilt.x) + Math.abs(tilt.y)) / MAX_TILT) * 0.45

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
      >
        <div className="flex justify-end pt-safe px-4">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-pill grid place-items-center mt-2"
            style={{ background: 'rgba(255,253,248,.14)', color: '#fdfaf3' }}
            aria-label="Close"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div
          className="flex-1 flex flex-col items-center justify-center px-8 pb-8 gap-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            ref={frameRef}
            className="w-full max-w-[320px]"
            style={{ perspective: '1100px' }}
            onPointerMove={onPointer}
            onPointerLeave={() => setTilt({ x: 0, y: 0 })}
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
                    boxShadow: 'var(--shadow-card-lifted)',
                  } as React.CSSProperties
                }
              />
            </motion.div>
          </div>

          <div className="text-center" style={{ color: '#f0dcbc' }}>
            <div className="flex items-center justify-center gap-2">
              <RarityMark rarity={card.rarity} size={13} />
              <span className="text-sm font-medium">{RARITY_LABEL[card.rarity]}</span>
            </div>

            {card.verse && (
              <p className="text-xs mt-2 opacity-75">
                {card.verse}
                {card.flavor && isFigure(card) && ' · '}
                {isFigure(card) && card.flavor && <em>{card.flavor}</em>}
              </p>
            )}

            <p className="text-xs mt-2 opacity-60 tabular-nums">
              {count > 0 ? `${count} in collection` : 'Not collected'}
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
