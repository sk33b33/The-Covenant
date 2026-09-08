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
 *
 * Every hit also carries a *tier* — normal, a weakness strike, or a knockout —
 * and the whole effect scales up with it: a routine hit is already big, a
 * weakness strike is bigger and holds its hit-stop longer, and a knockout is
 * the biggest and slowest of the three. The three should read as an obvious
 * escalation sitting side by side, not a subtle one.
 */

export interface AttackFxTrigger {
  event: AttackEvent
  /** The attacking Figure's slot, at the moment the attack resolved. */
  fromRect: DOMRect
  /** The defending Figure's slot (or where it would be, on a miss). */
  toRect: DOMRect
}

type Tier = 'normal' | 'weak' | 'ko'

const tierOf = (event: AttackEvent): Tier =>
  event.knockedOut ? 'ko' : event.weakness ? 'weak' : 'normal'

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

// Travel times run a little longer than a "snappy" hit would use — the
// amplified version of this effect is allowed to cost a bit of pacing for
// the sake of weight, which is exactly the trade this table makes.
const THEME: Record<EnergyType, ElementTheme> = {
  light: { core: '#fff8e0', glow: '#f4d979', travel: 0.3, curve: 0, wave: 0, trail: false, impact: 'burst' },
  fire: { core: '#ffb27a', glow: '#d2543a', travel: 0.42, curve: 26, wave: 0, trail: true, impact: 'burst' },
  water: { core: '#cdeefb', glow: '#3d7fa6', travel: 0.48, curve: 0, wave: 20, trail: true, impact: 'ripple' },
  earth: { core: '#e4d6a4', glow: '#8a7850', travel: 0.58, curve: 0, wave: 0, trail: true, impact: 'dust' },
  spirit: { core: '#ecdffb', glow: '#8e6fb0', travel: 0.5, curve: -28, wave: 12, trail: false, impact: 'implosion' },
  shadow: { core: '#d6cdee', glow: '#4a4056', travel: 0.32, curve: 0, wave: 0, trail: false, impact: 'zap' },
}

/** Overall size/glow multiplier for the whole effect — the "how amplified"
 *  dial. Tier multiplies on top of this, so a knockout is bigger still. */
const AMP = 1.65

const TIER_AMP: Record<Tier, number> = { normal: 1, weak: 1.3, ko: 1.65 }

/** The hit-stop hold — a beat of stillness at the exact moment of contact,
 *  before the impact bursts and the number pops — scaled by tier so a
 *  knockout hangs in the air noticeably longer than a routine hit. */
const HITSTOP_S: Record<Tier, number> = { normal: 0.09, weak: 0.15, ko: 0.22 }

/** How hard the defender's own card shakes, before the tier multiplier
 *  below — read by Battle.tsx so the real board piece's shake matches. */
const IMPACT_SHAKE: Record<EnergyType, { amount: number; seconds: number }> = {
  light: { amount: 6, seconds: 0.24 },
  fire: { amount: 9, seconds: 0.3 },
  water: { amount: 5, seconds: 0.26 },
  earth: { amount: 14, seconds: 0.42 },
  spirit: { amount: 3, seconds: 0.28 },
  shadow: { amount: 8, seconds: 0.26 },
}

const SHAKE_TIER_MUL: Record<Tier, number> = { normal: 1, weak: 1.3, ko: 1.7 }

/** How hard the defender's card should shake for this exact event — element
 *  base, scaled by how big a hit this was. Battle.tsx reads this rather than
 *  computing the tier itself. */
export function shakeFor(event: AttackEvent): { amount: number; seconds: number } {
  const base = IMPACT_SHAKE[event.type]
  const mul = SHAKE_TIER_MUL[tierOf(event)]
  return { amount: base.amount * mul, seconds: base.seconds * (1 + (mul - 1) * 0.4) }
}

/** Seconds from the attack landing to the moment of actual contact — travel
 *  plus the hit-stop hold — so Battle.tsx can start the defender's shake
 *  exactly when the impact visually lands rather than when the projectile
 *  merely arrives. */
export function impactDelaySeconds(event: AttackEvent): number {
  return THEME[event.type].travel + HITSTOP_S[tierOf(event)]
}

const TAG_BASE_S = 1.05
const TAG_TIER_BONUS_S: Record<Tier, number> = { normal: 0, weak: 0.15, ko: 0.35 }

interface Props {
  trigger: AttackFxTrigger | null
  /** Fires once the whole effect (impact + damage number) has faded. */
  onDone: () => void
}

export function AttackFx({ trigger, onDone }: Props) {
  const [show, setShow] = useState({ projectile: false, spark: false, impact: false, tag: false })

  useEffect(() => {
    if (!trigger) return
    const { event } = trigger
    const theme = THEME[event.type]
    const tier = tierOf(event)
    const missed = event.missed
    const hitStop = HITSTOP_S[tier]
    const tagSeconds = TAG_BASE_S + TAG_TIER_BONUS_S[tier]

    // A miss fizzles short of the target rather than travelling the full
    // distance — see the shortened `dy` below, which uses the same fraction —
    // and has nothing to hit, so it skips the hit-stop hold entirely.
    const landAt = (missed ? theme.travel * 0.55 : theme.travel) * 1000

    setShow({ projectile: true, spark: false, impact: false, tag: false })

    const spark = setTimeout(() => {
      if (missed) {
        setShow({ projectile: false, spark: false, impact: false, tag: true })
      } else {
        setShow({ projectile: false, spark: true, impact: false, tag: false })
      }
    }, landAt)

    const land = missed
      ? null
      : setTimeout(() => {
          setShow({ projectile: false, spark: false, impact: true, tag: true })
        }, landAt + hitStop * 1000)

    const clear = setTimeout(
      () => {
        setShow({ projectile: false, spark: false, impact: false, tag: false })
        onDone()
      },
      landAt + (missed ? 0 : hitStop * 1000) + tagSeconds * 1000,
    )

    return () => {
      clearTimeout(spark)
      if (land) clearTimeout(land)
      clearTimeout(clear)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.event.id])

  if (!trigger) return null
  const { event, fromRect, toRect } = trigger
  const theme = THEME[event.type]
  const tier = tierOf(event)
  const scale = AMP * TIER_AMP[tier]

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

  const coreSize = 16 * scale
  const trailSize = 14 * scale

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
                    width: trailSize,
                    height: trailSize,
                    marginLeft: -trailSize / 2,
                    marginTop: -trailSize / 2,
                    background: theme.glow,
                    filter: 'blur(2px)',
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                  animate={{ x: dx, y: dy, opacity: [0, 0.4, 0], scale: [0.5, 0.95, 0.7] }}
                  transition={{ duration: theme.travel, delay: i * 0.05, ease: 'easeIn' }}
                />
              ))}

            <motion.span
              className="absolute rounded-pill"
              style={{
                left: fromX,
                top: fromY,
                width: coreSize,
                height: coreSize,
                marginLeft: -coreSize / 2,
                marginTop: -coreSize / 2,
                background: theme.core,
                boxShadow: `0 0 ${14 * scale}px ${5 * scale}px ${theme.glow}`,
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

        {/* The hit-stop hold: contact has been made, but nothing has "landed"
            yet — a bright, near-static point sitting right where the impact
            is about to burst from. This beat, more than anything else here,
            is what makes a hit read as heavy rather than as two animations
            glued together. */}
        {show.spark && (
          <motion.span
            key="spark"
            className="absolute rounded-pill"
            style={{
              left: toX,
              top: toY,
              width: coreSize * 1.3,
              height: coreSize * 1.3,
              marginLeft: (-coreSize * 1.3) / 2,
              marginTop: (-coreSize * 1.3) / 2,
              background: '#fff',
              boxShadow: `0 0 ${20 * scale}px ${8 * scale}px ${theme.glow}`,
            }}
            initial={{ scale: 0.7, opacity: 1 }}
            animate={{ scale: [0.7, 1.1, 1], opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: HITSTOP_S[tier], ease: 'easeOut' }}
          />
        )}

        {show.impact && <Impact key="impact" x={toX} y={toY} theme={theme} tier={tier} scale={scale} />}

        {show.tag && (
          <DamageTag
            key="tag"
            x={toX}
            y={toY - toRect.height * 0.28}
            event={event}
            theme={theme}
            tier={tier}
            seconds={TAG_BASE_S + TAG_TIER_BONUS_S[tier]}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/** Full-screen colour pulse under every impact — subtle for a routine hit,
 *  unmissable for a knockout. "Screen flash" is part of what this effect's
 *  amplified setting promises, not just a `shadow`-only trick any more. */
const FLASH_OPACITY: Record<Tier, number> = { normal: 0.14, weak: 0.26, ko: 0.4 }

function Impact({
  x,
  y,
  theme,
  tier,
  scale,
}: {
  x: number
  y: number
  theme: ElementTheme
  tier: Tier
  scale: number
}) {
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

  return (
    <>
      <motion.div
        className="fixed inset-0"
        style={{ background: theme.glow }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, FLASH_OPACITY[tier], 0] }}
        transition={{ duration: 0.3 + (tier === 'ko' ? 0.14 : 0), ease: 'easeOut' }}
      />

      {/* A knockout gets a second, brighter white pulse on top of its own
          element's colour — the "flash bang" beat a routine hit doesn't
          earn. */}
      {tier === 'ko' && (
        <motion.div
          className="fixed inset-0"
          style={{ background: '#fff' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.32, 0] }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        />
      )}

      {/* A weakness strike earns its own gold ring on top of the elemental
          impact below it — the same gold this game already uses for
          anything favourable, rather than a colour invented just for this. */}
      {tier !== 'normal' && (
        <motion.span
          style={at(22 * scale, { border: `${2.5 * scale}px solid var(--gold-bright)`, background: 'transparent' })}
          initial={{ scale: 0.3, opacity: 0.95 }}
          animate={{ scale: 3.4, opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      )}

      <ImpactShape x={x} y={y} theme={theme} scale={scale} at={at} />
    </>
  )
}

function ImpactShape({
  x,
  y,
  theme,
  scale,
  at,
}: {
  x: number
  y: number
  theme: ElementTheme
  scale: number
  at: (size: number, extra?: React.CSSProperties) => React.CSSProperties
}) {
  switch (theme.impact) {
    case 'burst':
      return (
        <>
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              style={at(20 * scale, { background: theme.core, boxShadow: `0 0 ${18 * scale}px ${6 * scale}px ${theme.glow}` })}
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 2.6 + i, opacity: 0 }}
              transition={{ duration: 0.42 + i * 0.1, ease: 'easeOut', delay: i * 0.04 }}
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
              style={at(18 * scale, { border: `${2.5 * scale}px solid ${theme.glow}`, background: 'transparent' })}
              initial={{ scale: 0.4, opacity: 0.85 }}
              animate={{ scale: 3.6, opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut', delay: i * 0.12 }}
            />
          ))}
        </>
      )

    case 'dust':
      return (
        <>
          <motion.span
            style={at(26 * scale, { background: theme.core, boxShadow: `0 0 ${20 * scale}px ${8 * scale}px ${theme.glow}` })}
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
          {[...Array(8)].map((_, i) => {
            const angle = (i / 8) * Math.PI * 2
            return (
              <motion.span
                key={i}
                style={at(9 * scale, { background: theme.glow, filter: 'blur(1px)' })}
                initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * 40 * scale,
                  y: Math.sin(angle) * 26 * scale + 10,
                  opacity: 0,
                  scale: 0.6,
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )
          })}
        </>
      )

    case 'implosion':
      return (
        <>
          <motion.span
            style={at(70 * scale, { background: 'transparent', border: `${2.5 * scale}px solid ${theme.glow}` })}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 0.2, opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.42, ease: 'easeIn' }}
          />
          <motion.span
            style={at(14 * scale, { background: theme.core, boxShadow: `0 0 ${16 * scale}px ${6 * scale}px ${theme.glow}` })}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: [0.2, 1.4, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 0.44, ease: 'easeIn' }}
          />
        </>
      )

    case 'zap':
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 3 * Math.sqrt(scale),
                height: 32 * scale,
                marginLeft: (-3 * Math.sqrt(scale)) / 2,
                marginTop: (-32 * scale) / 2,
                background: theme.core,
                boxShadow: `0 0 ${9 * scale}px ${3 * scale}px ${theme.glow}`,
                transform: `rotate(${i * 42 - 63}deg)`,
                transformOrigin: 'center',
              }}
              initial={{ opacity: 0, scaleY: 0.3 }}
              animate={{ opacity: [0, 1, 0], scaleY: [0.3, 1, 0.6] }}
              transition={{ duration: 0.24, delay: i * 0.03, ease: 'easeOut' }}
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
  tier,
  seconds,
}: {
  x: number
  y: number
  event: AttackEvent
  theme: ElementTheme
  tier: Tier
  seconds: number
}) {
  const label = event.missed ? 'Miss' : event.damage <= 0 ? 'Blocked' : `-${event.damage}`
  const neutral = event.missed || event.damage <= 0
  const fontSize = tier === 'ko' ? 46 : tier === 'weak' ? 38 : 30

  return (
    <motion.div
      className="absolute font-numeric font-extrabold tabular-nums text-center"
      style={{
        left: x,
        top: y,
        translate: '-50%',
        fontSize,
        color: neutral ? '#c9c2b0' : theme.core,
        textShadow: `0 0 ${neutral ? 12 : 16}px ${neutral ? 'rgba(0,0,0,.6)' : theme.glow}, 0 2px 3px rgba(0,0,0,.85)`,
      }}
      initial={{ y: 0, opacity: 0, scale: 0.4 }}
      animate={{ y: -44, opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1, 1] }}
      transition={{ duration: seconds, times: [0, 0.18, 0.75, 1], ease: 'easeOut' }}
    >
      {label}
      {event.weakness && (
        <div
          className="text-[11px] font-bold tracking-wide"
          style={{ color: 'var(--gold-bright)', textShadow: '0 1px 2px rgba(0,0,0,.8)' }}
        >
          WEAKNESS
        </div>
      )}
      {tier === 'ko' && (
        <div
          className="text-[13px] font-bold tracking-wider"
          style={{ color: '#ffefc2', textShadow: '0 0 8px rgba(0,0,0,.7), 0 1px 2px rgba(0,0,0,.9)' }}
        >
          KNOCKED OUT
        </div>
      )}
    </motion.div>
  )
}
