import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BattleIcon } from '@/art/icons'
import { CardViewer } from '@/components/card/CardViewer'
import { TabBar } from '@/components/TabBar'
import { BattleHub } from '@/screens/BattleHub'
import { BattleRoute } from '@/screens/BattleRoute'
import { Collection } from '@/screens/Collection'
import { DeckBuilder } from '@/screens/DeckBuilder'
import { Enter } from '@/screens/Enter'
import { PackOpen } from '@/screens/PackOpen'
import { Shop } from '@/screens/Shop'
import { StoryEncounter } from '@/screens/StoryEncounter'
import { StoryMap } from '@/screens/StoryMap'
import { Home } from '@/screens/Home'
import { Menu } from '@/screens/Menu'
import { Missions } from '@/screens/Missions'
import { Profile } from '@/screens/Profile'
import { Social } from '@/screens/Social'
import { Placeholder } from '@/screens/Placeholder'
import { useNav, type Route } from '@/store/nav'

export default function App() {
  const route = useNav((s) => s.route)
  const back = useNav((s) => s.back)

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

  // The splash is an overlay, so the interface beneath it is already painted —
  // chrome included. That is what the art dissolves *to*.
  const showChrome =
    route.name !== 'battle' &&
    route.name !== 'pack-open' &&
    route.name !== 'story-encounter'

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

      {/*
        The splash sits outside the route swap on purpose.
        As a routed screen it could only ever cut: AnimatePresence in `wait`
        mode faded the art out, waited, and only then faded Home in, so for a
        sixth of a second the screen was neither. Out here it survives the route
        change long enough to dissolve over the top of the real interface.
      */}
      <AnimatePresence>{route.name === 'enter' && <Enter key="enter" />}</AnimatePresence>

      {/* Mounted once, over everything. Any card in the app opens here on a
          hold, so it has to outlive the screen that was showing the card. */}
      <CardViewer />
    </div>
  )
}

/** Distinct key per screen so AnimatePresence swaps rather than morphs. */
function routeKey(route: Route): string {
  switch (route.name) {
    // The splash overlays Home, so they must share a key or the main area
    // would swap underneath the art as the route changes.
    case 'enter':
      return 'tab:home'
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
    // The splash renders above this as an overlay; what belongs here is the
    // screen it dissolves to, painted and populated from the first frame.
    case 'enter':
      return <Home />

    case 'tab':
      switch (route.tab) {
        case 'home':
          return <Home />
        case 'cards':
          return <Collection />
        case 'social':
          return <Social />
        case 'battle':
          return <BattleHub />
        case 'menu':
          return <Menu />
      }
      return null

    case 'pack-open':
      return <PackOpen packId={route.packId} source={route.source} />

    case 'shop':
      return <Shop />

    case 'battle':
      return <BattleRoute deckId={route.deckId} />

    case 'deck-builder':
      return <DeckBuilder deckId={route.deckId} />

    case 'missions':
      return <Missions />

    case 'profile':
      return <Profile />

    case 'story-map':
      return <StoryMap />

    case 'story-encounter':
      return <StoryEncounter encounterId={route.encounterId} />

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
