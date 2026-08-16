import { useEffect, useState } from 'react'
import { CheckIcon, ScrollIcon, SocialIcon, TreeMark } from '@/art/icons'
import { Button, Panel } from '@/components/ui'
import { CARDS } from '@/data/cards'
import { ECONOMY, RULES } from '@/game/config'
import { clearAll } from '@/store/persist'
import { useNav } from '@/store/nav'
import { useProfile } from '@/store/profile'
import { applyTheme, resolveTheme, type Theme } from '@/lib/theme'
import { cx } from '@/lib/cx'

/**
 * Settings and the rules reference.
 *
 * The rules summary is here rather than buried in a tutorial because this is a
 * game with an unusual turn-1 handicap and its own ascension mechanic — both
 * are things a player will want to re-read once, mid-session, without leaving
 * a match's worth of context behind.
 */
export function Menu() {
  const go = useNav((s) => s.go)
  const profile = useProfile()

  const [theme, setTheme] = useState<Theme>(resolveTheme)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => applyTheme(theme), [theme])

  const reset = () => {
    clearAll()
    // A full reload is the only way to be sure every store is rebuilt from
    // the now-empty save rather than keeping stale state in memory.
    location.reload()
  }

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-app px-4 pt-safe pb-tabbar">
        <div className="text-center pt-2 pb-4">
          <h1 className="font-display text-xl tracking-wide">Menu</h1>
        </div>

        {/* --------------------------------------------------------- profile */}
        <button
          onClick={() => go({ name: 'profile' })}
          className="neu rounded-lg w-full p-4 flex items-center gap-3.5 text-left"
        >
          <span
            className="grid place-items-center w-12 h-12 rounded-pill shrink-0"
            style={{ background: 'var(--gold-leaf)' }}
          >
            <TreeMark size={26} className="text-[#3a2a07]" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display text-md truncate">{profile.name}</span>
            <span className="block text-xs text-ink-muted">
              Level {profile.level} · {profile.battlesWon}/{profile.battlesPlayed} won
            </span>
          </span>
        </button>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Tile icon={<ScrollIcon size={22} />} label="Missions" onClick={() => go({ name: 'missions' })} />
          <Tile icon={<SocialIcon size={22} />} label="Profile" onClick={() => go({ name: 'profile' })} />
        </div>

        {/* ----------------------------------------------------------- theme */}
        <h2 className="font-display text-md mt-6 mb-2 px-1">Appearance</h2>
        <Panel className="p-3">
          <div className="grid grid-cols-2 gap-2">
            {(['dark', 'light'] as Theme[]).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                aria-pressed={theme === option}
                className={cx(
                  'rounded-md py-3 text-sm capitalize transition-all',
                  theme === option ? 'shadow-pressed font-semibold' : 'shadow-raised-sm',
                )}
                style={{ background: theme === option ? 'var(--bg-sunk)' : 'var(--surface)' }}
              >
                {theme === option && <CheckIcon size={13} className="inline mr-1 -mt-0.5" />}
                {option}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-muted mt-2.5 leading-snug">
            The card art is dark and warm, so dark is where this game wants to
            live. Your phone's setting picks the first time; after that this
            does.
          </p>
        </Panel>

        {/* ----------------------------------------------------------- rules */}
        <h2 className="font-display text-md mt-6 mb-2 px-1">How it plays</h2>
        <Panel className="p-4 space-y-3">
          <Rule
            title="First to three"
            body={`Knocking out a Figure scores 1 point, an Anointed Figure 2. First to ${RULES.POINTS_TO_WIN} wins.`}
          />
          <Rule
            title="The coin decides tempo"
            body="Going first means no energy and no attack on turn 1 — you trade tempo for board position, and Ascend first on round two. Going second means energy immediately."
          />
          <Rule
            title="Ascension"
            body="Figures Ascend rather than evolve — sometimes a calling that renames the same person, sometimes the promise passing a generation. Damage and energy carry; conditions clear. Never on the turn a Figure entered play."
          />
          <Rule
            title="The Altar"
            body={`Energy is not a card. Your deck declares one or two types and the Altar supplies one each turn, of which you may attach ${RULES.ATTACHES_PER_TURN}.`}
          />
          <Rule
            title="Free packs"
            body={`${ECONOMY.PACK_SLOTS} slots, each refilling over 12 hours. Duplicates convert to Talents; a Rare or better is guaranteed at least every ${ECONOMY.PITY_INTERVAL} packs.`}
          />
        </Panel>

        {/* ----------------------------------------------------------- about */}
        <h2 className="font-display text-md mt-6 mb-2 px-1">About</h2>
        <Panel className="p-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            The Covenant — a trading card game drawn from scripture. {CARDS.length} cards
            in the Genesis set. Everything you own is stored on this device; there is
            no account and nothing is sent anywhere.
          </p>
        </Panel>

        {/* ----------------------------------------------------------- reset */}
        <Panel className="p-4 mt-3">
          <h3 className="text-sm font-semibold">Start over</h3>
          <p className="text-xs text-ink-muted mt-1 leading-snug">
            Erases your collection, decks, currencies and story progress. This cannot
            be undone.
          </p>

          {confirmReset ? (
            <div className="flex gap-2 mt-3">
              <Button className="flex-1 !py-2.5 text-sm" onClick={() => setConfirmReset(false)}>
                Keep my progress
              </Button>
              <Button
                className="flex-1 !py-2.5 text-sm"
                style={{ background: 'var(--negative)', color: '#fff' }}
                onClick={reset}
              >
                Erase everything
              </Button>
            </div>
          ) : (
            <Button variant="sunk" className="mt-3 !py-2.5 text-sm" onClick={() => setConfirmReset(true)}>
              Erase all progress
            </Button>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Tile({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="neu rounded-lg p-4 flex flex-col gap-2 text-left">
      <span className="text-[var(--gold-deep)]">{icon}</span>
      <span className="font-display text-md">{label}</span>
    </button>
  )
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{body}</p>
    </div>
  )
}
