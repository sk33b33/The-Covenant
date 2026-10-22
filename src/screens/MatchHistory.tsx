import { BackIcon, BattleIcon } from '@/art/icons'
import { EmptyState } from '@/components/ui'
import { formatRelativeTime } from '@/lib/relativeTime'
import { useMatchHistory, type MatchHistoryEntry } from '@/store/matchHistory'
import { useNav } from '@/store/nav'
import type { EndReason } from '@/engine/types'

/** Plain, blame-free phrasing for each `EndReason` — "no Figures left" reads
 *  the same whether it was you or the opponent who ran out, rather than two
 *  mirrored strings this screen would have to pick between per row. */
const END_REASON_LABEL: Record<EndReason, string> = {
  points: 'Reached the point goal',
  'no-figures': 'No Figures left',
  concede: 'Conceded',
  timeout: "Clock ran out",
}

/**
 * A plain log of finished matches — Quick Battle, Training and Story alike.
 *
 * Reachable from the Battle tab rather than Menu: this is about the games
 * you've played, which belongs beside the deck and the matches you can play
 * next, not beside account settings.
 */
export function MatchHistory() {
  const back = useNav((s) => s.back)
  const entries = useMatchHistory((s) => s.entries)

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
          <h1 className="font-display text-lg tracking-wide">Match History</h1>
        </div>

        {entries.length === 0 ? (
          <EmptyState icon={<BattleIcon size={44} />} title="No matches yet">
            Finished matches show up here — Quick Battle, Training and Story alike.
          </EmptyState>
        ) : (
          <div className="mt-4 space-y-2">
            {entries.map((entry) => (
              <Row key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ entry }: { entry: MatchHistoryEntry }) {
  return (
    <div className="neu rounded-lg px-4 py-3 flex items-center gap-3">
      <span
        className="shrink-0 rounded-pill px-2.5 py-1 text-xs font-bold"
        style={{
          background: entry.won ? 'var(--positive)' : 'var(--negative)',
          color: '#fff',
        }}
      >
        {entry.won ? 'Won' : 'Lost'}
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">vs {entry.opponentName}</span>
        <span className="block text-xs text-ink-muted">
          {END_REASON_LABEL[entry.endReason]} · {formatRelativeTime(entry.playedAt)}
        </span>
      </span>

      <span className="shrink-0 text-sm font-numeric tabular-nums text-ink-muted">
        {entry.yourPoints}–{entry.opponentPoints}
      </span>
    </div>
  )
}
