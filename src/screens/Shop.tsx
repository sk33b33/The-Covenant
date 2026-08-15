import { PackWrapper } from '@/art/PackWrapper'
import { BackIcon, GraceIcon, TalentIcon } from '@/art/icons'
import { Button, Chip, Panel } from '@/components/ui'
import { GENESIS } from '@/data/sets'
import { ECONOMY } from '@/game/config'
import { formatCountdown, resolveSlots } from '@/game/packTimer'
import { useEconomy } from '@/store/economy'
import { useNav } from '@/store/nav'
import { useNow } from '@/hooks/useNow'

/**
 * The shop.
 *
 * Two things are for sale and both are bought with currency the game gives you
 * for playing: packs for Talents, and a pack slot refill for Grace. There is no
 * real-money tier and nothing here is time-limited — the free two-a-day is the
 * spine of the economy, and this is the pressure valve for a player who wants
 * to open more in one sitting.
 */
export function Shop() {
  const back = useNav((s) => s.back)
  const go = useNav((s) => s.go)
  const economy = useEconomy()
  const refillWithGrace = useEconomy((s) => s.refillWithGrace)
  const now = useNow(1000)

  const slots = resolveSlots(economy, now)
  const canAfford = economy.talents >= ECONOMY.TALENTS_PER_PACK
  const canRefill = !slots.isFull && economy.grace >= ECONOMY.GRACE_PER_SLOT

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-app px-4 pt-safe pb-tabbar">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={back}
            className="neu w-10 h-10 rounded-pill grid place-items-center text-ink-muted shrink-0"
            aria-label="Back"
          >
            <BackIcon size={20} />
          </button>
          <h1 className="font-display text-lg tracking-wide flex-1">Shop</h1>
          <Chip icon={<TalentIcon size={15} />} className="text-xs tabular-nums">
            {economy.talents.toLocaleString()}
          </Chip>
          <Chip icon={<GraceIcon size={15} />} className="text-xs tabular-nums">
            {economy.grace}
          </Chip>
        </div>

        {/* ------------------------------------------------------- refill */}
        <Panel className="mt-4 p-4">
          <div className="flex items-start gap-3">
            <span
              className="grid place-items-center w-11 h-11 rounded-pill shrink-0"
              style={{ background: 'var(--gold-pale)', color: 'var(--gold-deep)' }}
            >
              <GraceIcon size={22} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-md">Refill a pack slot</h2>
              <p className="text-xs text-ink-muted mt-1">
                {slots.isFull
                  ? 'Both slots are already full.'
                  : `Skip the wait. Next slot fills on its own in ${formatCountdown(slots.msUntilNext)}.`}
              </p>
            </div>
          </div>

          <Button
            block
            className="mt-3"
            disabled={!canRefill}
            onClick={() => refillWithGrace()}
            variant={canRefill ? 'gold' : 'sunk'}
          >
            {slots.isFull
              ? 'Slots full'
              : economy.grace < ECONOMY.GRACE_PER_SLOT
                ? `Need ${ECONOMY.GRACE_PER_SLOT} Grace`
                : `Refill for ${ECONOMY.GRACE_PER_SLOT} Grace`}
          </Button>
        </Panel>

        {/* -------------------------------------------------------- packs */}
        <h2 className="font-display text-md mt-6 mb-3 px-1">Booster packs</h2>

        <div className="space-y-3">
          {GENESIS.packs.map((pack) => (
            <Panel key={pack.id} className="p-3">
              <div className="flex items-center gap-4">
                <div className="w-[86px] shrink-0">
                  <PackWrapper pack={pack} setCode={GENESIS.code} />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-md">{pack.name}</h3>
                  <p className="text-xs text-ink-muted mt-0.5 leading-snug">{pack.tagline}</p>

                  <Button
                    className="mt-2.5 !px-4 !py-2 text-sm"
                    variant={canAfford ? 'raised' : 'sunk'}
                    disabled={!canAfford}
                    onClick={() => go({ name: 'pack-open', packId: pack.id, source: 'talents' })}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <TalentIcon size={14} />
                      {ECONOMY.TALENTS_PER_PACK}
                    </span>
                  </Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>

        {!canAfford && (
          <p className="text-xs text-ink-muted text-center mt-4 px-6">
            Talents come from battles, missions, story first-clears and duplicate cards.
          </p>
        )}
      </div>
    </div>
  )
}
