import { motion } from 'framer-motion'
import { CommunityIcon, LockIcon, SocialIcon, TradeIcon } from '@/art/icons'
import { TreeGlyph } from '@/art/tree'
import { Card } from '@/components/card/Card'
import { Panel } from '@/components/ui'
import { CARDS } from '@/data/cards'
import { RARITY_ORDER } from '@/game/types'
import { useCollection } from '@/store/collection'
import { useProfile } from '@/store/profile'

/**
 * The Social Hub.
 *
 * Trading, friends and community showcases need other real players and a
 * server, neither of which this build has. Rather than mock them up as though
 * they worked, the screen says what each one will be and shows the one social
 * thing that is genuinely real offline: your own showcase, built from your best
 * cards, which is what you would share if sharing existed.
 */
export function Social() {
  const owned = useCollection((s) => s.owned)
  const profile = useProfile()

  // The showcase is the rarest handful you actually own.
  const showcase = CARDS.filter((card) => (owned[card.id] ?? 0) > 0)
    .sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || a.name.localeCompare(b.name))
    .slice(0, 3)

  return (
    <div className="scroll-y h-full mb-tabbar">
      {/* Banner, echoing the reference's angled hero. */}
      <div className="relative overflow-hidden" style={{ height: 190 }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(150deg, var(--gold-pale) 0%, var(--surface) 55%, var(--bg) 100%)',
          }}
        />
        <svg
          viewBox="0 0 390 190"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="social-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="390" y2="190">
              <stop offset="0%" stopColor="#e8cf9e" />
              <stop offset="50%" stopColor="#b08751" />
              <stop offset="100%" stopColor="#7a5a2e" />
            </linearGradient>
          </defs>
          {/* Concentric arcs: a horizon of connection, not a stock swirl. */}
          {[0.4, 0.6, 0.8, 1].map((r, i) => (
            <ellipse
              key={i}
              cx="195"
              cy="250"
              rx={200 * r}
              ry={120 * r}
              fill="none"
              stroke="url(#social-gold)"
              strokeWidth={i === 3 ? 1.6 : 0.8}
              opacity={0.35 - i * 0.05}
            />
          ))}
          <g transform="translate(195 74) scale(2.6) translate(-12 -12)">
            <TreeGlyph width={1.5 / 2.6} paint="url(#social-gold)" fruitRadius={0.9} />
          </g>
        </svg>

        <div className="absolute inset-x-0 bottom-3 text-center">
          <h1 className="font-display text-xl tracking-wide text-ink-strong">Social Hub</h1>
          <p className="text-xs text-ink-muted mt-0.5">{profile.name} · Lv. {profile.level}</p>
        </div>
      </div>

      <div className="mx-auto max-w-app px-4 pb-8 -mt-2">
        {/* ------------------------------------------------------- showcase */}
        <Panel className="p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-md">Your showcase</h2>
            <span className="text-xs text-ink-muted">Your three finest</span>
          </div>

          {showcase.length === 0 ? (
            <p className="text-xs text-ink-muted py-4 text-center">
              Open a pack and your best cards will stand here.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {showcase.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                >
                  <Card card={card} compact />
                </motion.div>
              ))}
            </div>
          )}
        </Panel>

        {/* --------------------------------------------------------- coming */}
        <h2 className="font-display text-md mt-6 mb-2 px-1">Not yet built</h2>

        <div className="space-y-2.5">
          <ComingSoon
            icon={<SocialIcon size={22} />}
            title="Friends"
            note="Adding someone by code, seeing what they are collecting, and battling them directly."
          />
          <ComingSoon
            icon={<TradeIcon size={22} />}
            title="Trading"
            note="Offering a duplicate for a card you are missing, with both sides having to agree."
          />
          <ComingSoon
            icon={<CommunityIcon size={22} />}
            title="Community showcases"
            note="Browsing other players' three finest cards, and them browsing yours."
          />
        </div>

        <p className="text-xs text-ink-muted mt-5 px-2 leading-relaxed text-center">
          All three need other real players and a server to talk to. Rather than
          mock them up as though they worked, they are named here and left honest
          until there is something behind them.
        </p>
      </div>
    </div>
  )
}

function ComingSoon({
  icon,
  title,
  note,
}: {
  icon: React.ReactNode
  title: string
  note: string
}) {
  return (
    <Panel className="p-4 flex items-start gap-3.5" style={{ opacity: 0.72 }}>
      <span
        className="grid place-items-center w-11 h-11 rounded-pill shrink-0"
        style={{ background: 'var(--bg-sunk)', color: 'var(--ink-faint)' }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-display text-md">{title}</span>
          <LockIcon size={13} className="text-ink-faint" />
        </span>
        <span className="block text-xs text-ink-muted mt-1 leading-snug">{note}</span>
      </span>
    </Panel>
  )
}
