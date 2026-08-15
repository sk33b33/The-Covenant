import { EmptyState } from '@/components/ui'
import { BackIcon } from '@/art/icons'
import { useNav } from '@/store/nav'

/**
 * Stand-in for screens not yet built. Named honestly rather than pretending to
 * be finished — an empty grid with no explanation reads as a bug.
 */
export function Placeholder({
  title,
  note,
  icon,
  withBack,
}: {
  title: string
  note: string
  icon?: React.ReactNode
  withBack?: boolean
}) {
  const back = useNav((s) => s.back)

  return (
    <div className="scroll-y h-full mb-tabbar">
      <div className="mx-auto max-w-app px-4 pt-safe">
        {withBack && (
          <button
            onClick={back}
            className="neu w-10 h-10 rounded-pill grid place-items-center mt-2 text-ink-muted"
            aria-label="Back"
          >
            <BackIcon size={20} />
          </button>
        )}
        <EmptyState icon={icon} title={title}>
          {note}
        </EmptyState>
      </div>
    </div>
  )
}
