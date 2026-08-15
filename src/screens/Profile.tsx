import { useState } from 'react'
import { BackIcon, GraceIcon, TalentIcon, TreeMark } from '@/art/icons'
import { RarityMark } from '@/art/RarityMark'
import { Button, Panel, Progress } from '@/components/ui'
import { CARDS } from '@/data/cards'
import { CHAPTERS } from '@/data/story/genesis'
import { xpForLevel } from '@/game/config'
import { RARITIES, RARITY_LABEL } from '@/game/types'
import { useCollection } from '@/store/collection'
import { useEconomy } from '@/store/economy'
import { useNav } from '@/store/nav'
import { levelProgress, useProfile } from '@/store/profile'
import { useStory } from '@/store/story'

/**
 * The player's record.
 *
 * Everything here is read from stores the game already keeps; nothing is
 * tracked specially for this screen. The rarity breakdown is the part players
 * actually return for, so it is given real estate rather than a line of text.
 */
export function Profile() {
  const back = useNav((s) => s.back)
  const profile = useProfile()
  const rename = useProfile((s) => s.rename)
  const economy = useEconomy()
  const owned = useCollection((s) => s.owned)
  const cleared = useStory((s) => s.cleared)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile.name)

  const distinct = Object.values(owned).filter((n) => n > 0).length
  const total = Object.values(owned).reduce((a, b) => a + b, 0)
  const winRate =
    profile.battlesPlayed > 0
      ? Math.round((profile.battlesWon / profile.battlesPlayed) * 100)
      : 0

  const genesis = CHAPTERS.find((c) => c.id === 'genesis')

  const byRarity = RARITIES.map((rarity) => {
    const pool = CARDS.filter((c) => c.rarity === rarity)
    const held = pool.filter((c) => (owned[c.id] ?? 0) > 0).length
    return { rarity, held, total: pool.length }
  }).filter((row) => row.total > 0)

  const commit = () => {
    rename(draft)
    setEditing(false)
  }

  return (
    <div className="scroll-y h-full mb-tabbar">
      <div className="mx-auto max-w-app px-4 pt-safe pb-8">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={back}
            className="neu w-10 h-10 rounded-pill grid place-items-center text-ink-muted shrink-0"
            aria-label="Back"
          >
            <BackIcon size={20} />
          </button>
          <h1 className="font-display text-lg tracking-wide">Profile</h1>
        </div>

        {/* --------------------------------------------------------- identity */}
        <Panel className="mt-4 p-5 text-center">
          <span
            className="grid place-items-center w-20 h-20 rounded-pill mx-auto shadow-raised"
            style={{ background: 'var(--gold-leaf)' }}
          >
            <TreeMark size={40} className="text-[#3a2a07]" />
          </span>

          {editing ? (
            <div className="flex gap-2 mt-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
                className="flex-1 min-w-0 neu-sunk rounded-pill px-4 py-2 text-sm text-center bg-transparent outline-none"
                aria-label="Your name"
                maxLength={16}
                autoFocus
              />
              <Button className="!px-4 !py-2 text-sm" onClick={commit}>
                Save
              </Button>
            </div>
          ) : (
            <button
              onClick={() => {
                setDraft(profile.name)
                setEditing(true)
              }}
              className="mt-3 font-display text-xl"
            >
              {profile.name}
            </button>
          )}

          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-semibold">Level {profile.level}</span>
              <span className="text-xs text-ink-muted tabular-nums">
                {profile.xp} / {xpForLevel(profile.level)} XP
              </span>
            </div>
            <Progress value={levelProgress(profile.level, profile.xp)} label="Experience" />
          </div>

          <div className="flex justify-center gap-3 mt-4">
            <span className="neu-sunk rounded-pill px-3 py-1.5 text-sm flex items-center gap-1.5 tabular-nums">
              <TalentIcon size={15} />
              {economy.talents.toLocaleString()}
            </span>
            <span className="neu-sunk rounded-pill px-3 py-1.5 text-sm flex items-center gap-1.5 tabular-nums">
              <GraceIcon size={15} />
              {economy.grace}
            </span>
          </div>
        </Panel>

        {/* ----------------------------------------------------------- record */}
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          <Stat label="Battles" value={profile.battlesPlayed} />
          <Stat label="Won" value={profile.battlesWon} />
          <Stat label="Win rate" value={`${winRate}%`} />
          <Stat label="Packs" value={profile.packsOpened} />
          <Stat label="Cards" value={total} />
          <Stat
            label="Genesis"
            value={`${cleared.length}/${genesis?.encounters.length ?? 5}`}
          />
        </div>

        {/* -------------------------------------------------------- rarities */}
        <h2 className="font-display text-md mt-6 mb-2 px-1">Collection</h2>
        <Panel className="p-4 space-y-3">
          {byRarity.map((row) => (
            <div key={row.rarity}>
              <div className="flex items-center gap-2 mb-1">
                <RarityMark rarity={row.rarity} size={11} />
                <span className="text-xs flex-1">{RARITY_LABEL[row.rarity]}</span>
                <span className="text-xs text-ink-muted tabular-nums">
                  {row.held}/{row.total}
                </span>
              </div>
              <Progress
                value={row.total ? row.held / row.total : 0}
                label={RARITY_LABEL[row.rarity]}
              />
            </div>
          ))}

          <p className="text-xs text-ink-muted pt-1">
            {distinct} of {CARDS.length} distinct cards collected.
          </p>
        </Panel>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="neu rounded-lg p-3 text-center">
      <div className="font-numeric font-bold text-lg tabular-nums">{value}</div>
      <div className="text-[11px] text-ink-muted mt-0.5">{label}</div>
    </div>
  )
}
