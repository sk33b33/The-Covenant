import { motion } from 'framer-motion'
import { BackIcon, CheckIcon, LockIcon, ScrollIcon } from '@/art/icons'
import { EnergyOrb } from '@/art/EnergyOrb'
import { Panel } from '@/components/ui'
import { CHAPTERS, isEncounterUnlocked, type Encounter } from '@/data/story/genesis'
import { useNav } from '@/store/nav'
import { useStory } from '@/store/story'
import { cx } from '@/lib/cx'

/**
 * The chapter map.
 *
 * All six chapters are shown, five of them sealed. Hiding the unwritten ones
 * would make the story look complete at five encounters; showing them says
 * plainly how much is here and how much is coming.
 */
export function StoryMap() {
  const back = useNav((s) => s.back)
  const go = useNav((s) => s.go)
  const cleared = useStory((s) => s.cleared)

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
          <h1 className="font-display text-lg tracking-wide">Story</h1>
        </div>

        {CHAPTERS.map((chapter) => {
          const done = chapter.encounters.filter((e) => cleared.includes(e.id)).length

          return (
            <section key={chapter.id} className="mt-5">
              <div className="flex items-baseline gap-2 px-1 mb-2">
                <h2
                  className={cx(
                    'font-display text-md',
                    chapter.locked && 'text-ink-faint',
                  )}
                >
                  {chapter.name}
                </h2>
                <span className="text-xs text-ink-muted flex-1 truncate">{chapter.subtitle}</span>
                {!chapter.locked && (
                  <span className="text-xs text-ink-muted tabular-nums shrink-0">
                    {done}/{chapter.encounters.length}
                  </span>
                )}
              </div>

              {chapter.locked ? (
                <Panel className="p-5 flex items-center gap-3 opacity-60">
                  <LockIcon size={22} className="text-ink-faint shrink-0" />
                  <p className="text-xs text-ink-muted leading-snug">
                    Sealed. Genesis is the chapter written for this release; the rest follow.
                  </p>
                </Panel>
              ) : (
                <ol className="space-y-2">
                  {chapter.encounters.map((encounter) => (
                    <EncounterRow
                      key={encounter.id}
                      encounter={encounter}
                      cleared={cleared.includes(encounter.id)}
                      unlocked={isEncounterUnlocked(encounter, cleared)}
                      onOpen={() => go({ name: 'story-encounter', encounterId: encounter.id })}
                    />
                  ))}
                </ol>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function EncounterRow({
  encounter,
  cleared,
  unlocked,
  onOpen,
}: {
  encounter: Encounter
  cleared: boolean
  unlocked: boolean
  onOpen: () => void
}) {
  return (
    <li>
      <motion.button
        whileTap={unlocked ? { scale: 0.98 } : undefined}
        onClick={unlocked ? onOpen : undefined}
        disabled={!unlocked}
        className="neu rounded-lg w-full p-3.5 flex items-center gap-3 text-left relative overflow-hidden"
        style={{ opacity: unlocked ? 1 : 0.5 }}
        aria-label={`${encounter.title}${cleared ? ', cleared' : unlocked ? '' : ', locked'}`}
      >
        <span
          className="absolute inset-0 pointer-events-none opacity-[0.12]"
          style={{
            background: `linear-gradient(120deg, var(--energy-${encounter.theme}) 0%, transparent 60%)`,
          }}
        />

        <span
          className="relative grid place-items-center w-11 h-11 rounded-pill shrink-0"
          style={{
            background: cleared ? 'var(--gold-leaf)' : 'var(--bg-sunk)',
            color: cleared ? '#3a2a07' : 'var(--ink-faint)',
          }}
        >
          {cleared ? (
            <CheckIcon size={20} />
          ) : unlocked ? (
            <span className="font-display font-bold text-md">{encounter.index}</span>
          ) : (
            <LockIcon size={18} />
          )}
        </span>

        <span className="relative flex-1 min-w-0">
          <span className="block font-display text-md truncate">{encounter.title}</span>
          <span className="block text-xs text-ink-muted truncate">
            vs {encounter.opponent} · {encounter.verse}
          </span>
        </span>

        <span className="relative shrink-0">
          <EnergyOrb type={encounter.theme} size={22} />
        </span>
      </motion.button>
    </li>
  )
}

/** Shown on the map when nothing is playable — should not happen, but honest. */
export function StoryEmpty() {
  return (
    <div className="grid place-items-center h-full px-8 text-center">
      <div>
        <ScrollIcon size={40} className="text-ink-faint mx-auto" />
        <p className="text-sm text-ink-muted mt-3">No encounters are available yet.</p>
      </div>
    </div>
  )
}
