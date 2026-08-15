import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
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
    <div className="scroll-y h-full mb-tabbar">
      <div className="mx-auto max-w-app px-4 pt-safe pb-6">
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
        style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px)' }}
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

function PackCarousel({
  packs,
  active,
  onActive,
}: {
  packs: typeof GENESIS.packs
  active: number
  onActive: (i: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  // Centre the initially-active pack without animating on first paint.
  useEffect(() => {
    const track = trackRef.current
    const child = track?.children[active] as HTMLElement | undefined
    if (!track || !child) return
    track.scrollLeft = child.offsetLeft - (track.clientWidth - child.clientWidth) / 2
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track which pack is centred as the player swipes.
  const onScroll = () => {
    const track = trackRef.current
    if (!track) return
    const centre = track.scrollLeft + track.clientWidth / 2

    let closest = 0
    let best = Infinity
    Array.from(track.children).forEach((el, i) => {
      const child = el as HTMLElement
      const d = Math.abs(child.offsetLeft + child.clientWidth / 2 - centre)
      if (d < best) {
        best = d
        closest = i
      }
    })
    if (closest !== active) onActive(closest)
  }

  const scrollTo = (i: number) => {
    const track = trackRef.current
    const child = track?.children[i] as HTMLElement | undefined
    if (!track || !child) return
    track.scrollTo({
      left: child.offsetLeft - (track.clientWidth - child.clientWidth) / 2,
      behavior: 'smooth',
    })
  }

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="scroll-x flex gap-3 -mx-4 px-4 snap-x snap-mandatory"
      >
        {packs.map((pack, i) => (
          <motion.button
            key={pack.id}
            onClick={() => scrollTo(i)}
            className="snap-center shrink-0 w-[47%] max-w-[190px] rounded-md"
            animate={{
              scale: i === active ? 1 : 0.88,
              opacity: i === active ? 1 : 0.62,
            }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: 'drop-shadow(0 12px 22px rgba(40,28,10,.45))' }}
            aria-label={`${pack.name} pack`}
          >
            <PackWrapper pack={pack} setCode={GENESIS.code} />
          </motion.button>
        ))}
      </div>

      <p className="text-center text-xs text-ink-muted mt-2.5 px-2 min-h-[2.4em]">
        {packs[active]?.tagline}
      </p>

      <div className="flex justify-center gap-1.5 mt-1">
        {packs.map((p, i) => (
          <button
            key={p.id}
            onClick={() => scrollTo(i)}
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
