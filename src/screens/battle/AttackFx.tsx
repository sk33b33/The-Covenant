import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AttackEvent } from '@/engine/types'
import type { EnergyType } from '@/game/types'

/**
 * The attack effect layer.
 *
 * Purely cosmetic and purely reactive: it owns no game state, reads one
 * `AttackEvent` and the two Active slots' screen rects at the moment it
 * fires, and draws a projectile, an impact and a damage number between them.
 * The actual cards never move here — the lunge and the hit-shake on the real
 * board pieces are driven separately, from Battle.tsx, off the same trigger,
 * since this layer only has coordinates, not the live Figures.
 *
 * Colours match `EnergyOrb`'s own `PAINT` table, so an attack's effect always
 * reads as the same element as its cost's glyph — but the *shape* of each
 * element's attack, how it travels and how it lands, is its own, the same
 * way each glyph is its own silhouette rather than a recoloured circle.
 */

export interface AttackFxTrigger {
  event: AttackEvent
  /** The attacking Figure's slot, at the moment the attack resolved. */
  fromRect: DOMRect
  /** The defending Figure's slot (or where it would be, on a miss). */
  toRect: DOMRect
}

interface ElementTheme {
  core: string
  glow: string
  /** Seconds for the projectile to cross from attacker to defender. */
  travel: number
  /** Sideways bow at the path's midpoint, in px. 0 is a straight line. */
  curve: number
  /** Oscillation amplitude for a wavy path, in px. 0 disables it. */
  wave: number
  /** A fading ghost trail behind the projectile's leading edge. */
  trail: boolean
  impact: 'burst' | 'ripple' | 'dust' | 'implosion' | 'zap'
}

const THEME: Record<EnergyType, ElementTheme> = {
  light: { core: '#fff8e0', glow: '#f4d979', travel: 0.26, curve: 0, wave: 0, trail: false, impact: 'burst' },
  fire: { core: '#ffb27a', glow: '#d2543a', travel: 0.36, curve: 20, wave: 0, trail: true, impact: 'burst' },
  water: { core: '#cdeefb', glow: '#3d7fa6', travel: 0.42, curve: 0, wave: 16, trail: true, impact: 'ripple' },
  earth: { core: '#e4d6a4', glow: '#8a7850', travel: 0.5, curve: 0, wave: 0, trail: true, impact: 'dust' },
  spirit: { core: '#ecdffb', glow: '#8e6fb0', travel: 0.44, curve: -24, wave: 10, trail: false, impact: 'implosion' },
  shadow: { core: '#d6cdee', glow: '#4a4056', travel: 0.28, curve: 0, wave: 0, trail: false, impact: 'zap' },
}

/** How hard the defender's own card shakes on impact, read by Battle.tsx so
 *  the real board piece's shake matches the effect that just landed on it. */
export const IMPACT_SHAKE: Record<EnergyType, { amount: number; seconds: number }> = {
  light: { amount: 4, seconds: 0.22 },
  fire: { amount: 6, seconds: 0.28 },
  water: { amount: 3, seconds: 0.24 },
  earth: { amount: 9, seconds: 0.38 },
  spirit: { amount: 2, seconds: 0.26 },
  shadow: { amount: 5, seconds: 0.24 },
}

/** Seconds until a hit lands — what Battle.tsx waits before shaking the
 *  defender's own card, so the two stay in sync without duplicating THEME. */
export const travelSeconds = (type: EnergyType) => THEME[type].travel

const TAG_SECONDS = 0.85

interface Props {
  trigger: AttackFxTrigger | null
  /** Fires once the whole effect (impact + damage number) has faded. */
  onDone: () => void
}

export function AttackFx({ trigger, onDone }: Props) {
  const [show, setShow] = useState({ projectile: false, impact: false, tag: false })

  useEffect(() => {
    if (!trigger) return
    const theme = THEME[trigger.event.type]
    const missed = trigger.event.missed
    // A miss fizzles short of the target rather than travelling the full
    // distance — see the shortened `dy` below, which uses the same fraction.
    const landAt = (missed ? theme.travel * 0.55 : theme.travel) * 1000

    setShow({ projectile: true, impact: false, tag: false })

    const land = setTimeout(() => {
      setShow({ projectile: false, impact: !missed, tag: true })
    }, landAt)

    const clear = setTimeout(() => {
      setShow({ projectile: false, impact: false, tag: false })
      onDone()
    }, landAt + TAG_SECONDS * 1000)

    return () => {
      clearTimeout(land)
      clearTimeout(clear)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.event.id])

  if (!trigger) return null
  const { event, fromRect, toRect } = trigger
  const theme = THEME[event.type]

  const fromX = fromRect.left + fromRect.width / 2
  const fromY = fromRect.top + fromRect.height / 2
  const toX = toRect.left + toRect.width / 2
  const toY = toRect.top + toRect.height / 2
  const dx = toX - fromX
  const dy = event.missed ? (toY - fromY) * 0.55 : toY - fromY

  const xFrames = theme.wave
    ? [0, theme.wave, -theme.wave, theme.wave * 0.4, 0]
    : theme.curve
      ? [0, theme.curve, 0]
      : undefined

  return (
    <div className="cov-attack-fx fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      <AnimatePresence>
        {show.projectile && (
          <span key="projectile">
            {theme.trail &&
              [2, 1].map((i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-pill"
                  style={{
                    left: fromX,
                    top: fromY,
                    width: 14,
                    height: 14,
                    marginLeft: -7,
                    marginTop: -7,
                    background: theme.glow,
                    filter: 'blur(2px)',
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                  animate={{ x: dx, y: dy, opacity: [0, 0.35, 0], scale: [0.5, 0.9, 0.7] }}
                  transition={{ duration: theme.travel, delay: i * 0.05, ease: 'easeIn' }}
                />
              ))}

            <motion.span
              className="absolute rounded-pill"
              style={{
                left: fromX,
                top: fromY,
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -8,
                background: theme.core,
                boxShadow: `0 0 10px 3px ${theme.glow}`,
              }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: xFrames ?? dx,
                y: dy,
                opacity: event.missed ? [0, 1, 0] : [0, 1, 1],
                scale: event.missed ? [0.4, 1, 0.3] : [0.4, 1, 1],
              }}
              transition={{
                duration: theme.travel,
                ease: 'easeIn',
                x: xFrames ? { duration: theme.travel, ease: 'easeInOut' } : undefined,
              }}
            />
          </span>
        )}

        {show.impact && <Impact key="impact" x={toX} y={toY} theme={theme} />}

        {show.tag && <DamageTag key="tag" x={toX} y={toY - toRect.height * 0.28} event={event} theme={theme} />}
      </AnimatePresence>
    </div>
  )
}

function Impact({ x, y, theme }: { x: number; y: number; theme: ElementTheme }) {
  const at = (size: number, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: x,
    top: y,
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    borderRadius: '50%',
    ...extra,
  })

  switch (theme.impact) {
    case 'burst':
      return (
        <>
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              style={at(20, { background: theme.core, boxShadow: `0 0 18px 6px ${theme.glow}` })}
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 2.4 + i, opacity: 0 }}
              transition={{ duration: 0.4 + i * 0.1, ease: 'easeOut', delay: i * 0.04 }}
            />
          ))}
        </>
      )

    case 'ripple':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              style={at(18, { border: `2px solid ${theme.glow}`, background: 'transparent' })}
              initial={{ scale: 0.4, opacity: 0.8 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.12 }}
            />
          ))}
        </>
      )

    case 'dust':
      return (
        <>
          <motion.span
            style={at(26, { background: theme.core, boxShadow: `0 0 20px 8px ${theme.glow}` })}
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          />
          {[...Array(6)].map((_, i) => {
            const angle = (i / 6) * Math.PI * 2
            return (
              <motion.span
                key={i}
                style={at(9, { background: theme.glow, filter: 'blur(1px)' })}
                initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * 34,
                  y: Math.sin(angle) * 22 + 10,
                  opacity: 0,
                  scale: 0.6,
                }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              />
            )
          })}
        </>
      )

    case 'implosion':
      return (
        <>
          <motion.span
            style={at(70, { background: 'transparent', border: `2px solid ${theme.glow}` })}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 0.2, opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.4, ease: 'easeIn' }}
          />
          <motion.span
            style={at(14, { background: theme.core, boxShadow: `0 0 16px 6px ${theme.glow}` })}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: [0.2, 1.3, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 0.42, ease: 'easeIn' }}
          />
        </>
      )

    case 'zap':
      return (
        <>
          <motion.div
            className="fixed inset-0"
            style={{ background: theme.glow }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.22, 0] }}
            transition={{ duration: 0.26, ease: 'easeOut' }}
          />
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 3,
                height: 30,
                marginLeft: -1.5,
                marginTop: -15,
                background: theme.core,
                boxShadow: `0 0 8px 2px ${theme.glow}`,
                transform: `rotate(${i * 55 - 55}deg)`,
                transformOrigin: 'center',
              }}
              initial={{ opacity: 0, scaleY: 0.3 }}
              animate={{ opacity: [0, 1, 0], scaleY: [0.3, 1, 0.6] }}
              transition={{ duration: 0.22, delay: i * 0.03, ease: 'easeOut' }}
            />
          ))}
        </>
      )
  }
}

function DamageTag({
  x,
  y,
  event,
  theme,
}: {
  x: number
  y: number
  event: AttackEvent
  theme: ElementTheme
}) {
  const label = event.missed ? 'Miss' : event.damage <= 0 ? 'Blocked' : `-${event.damage}`
  const neutral = event.missed || event.damage <= 0

  return (
    <motion.div
      className="absolute font-numeric font-extrabold tabular-nums text-center"
      style={{
        left: x,
        top: y,
        translate: '-50%',
        fontSize: event.weakness ? 22 : 18,
        color: neutral ? '#c9c2b0' : theme.core,
        textShadow: `0 0 10px ${neutral ? 'rgba(0,0,0,.6)' : theme.glow}, 0 1px 2px rgba(0,0,0,.8)`,
      }}
      initial={{ y: 0, opacity: 0, scale: 0.7 }}
      animate={{ y: -34, opacity: [0, 1, 1, 0], scale: 1 }}
      transition={{ duration: TAG_SECONDS, times: [0, 0.15, 0.7, 1], ease: 'easeOut' }}
    >
      {label}
      {event.weakness && (
        <div
          className="text-[10px] font-bold tracking-wide"
          style={{ color: 'var(--gold-bright)', textShadow: '0 1px 2px rgba(0,0,0,.8)' }}
        >
          WEAKNESS
        </div>
      )}
    </motion.div>
  )
}
