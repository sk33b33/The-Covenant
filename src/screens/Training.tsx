import { BackIcon } from '@/art/icons'
import { Panel } from '@/components/ui'
import { useDecks } from '@/store/decks'
import { useNav, type TrainingDifficulty } from '@/store/nav'

/**
 * The Training difficulty picker.
 *
 * One screen, three presets — Quick Battle already covers "just play
 * something now" with a random two-element opponent, so this exists for the
 * opposite need: pick exactly how sharp the opponent plays, against a deck
 * that only ever leans on one element (see `buildTrainingOpponentDeck`),
 * so a loss reads as "the AI outplayed me" rather than "the AI's deck ran
 * two colours mine didn't answer."
 */
const TIERS: { id: TrainingDifficulty; label: string; blurb: string; pips: number }[] = [
  {
    id: 'standard',
    label: 'Standard',
    blurb: 'A forgiving opponent, prone to mistakes — good for learning a new deck.',
    pips: 1,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'Solid, mostly-correct play — the same skill Quick Battle opponents use.',
    pips: 2,
  },
  {
    id: 'master',
    label: 'Master',
    blurb: 'Sharp, close to perfect play. The toughest preset in the game.',
    pips: 3,
  },
]

export function Training({ deckId }: { deckId?: string }) {
  const back = useNav((s) => s.back)
  const go = useNav((s) => s.go)
  const decks = useDecks((s) => s.decks)
  const activeDeckId = useDecks((s) => s.activeDeckId)
  const deck = decks.find((d) => d.id === deckId) ?? decks.find((d) => d.id === activeDeckId) ?? decks[0]

  const start = (tier: TrainingDifficulty) => {
    go({ name: 'battle', deckId: deck?.id, at: Date.now(), training: tier })
  }

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
          <h1 className="font-display text-lg tracking-wide">Training</h1>
        </div>

        <p className="text-xs text-ink-muted mt-4 px-1 leading-relaxed">
          Play your current deck against a preset opponent running a single element. Choose how
          sharp it plays.
        </p>

        <div className="mt-4 space-y-3">
          {TIERS.map((tier) => (
            <button key={tier.id} onClick={() => start(tier.id)} className="w-full text-left">
              <Panel className="p-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-md">{tier.label}</h2>
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: 3 }, (_, i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-pill"
                        style={{ background: i < tier.pips ? 'var(--gold-bright)' : 'var(--bg-sunk)' }}
                      />
                    ))}
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">{tier.blurb}</p>
              </Panel>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
