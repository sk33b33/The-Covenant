import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BattleIcon, MenuIcon, ScrollIcon, SocialIcon } from '@/art/icons'
import { TabBar } from '@/components/TabBar'
import { Collection } from '@/screens/Collection'
import { Enter } from '@/screens/Enter'
import { PackOpen } from '@/screens/PackOpen'
import { Shop } from '@/screens/Shop'
import { Home } from '@/screens/Home'
import { Placeholder } from '@/screens/Placeholder'
import { useNav, type Route } from '@/store/nav'
import { useProfile } from '@/store/profile'

export default function App() {
  const route = useNav((s) => s.route)
  const setTab = useNav((s) => s.setTab)
  const back = useNav((s) => s.back)
  const isNew = useProfile((s) => s.isNew)

  // Returning players skip the splash; it is a first-run moment, not a gate.
  useEffect(() => {
    if (!isNew && route.name === 'enter') setTab('home')
  }, [isNew, route.name, setTab])

  // The hardware and browser back gesture pops our stack instead of leaving
  // the app. A sentinel history entry gives us something to pop.
  useEffect(() => {
    history.pushState(null, '', location.href)
    const onPop = () => {
      back()
      history.pushState(null, '', location.href)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [back])

  const showChrome =
    route.name !== 'enter' && route.name !== 'battle' && route.name !== 'pack-open'

  return (
    <div className="h-full bg-bg text-ink">
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={routeKey(route)}
          className="h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <Screen route={route} />
        </motion.main>
      </AnimatePresence>

      {showChrome && <TabBar />}
    </div>
  )
}

/** Distinct key per screen so AnimatePresence swaps rather than morphs. */
function routeKey(route: Route): string {
  switch (route.name) {
    case 'tab':
      return `tab:${route.tab}`
    case 'pack-open':
      return `pack:${route.packId}`
    case 'story-encounter':
      return `enc:${route.encounterId}`
    default:
      return route.name
  }
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'enter':
      return <Enter />

    case 'tab':
      switch (route.tab) {
        case 'home':
          return <Home />
        case 'cards':
          return <Collection />
        case 'social':
          return (
            <Placeholder
              icon={<SocialIcon size={44} />}
              title="Social Hub"
              note="Friends, trading and community showcases need other real players, so this ships as a visual shell later in the build."
            />
          )
        case 'battle':
          return (
            <Placeholder
              icon={<BattleIcon size={44} />}
              title="Battle"
              note="The rules engine is built and tested before any of it reaches the screen. Coin flip, Ascension and first-to-three land in milestone six."
            />
          )
        case 'menu':
          return (
            <Placeholder
              icon={<MenuIcon size={44} />}
              title="Menu"
              note="Settings, profile and account options."
            />
          )
      }
      return null

    case 'pack-open':
      return <PackOpen packId={route.packId} source={route.source} />

    case 'shop':
      return <Shop />

    case 'missions':
      return (
        <Placeholder
          withBack
          icon={<ScrollIcon size={44} />}
          title="Missions"
          note="Daily and achievement missions that pay out Talents and Grace."
        />
      )

    case 'profile':
      return (
        <Placeholder
          withBack
          icon={<SocialIcon size={44} />}
          title="Profile"
          note="Level, experience and your battle record."
        />
      )

    case 'story-map':
      return (
        <Placeholder
          withBack
          icon={<ScrollIcon size={44} />}
          title="Story"
          note="Six chapters from Genesis to Revelation. The Genesis encounters are written and playable in milestone seven."
        />
      )

    default:
      return (
        <Placeholder
          withBack
          icon={<BattleIcon size={44} />}
          title="Coming soon"
          note="This screen is part of a later milestone."
        />
      )
  }
}
