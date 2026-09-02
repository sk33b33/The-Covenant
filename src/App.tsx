import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BattleIcon, GiftIcon, MailIcon } from '@/art/icons'
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
import { useNav, type ComingSoonIcon, type Route } from '@/store/nav'

/** What `{ name: 'coming-soon' }` picks from — a fixed set, not a React node,
 *  so the route itself stays a plain value (see the type in store/nav.ts). */
const COMING_SOON_ICON: Record<ComingSoonIcon, React.ReactNode> = {
  mail: <MailIcon size={44} />,
  gifts: <GiftIcon size={44} />,
}

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
  //
  // Deck Builder owns its full height exactly like these three do — its own
  // Save bar is pinned to the bottom of a plain h-full column, with no
  // pb-tabbar clearance built in, because it was built assuming the tab bar
  // would not be there. Without this exclusion the fixed tab bar sits on top
  // of that Save bar, and "Save deck" is not reachable at all: a legal deck
  // can be built and never actually saved.
  const showChrome =
    route.name !== 'battle' &&
    route.name !== 'pack-open' &&
    route.name !== 'story-encounter' &&
    route.name !== 'deck-builder'

  return (
    <div className="h-full bg-bg text-ink">
      {/*
        No `mode="wait"` any more. It used to hold the outgoing screen
        mounted until its exit fade reported itself complete, then swap in
        the next one — the two never overlapped, at the cost of briefly
        showing neither (the reason the splash below was pulled out of this
        swap entirely). Leaving Battle after a match traced back to exactly
        that wait: its exit fade would reach opacity 0 and then just stop —
        the completion callback that "wait" mode needs never fired, so the
        next screen never mounted and the finished match sat there forever,
        faded to invisible but still covering the screen and eating taps.
        Reproduced and confirmed repeatedly; the exact framer-motion
        internal reason the callback doesn't fire wasn't pinned down, only
        that this is where it happens and only this screen. Default (sync)
        mode mounts the next screen immediately instead of waiting on the
        outgoing one at all, which sidesteps the hang outright — the small
        cost is that a route change can very briefly show both screens
        layered rather than a clean cut, standard AnimatePresence behaviour
        everywhere that doesn't ask for `wait`.

        `fixed inset-0` on the screen itself is what makes that overlap
        harmless rather than a new bug of its own. `<main>` used to be a
        plain `h-full` block, fine when only one was ever in the DOM at a
        time under `mode="wait"` — but with both the outgoing and incoming
        screen mounted together, two ordinary block siblings each 100% of
        the viewport stack vertically like any other block content: the
        second one lands a full screen-height below the first, technically
        present and clickable via coordinates but completely invisible
        below the fold — which is exactly what turned up under test, a
        BattleHub that "worked" yet rendered as a blank page. Pinning both
        to the same fixed position instead makes two present screens
        genuinely overlap — the correct thing for a full-screen surface —
        with the later one in the DOM painting on top, so the incoming
        screen is what a player actually sees.
      */}
      <AnimatePresence initial={false}>
        <motion.main
          key={routeKey(route)}
          className="h-full fixed inset-0"
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
    case 'coming-soon':
      return `soon:${route.title}`
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

    case 'coming-soon':
      return (
        <Placeholder
          withBack
          icon={COMING_SOON_ICON[route.icon]}
          title={route.title}
          note="This screen is part of a later milestone."
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
