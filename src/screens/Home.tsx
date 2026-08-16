import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { PackWrapper } from '@/art/PackWrapper'
import {
  BinderIcon,
  GiftIcon,
  GraceIcon,
  MailIcon,
  ScrollIcon,
  ShopIcon,
  TalentIcon,
  TreeMark,
} from '@/art/icons'
import { Badge, Button, Chip, Panel, Progress } from '@/components/ui'
import { GENESIS } from '@/data/sets'
import { ECONOMY } from '@/game/config'
import { formatCountdown, resolveSlots } from '@/game/packTimer'
import { useEconomy } from '@/store/economy'
import { useNav } from '@/store/nav'
import { levelProgress, useProfile } from '@/store/profile'
import { useNow } from '@/hooks/useNow'
import { cx } from '@/lib/cx'

/**
 * The home hub.
 *
 * Layout follows the reference: a status header, a hero panel holding the pack
 * carousel and its refill timer, a row of destination tiles, and a floating
 * missions button. What differs is the palette and the fact that the hero panel
 * is where the free-pack economy is legible at a glance — slots, countdown and
 * Grace all sit together rather than being scattered.
 */
export function Home() {
  const go = useNav((s) => s.go)
  const profile = useProfile()
  const economy = useEconomy()
  const tick = useEconomy((s) => s.tick)
  const now = useNow(1000)

  // Roll any slots that completed while the app was closed or backgrounded.
  useEffect(() => {
    tick()
  }, [tick, now])

  const slots = resolveSlots(economy, now)
  const packs = GENESIS.packs
  const [active, setActive] = useState(1)

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-app px-4 pt-safe pb-tabbar">
        <Header />

        {/* ---------------------------------------------------- hero panel */}
        <Panel className="mt-4 overflow-hidden">
          <div
            className="px-4 pt-4 pb-3"
            style={{
              background:
                'linear-gradient(160deg, var(--gold-pale) 0%, transparent 62%), var(--surface)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <Chip icon={<BinderIcon size={15} />} className="text-xs">
                {GENESIS.name} · {GENESIS.code}
              </Chip>
              <button
                onClick={() => go({ name: 'shop' })}
                className="flex items-center gap-1.5 text-xs text-ink-muted"
              >
                <ShopIcon size={16} />
                Shop
              </button>
            </div>

            <PackCarousel packs={packs} active={active} onActive={setActive} />
          </div>

          {/* Free-pack economy: slots, countdown and Grace in one row. */}
          <div className="px-4 py-3 border-t border-[var(--gold-pale)]">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" aria-label={`${slots.slots} free packs ready`}>
                {Array.from({ length: ECONOMY.PACK_SLOTS }, (_, i) => (
                  <span
                    key={i}
                    className={cx(
                      'w-7 h-9 rounded-sm border transition-colors',
                      i < slots.slots
                        ? 'border-[var(--gold)] shadow-raised-sm'
                        : 'border-[var(--gold-pale)] opacity-45',
                    )}
                    style={
                      i < slots.slots
                        ? { background: 'var(--gold-leaf)' }
                        : { background: 'var(--bg-sunk)' }
                    }
                  />
                ))}
              </div>

              <div className="flex-1 min-w-0">
                <Progress
                  value={
                    slots.isFull
                      ? 1
                      : 1 - slots.msUntilNext / ECONOMY.SLOT_REFILL_MS
                  }
                  label="Next free pack"
                />
                <p className="text-xs text-ink-muted mt-1.5 tabular-nums">
                  {slots.isFull
                    ? 'Both packs ready'
                    : `Next pack in ${formatCountdown(slots.msUntilNext)}`}
                </p>
              </div>

              <Chip icon={<GraceIcon size={15} />} sunk className="text-xs">
                {economy.grace}
              </Chip>
            </div>

            <Button
              variant="gold"
              block
              className="mt-3"
              disabled={slots.slots <= 0}
              onClick={() =>
                go({ name: 'pack-open', packId: packs[active]!.id, source: 'free' })
              }
            >
              {slots.slots > 0
                ? `Open ${packs[active]!.name}`
                : `Next pack in ${formatCountdown(slots.msUntilNext)}`}
            </Button>
          </div>
        </Panel>

        {/* -------------------------------------------------------- tiles */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Tile
            icon={<ScrollIcon size={30} />}
            label="Story"
            sub="Genesis"
            tint="var(--energy-light)"
            onClick={() => go({ name: 'story-map' })}
          />
          <Tile
            icon={<ShopIcon size={30} />}
            label="Shop"
            sub={`${economy.talents} Talents`}
            tint="var(--energy-water)"
            onClick={() => go({ name: 'shop' })}
          />
        </div>

        <p className="text-center text-xs text-ink-faint mt-6">
          {profile.packsOpened} packs opened · {profile.battlesWon}/{profile.battlesPlayed} battles
          won
        </p>
      </div>

      {/* Missions floats above the tab bar, as in the reference. */}
      <button
        onClick={() => go({ name: 'missions' })}
        className="fixed right-4 z-30 neu rounded-pill w-16 h-16 grid place-items-center"
        // Matches .pb-safe's floor, not the raw inset: the bar pads itself with
        // max(--s-3, safe-area), so on a phone reporting no inset this button
        // would otherwise sit 12px into the bar.
        style={{
          bottom: 'calc(var(--tabbar-h) + max(var(--s-3), env(safe-area-inset-bottom)) + 16px)',
        }}
        aria-label="Missions"
      >
        <ScrollIcon size={24} className="text-[var(--gold-deep)]" />
        <span className="text-[9px] font-medium mt-0.5 text-ink-muted">Missions</span>
        <Badge />
      </button>
    </div>
  )
}

/* --------------------------------------------------------------- header */

function Header() {
  const profile = useProfile()
  const economy = useEconomy()
  const go = useNav((s) => s.go)

  return (
    // Two rows: identity and mail on top, currencies beneath. Cramming the XP
    // bar between the name and the currency chips left it reading as a stray
    // rule, and pushed the gift badge past the screen edge.
    <header className="pt-2 space-y-2.5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => go({ name: 'profile' })}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
          aria-label="Open profile"
        >
          <span
            className="grid place-items-center w-11 h-11 rounded-pill shrink-0 shadow-raised"
            style={{ background: 'var(--gold-leaf)' }}
          >
            <TreeMark size={23} className="text-[#3a2a07]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate leading-tight">
              {profile.name}
            </span>
            <span className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-ink-muted tabular-nums shrink-0">
                Lv. {profile.level}
              </span>
              <Progress
                value={levelProgress(profile.level, profile.xp)}
                label="Experience"
                className="w-16 h-1.5"
              />
            </span>
          </span>
        </button>

        {/* pr-1 keeps the badge inside the viewport. */}
        <div className="flex gap-1.5 pr-1">
          <IconButton label="Mail">
            <MailIcon size={19} />
          </IconButton>
          <IconButton label="Gifts" badge>
            <GiftIcon size={19} />
          </IconButton>
        </div>
      </div>

      <div className="flex gap-2">
        <Chip icon={<TalentIcon size={15} />} className="text-xs tabular-nums">
          {economy.talents.toLocaleString()}
        </Chip>
        <Chip icon={<GraceIcon size={15} />} className="text-xs tabular-nums">
          {economy.grace}
        </Chip>
      </div>
    </header>
  )
}

function IconButton({
  children,
  label,
  badge,
}: {
  children: React.ReactNode
  label: string
  badge?: boolean
}) {
  return (
    <button
      className="relative neu w-9 h-9 rounded-pill grid place-items-center text-ink-muted"
      aria-label={label}
    >
      {children}
      {badge && <Badge />}
    </button>
  )
}

/* -------------------------------------------------------- pack carousel */

/**
 * The packs on a turning ring.
 *
 * Each pack is parked at its own angle on a cylinder and only the ring itself
 * rotates, so three packs move because their parent turned rather than because
 * three transforms were recalculated. Drag it far enough and it keeps going —
 * past the back and round to the front again, which a flat scroller with two
 * ends could never do.
 */
function PackCarousel({
  packs,
  active,
  onActive,
}: {
  packs: typeof GENESIS.packs
  active: number
  onActive: (i: number) => void
}) {
  const ringRef = useRef<HTMLDivElement>(null)
  const step = 360 / packs.length

  // The ring's angle in degrees, unbounded in both directions: it is allowed to
  // wind past 360 and keep counting, which is what lets a long drag spin
  // through several full turns instead of stopping at an end.
  const angle = useMotionValue(0)
  // Stiff and just under critically damped. A softer spring reads as lag while
  // the finger is down — the ring trailing behind the drag by a tenth of a
  // second — which is the exact complaint the card tilt was rebuilt to fix.
  // This settles in about 60ms with a hair of overshoot on release.
  const spring = useSpring(angle, { stiffness: 420, damping: 30, mass: 0.9 })
  // A spring is animated in JavaScript, so the stylesheet's reduced-motion rule
  // cannot reach it. Reading the raw value instead makes every spin land
  // instantly rather than travelling.
  const reduce = useReducedMotion()
  const spun = reduce ? angle : spring

  const drag = useRef<{ x: number; from: number; moved: boolean } | null>(null)
  // A drag that ends over a pack still fires that pack's click. Without this
  // the ring would snap where you released it and then immediately spin
  // somewhere else, which reads as the carousel fighting you.
  const dragged = useRef(false)

  // Kept in a ref so the frame subscription below can compare against it
  // without being torn down and rebuilt every time the centred pack changes.
  const activeRef = useRef(active)
  activeRef.current = active

  /**
   * Writes the ring's angle and each pack's facing onto the elements directly.
   *
   * Not React state — this runs on every frame of a drag, and a setState per
   * frame would re-render the whole hub. The same discipline the card tilt is
   * built on. React is told only which pack is *front*, which changes a few
   * times per spin rather than sixty times a second.
   */
  useEffect(() => {
    const paint = (deg: number) => {
      const ring = ringRef.current
      if (!ring) return
      ring.style.setProperty('--ring-rot', `${deg}deg`)

      let front = 0
      let best = Infinity

      Array.from(ring.children).forEach((el, i) => {
        // How far this pack is from facing the viewer, folded into -180..180 so
        // the pack that has just gone round the back reads as near, not as 359
        // degrees away.
        const raw = (((i * step + deg) % 360) + 540) % 360 - 180
        const facing = Math.min(Math.abs(raw) / 90, 1)
        const node = el as HTMLElement
        node.style.setProperty('--pack-d', String(facing))
        // The counter-rotation that keeps this pack facing the camera. It has
        // to be the total angle, ring included, so it can only be written here.
        node.style.setProperty('--pack-face', `${raw}deg`)

        if (Math.abs(raw) < best) {
          best = Math.abs(raw)
          front = i
        }
      })

      if (front !== activeRef.current) {
        activeRef.current = front
        onActive(front)
      }
    }

    paint(spun.get())
    return spun.on('change', paint)
  }, [spun, step, onActive])

  const spinTo = (i: number) => {
    // Take the short way round rather than unwinding through the others.
    const current = angle.get()
    const target = -i * step
    angle.set(current + (((target - current + 540) % 360) - 180))
  }

  return (
    <div>
      <div
        className="cov-ring-stage"
        // Derived from the pack count rather than hardcoded at 120, so a fourth
        // pack lands on the ring correctly without touching the stylesheet.
        style={{ '--ring-step': `${step}deg` } as React.CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragged.current = false
          drag.current = { x: e.clientX, from: angle.get(), moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          // Below the threshold this is still a tap on a pack, not a spin.
          if (Math.abs(dx) > 8) d.moved = true
          // A drag across the stage's full width turns the ring most of a
          // half-turn, which makes reaching the pack behind you one gesture.
          const width = e.currentTarget.clientWidth || 1
          angle.set(d.from + (dx / width) * 150)
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          dragged.current = drag.current?.moved ?? false
          drag.current = null
          // Settle on whichever pack ended up nearest the front, keeping the
          // accumulated winding so a spin never jumps back to where it began.
          angle.set(Math.round(angle.get() / step) * step)
        }}
        onPointerCancel={() => {
          dragged.current = drag.current?.moved ?? false
          drag.current = null
          angle.set(Math.round(angle.get() / step) * step)
        }}
      >
        <div ref={ringRef} className="cov-ring">
          {packs.map((pack, i) => (
            <button
              key={pack.id}
              onClick={(e) => {
                // `detail` is 0 when a button is activated from the keyboard,
                // which no drag can have preceded — so the guard applies to
                // real pointer clicks only.
                if (dragged.current && e.detail > 0) return
                if (i !== active) spinTo(i)
              }}
              className="cov-ring-pack"
              style={{ '--pack-i': i } as React.CSSProperties}
              aria-label={`${pack.name} pack`}
              aria-current={i === active ? 'true' : undefined}
            >
              <PackWrapper pack={pack} setCode={GENESIS.code} />
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-ink-muted mt-2.5 px-2 min-h-[2.4em]">
        {packs[active]?.tagline}
      </p>

      <div className="flex justify-center gap-1.5 mt-1">
        {packs.map((p, i) => (
          <button
            key={p.id}
            onClick={() => spinTo(i)}
            aria-label={`Show ${p.name}`}
            className={cx(
              'h-1.5 rounded-pill transition-all duration-300',
              i === active ? 'w-5' : 'w-1.5',
            )}
            style={{
              background: i === active ? 'var(--gold)' : 'var(--gold-pale)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ tile */

function Tile({
  icon,
  label,
  sub,
  tint,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  tint: string
  onClick: () => void
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="neu rounded-lg p-4 text-left overflow-hidden relative"
    >
      <span
        className="absolute inset-0 opacity-[0.13] pointer-events-none"
        style={{ background: `linear-gradient(150deg, ${tint} 0%, transparent 65%)` }}
      />
      <span className="relative block text-[var(--gold-deep)]">{icon}</span>
      <span className="relative block font-display text-md mt-2.5">{label}</span>
      <span className="relative block text-xs text-ink-muted mt-0.5">{sub}</span>
    </motion.button>
  )
}
