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
 * Fixed, five equal targets, safe-area padded. The active tab is marked by a
 * warm glow behind its icon, sliding between positions via a shared layout id —
 * one moving light rather than five blinking ones, which is what makes it feel
 * like a physical selector rather than five independent lamps.
 *
 * The glow is support, not the whole signal. It replaced a solid pill, and a
 * diffuse light alone is a weak thing to hang a navigation state on, so the
 * active icon and label carry it too: gold, and the label at full weight
 * against the others' muted.
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
                  // `ink-muted` clears it in both themes.
                  active ? 'text-[var(--gold-deep)]' : 'text-ink-muted',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="tab-glow"
                    aria-hidden="true"
                    // Sized and placed on the icon rather than the whole
                    // button, so it reads as the icon being lit from behind
                    // instead of a shape parked underneath it. The transparent
                    // stop sits at 70% so the falloff finishes inside the
                    // element and never draws a visible circular edge.
                    className="absolute w-11 h-11 rounded-pill -z-10"
                    style={{
                      top: 8,
                      background:
                        'radial-gradient(circle, var(--gold-bright) 0%, rgba(229,192,140,.35) 42%, transparent 70%)',
                      filter: 'blur(3px)',
                      opacity: 0.85,
                    }}
                    transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                  />
                )}
                <Icon size={23} />
                <span
                  className={cx('text-[10px] tracking-wide', active ? 'font-bold' : 'font-medium')}
                >
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
