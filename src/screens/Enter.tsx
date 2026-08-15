import { motion } from 'framer-motion'
import { STARTER_CARD_IDS } from '@/data/starter'
import { useCollection } from '@/store/collection'
import { useDecks } from '@/store/decks'
import { useProfile } from '@/store/profile'
import { useNav } from '@/store/nav'

/**
 * Tap to enter.
 *
 * The key art already carries the Covenant wordmark, so this screen adds no
 * lettering of its own beyond the prompt — a second title over a painted one
 * reads as a mistake. The art is the entire screen; the interface is one line
 * of text and a tap target the size of the display.
 */
export function Enter() {
  const isNew = useProfile((s) => s.isNew)
  const markSeen = useProfile((s) => s.markSeen)
  const setTab = useNav((s) => s.setTab)
  const addCards = useCollection((s) => s.add)
  const ensureStarter = useDecks((s) => s.ensureStarter)

  const enter = () => {
    // First entry hands over a playable deck. Landing on an empty binder, an
    // empty deck list and an unusable Battle tab is three dead ends before the
    // game has said anything.
    if (isNew) {
      addCards(STARTER_CARD_IDS)
      ensureStarter()
    }

    markSeen()
    setTab('home')
  }

  return (
    <button
      onClick={enter}
      className="fixed inset-0 w-full h-full overflow-hidden bg-[#0d0a06] cursor-pointer"
      aria-label="Tap to enter The Covenant"
    >
      {/* A very slow push-in so the screen breathes without drawing attention. */}
      <motion.img
        src="/art/key/cover.webp"
        alt="The Covenant"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: '50% 38%' }}
        initial={{ scale: 1.02, opacity: 0 }}
        animate={{ scale: 1.09, opacity: 1 }}
        transition={{
          opacity: { duration: 1.2, ease: 'easeOut' },
          scale: { duration: 26, ease: 'linear', repeat: Infinity, repeatType: 'reverse' },
        }}
      />

      {/* Only enough scrim at the foot to hold the prompt legible. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34%] pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgba(8,6,3,.94) 0%, rgba(8,6,3,.6) 45%, transparent 100%)',
        }}
      />

      <div className="relative h-full flex flex-col items-center justify-end pb-16 px-8">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="h-px w-24"
            style={{
              background: 'linear-gradient(to right, transparent, #d9b478, transparent)',
            }}
          />

          {/* Breathing, not blinking — a blink reads as a warning. */}
          <motion.span
            className="font-display text-sm tracking-[0.34em] pl-[0.34em]"
            style={{ color: '#f0dcbc', textShadow: '0 2px 12px rgba(0,0,0,.8)' }}
            animate={{ opacity: [0.42, 1, 0.42] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            TAP TO ENTER
          </motion.span>
        </motion.div>
      </div>
    </button>
  )
}
