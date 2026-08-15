import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { BackIcon, CheckIcon, GraceIcon, TalentIcon } from '@/art/icons'
import { Button, Panel, Progress } from '@/components/ui'
import { CHAPTERS } from '@/data/story/genesis'
import { useCollection } from '@/store/collection'
import { useDecks } from '@/store/decks'
import { useEconomy } from '@/store/economy'
import { useMissions, MISSIONS, type MissionDefinition, type MissionProgress } from '@/store/missions'
import { useNav } from '@/store/nav'
import { useProfile } from '@/store/profile'
import { useStory } from '@/store/story'
import { cx } from '@/lib/cx'

/**
 * Missions.
 *
 * Every mission reads a counter the game already keeps, so nothing elsewhere
 * has to report progress. Rewards are claimed by hand rather than paid
 * automatically — a payout you tapped for is a payout you noticed.
 */
export function Missions() {
  const back = useNav((s) => s.back)
  const profile = useProfile()
  const owned = useCollection((s) => s.owned)
  const decks = useDecks((s) => s.decks)
  const cleared = useStory((s) => s.cleared)
  const addTalents = useEconomy((s) => s.addTalents)
  const addGrace = useEconomy((s) => s.addGrace)

  const refresh = useMissions((s) => s.refresh)
  const claim = useMissions((s) => s.claim)
  const claimed = useMissions((s) => s.claimed)
  const valueFor = useMissions((s) => s.valueFor)

  const progress: MissionProgress = useMemo(
    () => ({
      battlesPlayed: profile.battlesPlayed,
      battlesWon: profile.battlesWon,
      packsOpened: profile.packsOpened,
      cardsCollected: Object.values(owned).filter((n) => n > 0).length,
      encountersCleared: cleared.length,
      // The starter deck is given, not built, so it does not count.
      decksBuilt: decks.filter((d) => d.id !== 'starter').length,
    }),
    [profile, owned, cleared, decks],
  )

  useEffect(() => {
    refresh(progress)
  }, [refresh, progress])

  const collect = (mission: MissionDefinition) => {
    if (!claim(mission.id)) return
    addTalents(mission.reward.talents)
    if (mission.reward.grace) addGrace(mission.reward.grace)
  }

  const dailies = MISSIONS.filter((m) => m.scope === 'daily')
  const lifetime = MISSIONS.filter((m) => m.scope === 'lifetime')

  const readyCount = MISSIONS.filter(
    (m) => !claimed.includes(m.id) && valueFor(m, progress) >= m.target,
  ).length

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
          <h1 className="font-display text-lg tracking-wide flex-1">Missions</h1>
          {readyCount > 0 && (
            <span
              className="rounded-pill px-2.5 py-1 text-xs font-bold"
              style={{ background: 'var(--negative)', color: '#fff' }}
            >
              {readyCount} ready
            </span>
          )}
        </div>

        <Section title="Today" note="Resets overnight">
          {dailies.map((mission) => (
            <MissionRow
              key={mission.id}
              mission={mission}
              value={valueFor(mission, progress)}
              claimed={claimed.includes(mission.id)}
              onClaim={() => collect(mission)}
            />
          ))}
        </Section>

        <Section
          title="Milestones"
          note={`Genesis runs to ${CHAPTERS[0]?.encounters.length ?? 5} encounters`}
        >
          {lifetime.map((mission) => (
            <MissionRow
              key={mission.id}
              mission={mission}
              value={valueFor(mission, progress)}
              claimed={claimed.includes(mission.id)}
              onClaim={() => collect(mission)}
            />
          ))}
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h2 className="font-display text-md">{title}</h2>
        {note && <span className="text-xs text-ink-muted">{note}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function MissionRow({
  mission,
  value,
  claimed,
  onClaim,
}: {
  mission: MissionDefinition
  value: number
  claimed: boolean
  onClaim: () => void
}) {
  const done = value >= mission.target
  const shown = Math.min(value, mission.target)

  return (
    <Panel className={cx('p-3.5', claimed && 'opacity-55')}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{mission.title}</h3>
          <p className="text-xs text-ink-muted mt-0.5 leading-snug">{mission.detail}</p>

          <div className="flex items-center gap-2 mt-2">
            <Progress value={shown / mission.target} className="flex-1" label={mission.title} />
            <span className="text-xs text-ink-muted tabular-nums shrink-0">
              {shown}/{mission.target}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--gold-deep)' }}>
            <span className="flex items-center gap-1">
              <TalentIcon size={13} />
              {mission.reward.talents}
            </span>
            {mission.reward.grace ? (
              <span className="flex items-center gap-1">
                <GraceIcon size={13} />
                {mission.reward.grace}
              </span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 self-center">
          {claimed ? (
            <span
              className="grid place-items-center w-10 h-10 rounded-pill"
              style={{ background: 'var(--bg-sunk)', color: 'var(--positive)' }}
              aria-label="Claimed"
            >
              <CheckIcon size={20} />
            </span>
          ) : (
            <motion.div animate={done ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 1.6, repeat: Infinity }}>
              <Button
                variant={done ? 'gold' : 'sunk'}
                disabled={!done}
                onClick={onClaim}
                className="!px-4 !py-2 text-sm"
              >
                {done ? 'Claim' : 'Locked'}
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </Panel>
  )
}
