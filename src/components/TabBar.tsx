import { motion } from 'framer-motion'
import { BattleIcon, BinderIcon, HomeIcon, MenuIcon, SocialIcon } from '@/art/icons'
import { useNav, type Tab } from '@/store/nav'
import { cx } from '@/lib/cx'

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'cards', label: 'Cards', Icon: BinderIcon },
  { id: 'social', label: 'Social', Icon: SocialIcon },
  { id: 'battle', label: 'Battle', Icon: BattleIcon },
  { id: 'menu', label: 'Menu', Icon: MenuIcon },
]

/**
 * The bottom navigation.
 *
 * Fixed, five equal targets, safe-area padded. The active tab is marked with a
 * gold pill that slides between positions via a shared layout id — one moving
 * object rather than five fading ones, which is what makes it feel like a
 * physical selector.
 *
 * It floats over the content rather than sitting beside it (see `.tabbar` and
 * `.pb-tabbar` in global.css), so screens keep scrolling underneath and the
 * app has depth below the fold instead of ending in a seam.
 */
export function TabBar() {
  const tab = useNav((s) => s.tab)
  const setTab = useNav((s) => s.setTab)

  return (
    <nav className="tabbar fixed inset-x-0 bottom-0 z-40 pb-safe" aria-label="Main">
      <ul className="mx-auto max-w-app grid grid-cols-5" style={{ height: 'var(--tabbar-h)' }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <li key={id} className="relative">
              <button
                onClick={() => setTab(id)}
                className={cx(
                  'relative w-full h-full flex flex-col items-center justify-center gap-1',
                  'transition-colors duration-200',
                  // `ink-faint` put these 10px labels at 3.7:1 against the bar,
                  // under the 4.5:1 AA floor, on the app's primary navigation.
                  // `ink-muted` clears it in both themes and the gold pill is
                  // what marks the active tab anyway, not the label's weight.
                  active ? 'text-[var(--gold-deep)]' : 'text-ink-muted',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-x-3 inset-y-2 rounded-lg -z-10"
                    style={{ background: 'var(--gold-pale)', opacity: 0.55 }}
                    transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                  />
                )}
                <Icon size={23} />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
