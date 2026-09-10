import { useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AttackEvent } from '@/engine/types'
import type { EnergyType } from '@/game/types'

/**
 * The attack effect layer.
 *
 * Purely cosmetic and purely reactive: it owns no game state, reads one
 * `AttackEvent` and the two Active slots' screen rects at the moment it
 * fires, and draws the whole strike between them. The actual cards never
 * move here — the lunge and the hit-shake on the real board pieces are
 * driven separately, from Battle.tsx, off the same trigger, since this layer
 * only has coordinates, not the live Figures.
 *
 * Each element throws something built for it rather than a recoloured ball:
 * fire is a comet with flame tongues that sheds embers and leaves smoke,
 * water is a teardrop trailing spray and mist, earth is a cluster of tumbling
 * chunks kicking up dust, light is a flared star scattering sparks, spirit is
 * a breathing wisp with motes orbiting it, shadow is a void core dragging
 * tendrils. The impact each one lands is built the same way. Colours match
 * `EnergyOrb`'s own `PAINT` table throughout, so an attack always reads as
 * the same element as the cost that paid for it.
 *
 * Every hit also carries a *tier* — normal, a weakness strike, or a knockout
 * — and the whole effect scales up with it, so the three read as an obvious
 * escalation sitting side by side rather than a subtle one.
 *
 * Nothing here animates anything but transform and opacity, and the soft
 * shapes are radial-gradient fills rather than blurred boxes, because a
 * dozen simultaneous `filter: blur` layers is exactly the kind of thing that
 * turns a handheld's compositor into a re-rasteriser.
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

/**
 * One layer of the stuff a projectile sheds behind it.
 *
 * Each particle spawns wherever the head actually is at its own spawn
 * moment — its delay and its position along the path are the same number —
 * and then drifts off on its own. That is what makes the wake read as coming
 * *off* the projectile rather than as a second animation aimed at the same
 * place.
 */
interface WakeLayer {
  count: number
  /** Diameter in px, before the amplification multiplier. */
  size: number
  /** Seconds a particle lives once it has detached. */
  life: number
  /** Sideways scatter, ± this many px. */
  driftX: number
  /** Vertical drift: negative rises (embers, smoke), positive falls. */
  driftY: number
  /** Scale at the end of life, relative to spawn. */
  grow: number
  opacity: number
  /** A soft radial puff rather than a hard dot. */
  soft: boolean
  /** `core`/`glow` pull from the element, anything else is used verbatim. */
  color: 'core' | 'glow' | string
  /** Degrees of tumble over the particle's life. */
  spin?: number
}

type HeadKind = 'comet' | 'droplet' | 'star' | 'boulder' | 'wisp' | 'void'

interface ElementTheme {
  core: string
  glow: string
  /** Seconds for the projectile to cross from attacker to defender. */
  travel: number
  /** Sideways bow at the path's midpoint, in px. 0 is a straight line. */
  curve: number
  /** Oscillation amplitude for a wavy path, in px. 0 disables it. */
  wave: number
  head: HeadKind
  wake: WakeLayer[]
}

const THEME: Record<EnergyType, ElementTheme> = {
  light: {
    core: '#fff8e0',
    glow: '#f4d979',
    travel: 0.32,
    curve: 0,
    wave: 0,
    head: 'star',
    wake: [
      { count: 12, size: 4, life: 0.45, driftX: 24, driftY: -16, grow: 0.2, opacity: 1, soft: false, color: 'core' },
      { count: 4, size: 18, life: 0.5, driftX: 10, driftY: -8, grow: 1.9, opacity: 0.5, soft: true, color: 'glow' },
    ],
  },
  fire: {
    core: '#ffb27a',
    glow: '#d2543a',
    travel: 0.44,
    curve: 26,
    wave: 0,
    head: 'comet',
    wake: [
      // Embers ride the flame up and out; the further back they are the
      // cooler they get, which is why they fade rather than shrink to a point.
      { count: 11, size: 5, life: 0.6, driftX: 26, driftY: -36, grow: 0.3, opacity: 1, soft: false, color: 'core' },
      { count: 5, size: 22, life: 0.85, driftX: 20, driftY: -28, grow: 2.6, opacity: 0.55, soft: true, color: 'rgba(74,60,52,.85)' },
    ],
  },
  water: {
    core: '#cdeefb',
    glow: '#3d7fa6',
    travel: 0.5,
    curve: 0,
    wave: 20,
    head: 'droplet',
    wake: [
      // Spray falls away rather than rising — the one wake on the board that
      // obeys gravity, which is most of what sells it as water.
      { count: 11, size: 5, life: 0.55, driftX: 30, driftY: 26, grow: 0.4, opacity: 1, soft: false, color: 'core' },
      { count: 4, size: 20, life: 0.6, driftX: 14, driftY: 8, grow: 2.1, opacity: 0.45, soft: true, color: 'rgba(168,214,238,.8)' },
    ],
  },
  earth: {
    core: '#e4d6a4',
    glow: '#8a7850',
    travel: 0.62,
    curve: 0,
    wave: 0,
    head: 'boulder',
    wake: [
      { count: 8, size: 6, life: 0.65, driftX: 24, driftY: 32, grow: 0.5, opacity: 1, soft: false, color: 'glow', spin: 260 },
      { count: 6, size: 22, life: 0.8, driftX: 22, driftY: -12, grow: 2.8, opacity: 0.5, soft: true, color: 'rgba(150,130,95,.85)' },
    ],
  },
  spirit: {
    core: '#ecdffb',
    glow: '#8e6fb0',
    travel: 0.54,
    curve: -28,
    wave: 12,
    head: 'wisp',
    wake: [
      { count: 10, size: 4, life: 0.75, driftX: 26, driftY: -30, grow: 0.3, opacity: 0.95, soft: false, color: 'core' },
      { count: 4, size: 24, life: 0.75, driftX: 12, driftY: -16, grow: 2.1, opacity: 0.45, soft: true, color: 'rgba(142,111,176,.85)' },
    ],
  },
  shadow: {
    core: '#d6cdee',
    glow: '#4a4056',
    travel: 0.34,
    curve: 0,
    wave: 0,
    head: 'void',
    wake: [
      // Shadow's wake is the one that *darkens* rather than glows: the puffs
      // are near-black and sit under the sparks instead of behind them.
      { count: 8, size: 18, life: 0.55, driftX: 16, driftY: 10, grow: 1.9, opacity: 0.6, soft: true, color: 'rgba(24,18,32,.9)' },
      { count: 6, size: 4, life: 0.42, driftX: 22, driftY: -14, grow: 0.3, opacity: 1, soft: false, color: 'core' },
    ],
  },
}

/** Overall size/glow multiplier for the whole effect — the "how amplified"
 *  dial. Tier multiplies on top of this, so a knockout is bigger still. */
const AMP = 1.65

const TIER_AMP: Record<Tier, number> = { normal: 1, weak: 1.3, ko: 1.65 }

/** The hit-stop hold — a beat of stillness at the exact moment of contact,
 *  before the impact bursts and the number pops — scaled by tier so a
 *  knockout hangs in the air noticeably longer than a routine hit. */
const HITSTOP_S: Record<Tier, number> = { normal: 0.09, weak: 0.15, ko: 0.22 }

/**
 * A brief charge on the attacker's own card, before anything leaves it.
 *
 * Everything above throws something *at* the defender; nothing previously
 * happened *to* the attacker beyond a plain lunge — the same up-and-down
 * recoil regardless of element, throwing a fireball or a shadow the same way
 * as drawing on light. This is the missing beat: the element visibly gathers
 * into the card first, so the strike reads as the card's own power being
 * spent rather than a projectile that simply happens to leave from there.
 *
 * Tier-scaled like the hit-stop hold it mirrors, so a knockout telegraphs a
 * touch longer than a routine hit — never long enough to feel sluggish; the
 * whole point of pacing this game out was to let a beat be seen, not to
 * make every strike wait through one.
 */
const WINDUP_S: Record<Tier, number> = { normal: 0.14, weak: 0.19, ko: 0.26 }

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
/** Seconds the charge plays before the strike actually leaves the card —
 *  read by Battle.tsx to time the attacker's own coil-and-glow against it. */
export function windupDelaySeconds(event: AttackEvent): number {
  return WINDUP_S[tierOf(event)]
}

/** The two colours Battle.tsx borrows for the attacker's own glow, so that
 *  colour lives in exactly one place — this file's own element table —
 *  rather than a second copy of it drifting out of sync in Battle.tsx. */
export function attackGlow(event: AttackEvent): { core: string; glow: string } {
  const theme = THEME[event.type]
  return { core: theme.core, glow: theme.glow }
}

/** The same element table, reached by type rather than by a resolved attack —
 *  what the pre-attack sortie has to go on, since it plays *before* there is
 *  an `AttackEvent` to read. */
export const elementTheme = (type: EnergyType): ElementTheme => THEME[type]

export type { ElementTheme }

export function impactDelaySeconds(event: AttackEvent): number {
  return WINDUP_S[tierOf(event)] + THEME[event.type].travel + HITSTOP_S[tierOf(event)]
}

const TAG_BASE_S = 1.05
const TAG_TIER_BONUS_S: Record<Tier, number> = { normal: 0, weak: 0.15, ko: 0.35 }

/**
 * Stable pseudo-randomness from an index.
 *
 * Particles need to look scattered rather than evenly fanned, but they also
 * have to land in the same place on every render of the same effect — a real
 * RNG would reshuffle them mid-flight on each re-render.
 */
function rand(i: number, salt = 0): number {
  const v = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

/** ±1 from the same stable source. */
const signed = (i: number, salt = 0) => rand(i, salt) * 2 - 1

interface Props {
  trigger: AttackFxTrigger | null
  /** Fires once the whole effect (impact + damage number) has faded. */
  onDone: () => void
}

const EMPTY_SHOW = { windup: false, projectile: false, spark: false, impact: false, tag: false }

export function AttackFx({ trigger, onDone }: Props) {
  const [show, setShow] = useState(EMPTY_SHOW)

  useEffect(() => {
    if (!trigger) return
    const { event } = trigger
    const theme = THEME[event.type]
    const tier = tierOf(event)
    const missed = event.missed
    const hitStop = HITSTOP_S[tier]
    const tagSeconds = TAG_BASE_S + TAG_TIER_BONUS_S[tier]
    // Every timer below is shifted by this — the whole existing sequence
    // (launch, contact, impact, clear) still plays exactly as it did, just
    // starting once the charge has gathered rather than at the trigger
    // itself.
    const windupMs = WINDUP_S[tier] * 1000

    // A miss fizzles short of the target rather than travelling the full
    // distance — see the shortened `dy` below, which uses the same fraction —
    // and has nothing to hit, so it skips the hit-stop hold entirely.
    const landAt = windupMs + (missed ? theme.travel * 0.55 : theme.travel) * 1000

    setShow({ ...EMPTY_SHOW, windup: true })

    const launch = setTimeout(() => {
      setShow({ ...EMPTY_SHOW, projectile: true })
    }, windupMs)

    const spark = setTimeout(() => {
      if (missed) {
        setShow({ ...EMPTY_SHOW, tag: true })
      } else {
        setShow({ ...EMPTY_SHOW, spark: true })
      }
    }, landAt)

    const land = missed
      ? null
      : setTimeout(() => {
          setShow({ ...EMPTY_SHOW, impact: true, tag: true })
        }, landAt + hitStop * 1000)

    const clear = setTimeout(
      () => {
        setShow(EMPTY_SHOW)
        onDone()
      },
      landAt + (missed ? 0 : hitStop * 1000) + tagSeconds * 1000,
    )

    return () => {
      clearTimeout(launch)
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
  // Which way the thing is pointing, so a teardrop noses forward and flame
  // tongues stream backwards instead of both sitting at a fixed angle.
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI

  return (
    <div className="cov-attack-fx fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      <AnimatePresence>
        {show.windup && (
          <Charge
            key="charge"
            theme={theme}
            scale={scale}
            fromX={fromX}
            fromY={fromY}
            seconds={WINDUP_S[tier]}
          />
        )}

        {show.projectile && (
          <Projectile
            key="projectile"
            theme={theme}
            scale={scale}
            fromX={fromX}
            fromY={fromY}
            dx={dx}
            dy={dy}
            angle={angle}
            missed={event.missed}
          />
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
              left: toX - 11 * scale,
              top: toY - 11 * scale,
              width: 22 * scale,
              height: 22 * scale,
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

/* ------------------------------------------------------------------ charge */

/**
 * The element gathering into the attacker's own card, just before it leaves.
 *
 * Reuses each element's own wake layers rather than a second, bespoke table
 * — the same particles the projectile sheds on its way out are drawn here
 * from the opposite direction, closing in on the card instead of trailing
 * behind it, so the charge reads as the same substance being drawn together
 * rather than an unrelated flourish stitched on first.
 *
 * Unlike `Projectile`/`Impact` below, nothing here carries an `exit` prop —
 * consistent with them: AnimatePresence only drives an exit animation on a
 * bare `motion.*` element it renders directly, not through the plain
 * function-component wrapper both this and they are, so one here would be
 * silently inert. The core is timed to peak right as this unmounts instead,
 * which is the swap into the projectile's own mount-in — an abrupt handoff
 * at the brightest instant reads as the release itself, not a cut.
 */
function Charge({
  theme,
  scale,
  fromX,
  fromY,
  seconds,
}: {
  theme: ElementTheme
  scale: number
  fromX: number
  fromY: number
  seconds: number
}) {
  const core = 34 * scale

  return (
    <span>
      {theme.wake.map((layer, layerIndex) =>
        // A little sparser than the trail it mirrors — this is a beat, not
        // the main event, and the projectile is about to spend the same
        // colours again on the way out.
        Array.from({ length: Math.ceil(layer.count * 0.6) }, (_, i) => {
          const size = layer.size * scale * 0.75
          const radius = (26 + layerIndex * 14) * scale
          const angle = rand(i, layerIndex + 31) * Math.PI * 2
          const px = Math.cos(angle) * radius
          const py = Math.sin(angle) * radius
          const color =
            layer.color === 'core' ? theme.core : layer.color === 'glow' ? theme.glow : layer.color

          return (
            <motion.span
              key={`${layerIndex}-${i}`}
              className="absolute"
              style={{
                left: fromX - size / 2,
                top: fromY - size / 2,
                width: size,
                height: size,
                borderRadius: '50%',
                background: layer.soft
                  ? `radial-gradient(circle, ${color}, transparent 70%)`
                  : color,
                boxShadow: layer.soft ? undefined : `0 0 ${4 * scale}px ${1 * scale}px ${color}`,
              }}
              initial={{ x: px, y: py, opacity: 0, scale: 0.6 }}
              animate={{ x: px * 0.12, y: py * 0.12, opacity: [0, layer.opacity, 0], scale: [0.6, 1, 0.5] }}
              transition={{
                duration: seconds,
                delay: (i / Math.max(1, layer.count)) * seconds * 0.25,
                ease: 'easeIn',
              }}
            />
          )
        }),
      )}

      {/* The aperture closing — the plainest tell that something is being
          drawn in rather than thrown out. */}
      <motion.span
        className="absolute rounded-pill"
        style={{
          left: fromX - core,
          top: fromY - core,
          width: core * 2,
          height: core * 2,
          border: `2px solid ${theme.glow}`,
        }}
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: [1.5, 0.65], opacity: [0, 0.7, 0] }}
        transition={{ duration: seconds, ease: 'easeIn' }}
      />

      {/* The core itself brightening, climaxing right where this hands off
          to the projectile's own launch. */}
      <motion.span
        className="absolute rounded-pill"
        style={{
          left: fromX - core / 2,
          top: fromY - core / 2,
          width: core,
          height: core,
          background: `radial-gradient(circle, ${theme.core}, ${theme.glow} 55%, transparent 78%)`,
        }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 0.55, 0.95], opacity: [0, 0.5, 1] }}
        transition={{ duration: seconds, ease: 'easeIn' }}
      />
    </span>
  )
}

/* --------------------------------------------------------------- in flight */

function Projectile({
  theme,
  scale,
  fromX,
  fromY,
  dx,
  dy,
  angle,
  missed,
}: {
  theme: ElementTheme
  scale: number
  fromX: number
  fromY: number
  dx: number
  dy: number
  angle: number
  missed: boolean
}) {
  const xFrames = theme.wave
    ? [0, theme.wave, -theme.wave, theme.wave * 0.4, 0]
    : theme.curve
      ? [0, theme.curve, 0]
      : undefined

  return (
    <span>
      <Wake theme={theme} scale={scale} fromX={fromX} fromY={fromY} dx={dx} dy={dy} />

      {/* A zero-size anchor carries the flight; everything the head is made
          of hangs off it, centred, so each shape can keep its own local
          animation without fighting the travel transform. */}
      <motion.div
        className="absolute"
        style={{ left: fromX, top: fromY, width: 0, height: 0 }}
        initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
        animate={{
          x: xFrames ?? dx,
          y: dy,
          opacity: missed ? [0, 1, 0] : [0, 1, 1],
          scale: missed ? [0.4, 1, 0.3] : [0.4, 1, 1],
        }}
        transition={{
          duration: theme.travel,
          ease: 'easeIn',
          x: xFrames ? { duration: theme.travel, ease: 'easeInOut' } : undefined,
        }}
      >
        <Head theme={theme} scale={scale} angle={angle} />
      </motion.div>
    </span>
  )
}

/** Everything the projectile sheds on its way across. */
function Wake({
  theme,
  scale,
  fromX,
  fromY,
  dx,
  dy,
}: {
  theme: ElementTheme
  scale: number
  fromX: number
  fromY: number
  dx: number
  dy: number
}) {
  return (
    <>
      {theme.wake.map((layer, layerIndex) =>
        Array.from({ length: layer.count }, (_, i) => {
          // Where along the path this particle comes off — and, being the
          // same number, when.
          const f = (i + 0.5) / layer.count
          const size = layer.size * scale
          const px = dx * f
          const py = dy * f
          const color =
            layer.color === 'core' ? theme.core : layer.color === 'glow' ? theme.glow : layer.color

          return (
            <motion.span
              key={`${layerIndex}-${i}`}
              className="absolute"
              style={{
                left: fromX - size / 2,
                top: fromY - size / 2,
                width: size,
                height: size,
                borderRadius: '50%',
                background: layer.soft
                  ? `radial-gradient(circle, ${color}, transparent 70%)`
                  : color,
                boxShadow: layer.soft ? undefined : `0 0 ${5 * scale}px ${1.5 * scale}px ${color}`,
              }}
              initial={{ x: px, y: py, opacity: 0, scale: 0.7, rotate: 0 }}
              animate={{
                x: px + signed(i, layerIndex) * layer.driftX * scale,
                y: py + layer.driftY * scale * (0.6 + rand(i, layerIndex + 5) * 0.8),
                opacity: [0, layer.opacity, 0],
                scale: [0.7, 1, layer.grow],
                rotate: layer.spin ? signed(i, layerIndex + 9) * layer.spin : 0,
              }}
              transition={{ duration: layer.life, delay: f * theme.travel, ease: 'easeOut' }}
            />
          )
        }),
      )}
    </>
  )
}

/** The thing actually being thrown, built per element. */
/**
 * The projectile's nose — the element's own signature shape.
 *
 * Exported because the pre-attack sortie (see AttackSortie.tsx) orbits the
 * same shapes around the card as it flies, so an element reads as itself
 * whether it is being gathered, carried or thrown. Positioned around its
 * parent's own origin, so a caller places it by placing that parent.
 */
export function Head({ theme, scale, angle }: { theme: ElementTheme; scale: number; angle: number }) {
  const box = (size: number, extra?: CSSProperties): CSSProperties => ({
    position: 'absolute',
    left: -size / 2,
    top: -size / 2,
    width: size,
    height: size,
    ...extra,
  })

  switch (theme.head) {
    case 'comet': {
      const flame = 26 * scale
      return (
        <>
          {/* Two tongues streaming off the back, flickering out of step so
              the flame never reads as a rigid shape being dragged along.
              The rotation lives on a plain wrapper and the flicker on the
              child: framer composes scale *after* rotate, so animating
              scaleX on the rotated element itself would stretch it across
              the screen rather than along the flame. */}
          {[0, 1].map((i) => (
            <span
              key={i}
              style={box(flame, {
                transform: `rotate(${angle}deg) translateX(${-flame * 0.42}px)`,
              })}
            >
              <motion.span
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${theme.glow}, transparent 72%)`,
                }}
                animate={{
                  scaleX: [1.7, 2.4, 1.8],
                  scaleY: [0.5, 0.36, 0.54],
                  opacity: [0.85, 0.6, 0.85],
                }}
                transition={{ duration: 0.16 + i * 0.05, repeat: Infinity, repeatType: 'mirror' }}
              />
            </span>
          ))}
          <motion.span
            style={box(20 * scale, {
              borderRadius: '50%',
              background: `radial-gradient(circle, ${theme.core} 20%, ${theme.glow} 60%, transparent 75%)`,
            })}
            animate={{ scale: [1, 1.14, 1] }}
            transition={{ duration: 0.18, repeat: Infinity, repeatType: 'mirror' }}
          />
          <span
            style={box(9 * scale, {
              borderRadius: '50%',
              background: '#fff6dc',
              boxShadow: `0 0 ${12 * scale}px ${4 * scale}px ${theme.glow}`,
            })}
          />
        </>
      )
    }

    case 'droplet': {
      const d = 22 * scale
      return (
        <>
          <span
            style={box(d, {
              // Three round corners and one sharp one: a teardrop, turned to
              // nose along its own direction of travel. The sharp corner is
              // the bottom-left one, which points 135° by default, so the
              // rotation that aims it down the path is `angle` less that.
              borderRadius: '50% 50% 50% 0',
              transform: `rotate(${angle - 135}deg)`,
              background: `linear-gradient(140deg, ${theme.core}, ${theme.glow})`,
              boxShadow: `0 0 ${14 * scale}px ${5 * scale}px ${theme.glow}`,
            })}
          />
          {/* The highlight that makes it read as a water surface rather than
              a blue shape. */}
          <span
            style={box(6 * scale, {
              borderRadius: '50%',
              background: 'rgba(255,255,255,.85)',
              transform: `translate(${-3 * scale}px, ${-4 * scale}px)`,
            })}
          />
        </>
      )
    }

    case 'star': {
      // Long enough to read as a flare rather than as a rim on the core:
      // the halo below is already 30 units across, so anything much under
      // twice that just disappears into it.
      const bar = 72 * scale
      return (
        <>
          {/* The four-point flare. Rotation on the wrapper, pulse on the
              child, for the same transform-order reason as the comet's
              tongues above. */}
          {[0, 90].map((r) => (
            <span
              key={r}
              style={box(bar, { height: 2.5 * scale, top: -1.25 * scale, transform: `rotate(${r}deg)` })}
            >
              <motion.span
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: `linear-gradient(90deg, transparent, ${theme.core}, transparent)`,
                }}
                animate={{ scaleX: [0.8, 1.2, 0.8], opacity: [0.75, 1, 0.75] }}
                transition={{ duration: 0.3, repeat: Infinity, repeatType: 'mirror' }}
              />
            </span>
          ))}
          <span
            style={box(24 * scale, {
              borderRadius: '50%',
              background: `radial-gradient(circle, ${theme.core} 25%, ${theme.glow} 55%, transparent 72%)`,
            })}
          />
          <motion.span
            style={box(30 * scale, {
              borderRadius: '50%',
              border: `${1.5 * scale}px solid ${theme.glow}`,
            })}
            animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.7, 0.3, 0.7] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: 'mirror' }}
          />
        </>
      )
    }

    case 'boulder': {
      // Three chunks tumbling at their own rates — one rock spinning on its
      // own reads as a sprite; three reads as debris.
      // Pulled far enough apart to keep three readable silhouettes, and
      // struck in three different tones with a dark seam around each: a
      // cluster of one colour at one size just merges back into a single
      // lumpy ball, which is the thing this is meant not to be.
      const chunks = [
        { s: 22, x: -15, y: -11, spin: 300, radius: '46% 58% 42% 54%', lit: '#f6ecc8', mid: '#b39c66' },
        { s: 16, x: 16, y: 9, spin: -380, radius: '58% 42% 60% 40%', lit: '#d9c79a', mid: '#8f7c4c' },
        { s: 13, x: -5, y: 18, spin: 260, radius: '40% 62% 48% 56%', lit: '#efe0b0', mid: '#a28c58' },
      ]
      return (
        <>
          {/* Dust already hanging around the cluster, so the rock has
              something to read against on a mat this close to its own
              colour. */}
          <span
            style={box(46 * scale, {
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(150,130,95,.5), transparent 70%)`,
            })}
          />
          {/* Offset on the wrapper, tumble on the child. Framer owns the
              whole `transform` property on anything it animates, so a static
              translate sitting beside an animated `rotate` is simply
              discarded — which stacked all three chunks on the same point
              and turned the cluster back into one lump. */}
          {chunks.map((c, i) => (
            <span key={i} style={box(c.s * scale, { transform: `translate(${c.x * scale}px, ${c.y * scale}px)` })}>
              <motion.span
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  borderRadius: c.radius,
                  background: `linear-gradient(150deg, ${c.lit}, ${c.mid} 52%, #4a3d22)`,
                  border: `${Math.max(1, scale * 0.7)}px solid rgba(38,30,15,.65)`,
                  boxShadow: `0 ${2 * scale}px ${5 * scale}px rgba(0,0,0,.6)`,
                }}
                animate={{ rotate: c.spin }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
              />
            </span>
          ))}
        </>
      )
    }

    case 'wisp': {
      return (
        <>
          <motion.span
            style={box(26 * scale, {
              borderRadius: '50%',
              background: `radial-gradient(circle, ${theme.core} 15%, ${theme.glow} 50%, transparent 72%)`,
            })}
            // Breathing rather than spinning: a wisp has no fixed body, so
            // its silhouette should never hold still long enough to read as
            // one.
            animate={{ scaleX: [1, 0.78, 1.08, 1], scaleY: [1, 1.18, 0.9, 1], opacity: [0.9, 1, 0.85, 0.9] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Motes orbiting the wisp, each on its own ring. */}
          <motion.span
            style={box(30 * scale)}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          >
            {[0, 120, 240].map((deg, i) => (
              <span
                key={deg}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 4 * scale,
                  height: 4 * scale,
                  marginLeft: -2 * scale,
                  marginTop: -2 * scale,
                  borderRadius: '50%',
                  background: theme.core,
                  boxShadow: `0 0 ${6 * scale}px ${2 * scale}px ${theme.glow}`,
                  transform: `rotate(${deg}deg) translateX(${(11 + i * 2) * scale}px)`,
                }}
              />
            ))}
          </motion.span>
        </>
      )
    }

    case 'void': {
      // Long enough to stream well clear of the corona below, or the
      // tendrils just read as fuzz around the hole.
      const tail = 46 * scale
      return (
        <>
          {/* Tendrils dragging behind, splayed either side of the line of
              travel and writhing slightly. Each is anchored at the head and
              rotated to point back down the path, so growing it means
              growing it *backwards* — hence the origin at the near end on
              both the wrapper and the child. */}
          {[-22, 0, 22].map((offset, i) => (
            <span
              key={offset}
              style={{
                position: 'absolute',
                left: 0,
                top: -1.8 * scale,
                width: tail,
                height: 3.6 * scale,
                transformOrigin: '0% 50%',
                transform: `rotate(${angle + 180 + offset}deg)`,
              }}
            >
              <motion.span
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  transformOrigin: '0% 50%',
                  background: `linear-gradient(90deg, ${theme.core}, #7d63a8 40%, transparent)`,
                }}
                animate={{ scaleX: [0.7, 1.15, 0.85], opacity: [0.55, 0.95, 0.55] }}
                transition={{ duration: 0.24 + i * 0.06, repeat: Infinity, repeatType: 'mirror' }}
              />
            </span>
          ))}
          <motion.span
            style={box(28 * scale, {
              borderRadius: '50%',
              background: `radial-gradient(circle, transparent 34%, ${theme.glow} 52%, transparent 74%)`,
            })}
            animate={{ scale: [0.94, 1.1, 0.94] }}
            transition={{ duration: 0.4, repeat: Infinity, repeatType: 'mirror' }}
          />
          {/* The void itself: a hole, not a highlight. */}
          <span
            style={box(13 * scale, {
              borderRadius: '50%',
              background: '#0b0810',
              boxShadow: `0 0 ${10 * scale}px ${3 * scale}px ${theme.glow}`,
            })}
          />
        </>
      )
    }
  }
}

/* ---------------------------------------------------------------- landing */

/** Full-screen colour pulse under every impact — subtle for a routine hit,
 *  unmissable for a knockout. */
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
        <Ring x={x} y={y} size={22 * scale} to={3.4} color="var(--gold-bright)" width={2.5 * scale} seconds={0.5} />
      )}

      <ImpactShape x={x} y={y} theme={theme} scale={scale} />
    </>
  )
}

function ImpactShape({
  x,
  y,
  theme,
  scale,
}: {
  x: number
  y: number
  theme: ElementTheme
  scale: number
}) {
  switch (theme.head) {
    case 'comet':
      return (
        <>
          <Flash x={x} y={y} size={22 * scale} to={2.7} color={theme.core} glow={theme.glow} scale={scale} />
          <Ring x={x} y={y} size={20 * scale} to={3.2} color={theme.glow} width={3 * scale} seconds={0.45} />
          {/* Embers thrown clear of the blast, arcing as they cool. */}
          <Debris
            x={x}
            y={y}
            count={12}
            size={5 * scale}
            reach={62 * scale}
            fall={34 * scale}
            color={theme.core}
            glow={theme.glow}
            seconds={0.65}
            scale={scale}
          />
          {/* Smoke rises after, and outlives everything else in the frame —
              the last thing left of a fire hit should be what it left behind. */}
          <Puffs
            x={x}
            y={y}
            count={5}
            size={26 * scale}
            spread={26 * scale}
            rise={-40 * scale}
            grow={2.6}
            color="rgba(74,60,52,.85)"
            seconds={0.95}
          />
        </>
      )

    case 'droplet':
      return (
        <>
          <Flash x={x} y={y} size={18 * scale} to={2} color={theme.core} glow={theme.glow} scale={scale} />
          {[0, 1, 2].map((i) => (
            <Ring
              key={i}
              x={x}
              y={y}
              size={18 * scale}
              to={3.6}
              color={theme.glow}
              width={2.5 * scale}
              seconds={0.65}
              delay={i * 0.12}
            />
          ))}
          {/* The crown: droplets thrown up and out, then pulled back down. */}
          <Debris
            x={x}
            y={y}
            count={10}
            size={6 * scale}
            reach={54 * scale}
            fall={46 * scale}
            color={theme.core}
            glow={theme.glow}
            seconds={0.7}
            scale={scale}
            arc
          />
          <Puffs
            x={x}
            y={y}
            count={3}
            size={24 * scale}
            spread={18 * scale}
            rise={-8 * scale}
            grow={2.2}
            color="rgba(168,214,238,.7)"
            seconds={0.6}
          />
        </>
      )

    case 'star':
      return (
        <>
          <Flash x={x} y={y} size={22 * scale} to={3} color={theme.core} glow={theme.glow} scale={scale} />
          <Ring x={x} y={y} size={24 * scale} to={3.8} color={theme.core} width={2 * scale} seconds={0.55} />
          {/* Shards of light thrown out along fixed spokes rather than
              scattered — light radiates, it does not spray. */}
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className="absolute"
              style={{
                left: x,
                top: y - 1.5 * scale,
                width: 30 * scale,
                height: 3 * scale,
                transformOrigin: '0% 50%',
                transform: `rotate(${i * 45}deg)`,
              }}
            >
              <motion.span
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  transformOrigin: '0% 50%',
                  background: `linear-gradient(90deg, ${theme.core}, transparent)`,
                }}
                initial={{ scaleX: 0.2, opacity: 0 }}
                animate={{ scaleX: [0.2, 1.6, 1], opacity: [0, 1, 0] }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            </span>
          ))}
          <Debris
            x={x}
            y={y}
            count={12}
            size={4 * scale}
            reach={56 * scale}
            fall={-10 * scale}
            color={theme.core}
            glow={theme.glow}
            seconds={0.55}
            scale={scale}
          />
        </>
      )

    case 'boulder':
      return (
        <>
          <Flash x={x} y={y} size={26 * scale} to={1.8} color={theme.core} glow={theme.glow} scale={scale} />
          {/* A crater rather than a halo: flattened, because the ground it
              implies is not facing the camera. */}
          <motion.span
            className="absolute"
            style={{
              left: x - 22 * scale,
              top: y - 8 * scale,
              width: 44 * scale,
              height: 16 * scale,
              borderRadius: '50%',
              border: `${3 * scale}px solid ${theme.glow}`,
            }}
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          {/* Rock, thrown hard and dropping fast. */}
          <Debris
            x={x}
            y={y}
            count={9}
            size={7 * scale}
            reach={56 * scale}
            fall={58 * scale}
            color={theme.glow}
            glow="rgba(75,63,38,.9)"
            seconds={0.7}
            scale={scale}
            arc
            chunky
          />
          <Puffs
            x={x}
            y={y}
            count={6}
            size={28 * scale}
            spread={34 * scale}
            rise={-14 * scale}
            grow={2.9}
            color="rgba(150,130,95,.85)"
            seconds={0.85}
          />
        </>
      )

    case 'wisp':
      return (
        <>
          {/* Everything about this one runs inward first: the ring collapses
              onto the point before the bloom pushes back out of it. */}
          <motion.span
            className="absolute"
            style={{
              left: x - 35 * scale,
              top: y - 35 * scale,
              width: 70 * scale,
              height: 70 * scale,
              borderRadius: '50%',
              border: `${2.5 * scale}px solid ${theme.glow}`,
            }}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 0.2, opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.42, ease: 'easeIn' }}
          />
          <Flash x={x} y={y} size={16 * scale} to={2.4} color={theme.core} glow={theme.glow} scale={scale} delay={0.2} />
          {/* Motes pulled in, then released — the release is what reads as
              the hit actually landing. */}
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2 + rand(i, 3)
            const near = 14 * scale
            const far = 52 * scale
            return (
              <motion.span
                key={i}
                className="absolute"
                style={{
                  left: x - 2 * scale,
                  top: y - 2 * scale,
                  width: 4 * scale,
                  height: 4 * scale,
                  borderRadius: '50%',
                  background: theme.core,
                  boxShadow: `0 0 ${6 * scale}px ${2 * scale}px ${theme.glow}`,
                }}
                initial={{ x: Math.cos(a) * far, y: Math.sin(a) * far, opacity: 0 }}
                animate={{
                  x: [Math.cos(a) * far, Math.cos(a) * near, Math.cos(a) * far * 1.2],
                  y: [Math.sin(a) * far, Math.sin(a) * near, Math.sin(a) * far * 1.2 - 12 * scale],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.7, times: [0, 0.42, 1], ease: 'easeInOut' }}
              />
            )
          })}
          <Puffs
            x={x}
            y={y}
            count={3}
            size={30 * scale}
            spread={14 * scale}
            rise={-24 * scale}
            grow={2}
            color="rgba(142,111,176,.7)"
            seconds={0.75}
            delay={0.18}
          />
        </>
      )

    case 'void':
      return (
        <>
          <Flash x={x} y={y} size={20 * scale} to={2.2} color={theme.core} glow={theme.glow} scale={scale} />
          {/* Bolts, brighter and more numerous than the projectile's own
              tendrils, thrown at hard angles. */}
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="absolute"
              style={{
                left: x - 1.6 * Math.sqrt(scale),
                top: y - 18 * scale,
                width: 3.2 * Math.sqrt(scale),
                height: 36 * scale,
                transform: `rotate(${i * 42 - 63}deg)`,
              }}
            >
              <motion.span
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  background: theme.core,
                  boxShadow: `0 0 ${9 * scale}px ${3 * scale}px ${theme.glow}`,
                }}
                initial={{ opacity: 0, scaleY: 0.3 }}
                animate={{ opacity: [0, 1, 0], scaleY: [0.3, 1, 0.6] }}
                transition={{ duration: 0.26, delay: i * 0.03, ease: 'easeOut' }}
              />
            </span>
          ))}
          {/* Dark closing over the point after the bolts have gone. */}
          <motion.span
            className="absolute"
            style={{
              left: x - 30 * scale,
              top: y - 30 * scale,
              width: 60 * scale,
              height: 60 * scale,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(11,8,16,.9), transparent 70%)',
            }}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: [1.5, 0.6, 1.1], opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
          />
          <Debris
            x={x}
            y={y}
            count={7}
            size={4 * scale}
            reach={48 * scale}
            fall={-6 * scale}
            color={theme.core}
            glow={theme.glow}
            seconds={0.5}
            scale={scale}
          />
        </>
      )
  }
}

/* ------------------------------------------------------------- primitives */

/** The bright core of an impact, blowing outward and fading. */
function Flash({
  x,
  y,
  size,
  to,
  color,
  glow,
  scale,
  delay = 0,
}: {
  x: number
  y: number
  size: number
  to: number
  color: string
  glow: string
  scale: number
  delay?: number
}) {
  return (
    <motion.span
      className="absolute"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 ${18 * scale}px ${6 * scale}px ${glow}`,
      }}
      initial={{ scale: 0.3, opacity: 0.95 }}
      animate={{ scale: to, opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
    />
  )
}

/** An expanding hoop. */
function Ring({
  x,
  y,
  size,
  to,
  color,
  width,
  seconds,
  delay = 0,
}: {
  x: number
  y: number
  size: number
  to: number
  color: string
  width: number
  seconds: number
  delay?: number
}) {
  return (
    <motion.span
      className="absolute"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${width}px solid ${color}`,
      }}
      initial={{ scale: 0.4, opacity: 0.9 }}
      animate={{ scale: to, opacity: 0 }}
      transition={{ duration: seconds, ease: 'easeOut', delay }}
    />
  )
}

/** Bits thrown outward from a hit — embers, droplets, rock. `arc` gives them
 *  a rise before the fall; `chunky` makes them tumbling shards instead of
 *  round sparks. */
function Debris({
  x,
  y,
  count,
  size,
  reach,
  fall,
  color,
  glow,
  seconds,
  scale,
  arc,
  chunky,
}: {
  x: number
  y: number
  count: number
  size: number
  reach: number
  fall: number
  color: string
  glow: string
  seconds: number
  scale: number
  arc?: boolean
  chunky?: boolean
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + signed(i, 1) * 0.35
        const dist = reach * (0.55 + rand(i, 2) * 0.65)
        const ex = Math.cos(a) * dist
        const ey = Math.sin(a) * dist * 0.7

        return (
          <motion.span
            key={i}
            className="absolute"
            style={{
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: chunky ? '46% 58% 42% 54%' : '50%',
              background: chunky ? `linear-gradient(150deg, ${color}, ${glow})` : color,
              boxShadow: chunky ? undefined : `0 0 ${5 * scale}px ${1.5 * scale}px ${glow}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 1, rotate: 0 }}
            animate={{
              x: ex,
              // With `arc` the piece rises before gravity takes it, which is
              // what separates a splash from a spray.
              y: arc ? [0, ey - fall * 0.55, ey + fall] : [0, ey * 0.7, ey + fall],
              opacity: [0, 1, 0],
              scale: [1, 1, chunky ? 0.7 : 0.4],
              rotate: chunky ? signed(i, 4) * 300 : 0,
            }}
            transition={{ duration: seconds, ease: 'easeOut' }}
          />
        )
      })}
    </>
  )
}

/** Soft, slow, expanding clouds — smoke, dust, mist, the things that outlast
 *  the hit itself. */
function Puffs({
  x,
  y,
  count,
  size,
  spread,
  rise,
  grow,
  color,
  seconds,
  delay = 0,
}: {
  x: number
  y: number
  count: number
  size: number
  spread: number
  rise: number
  grow: number
  color: string
  seconds: number
  delay?: number
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{
            left: x - size / 2,
            top: y - size / 2,
            width: size,
            height: size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color}, transparent 70%)`,
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
          animate={{
            x: signed(i, 6) * spread,
            y: rise * (0.5 + rand(i, 7)),
            opacity: [0, 0.9, 0],
            scale: [0.5, grow * 0.7, grow],
          }}
          transition={{ duration: seconds, ease: 'easeOut', delay: delay + i * 0.04 }}
        />
      ))}
    </>
  )
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
