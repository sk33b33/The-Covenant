import { AnimatePresence, motion } from 'framer-motion'
import { EnergyCost } from '@/art/EnergyOrb'
import { CloseIcon } from '@/art/icons'
import type { EnergyType } from '@/game/types'

/**
 * The action sheet.
 *
 * Every move is made by tapping a card, then tapping the move you want from a
 * list. Drag-and-drop looks better in a trailer, but on a phone it misfires
 * often enough to lose games, and it cannot show an attack's cost and damage at
 * the moment you are deciding. A list can also state plainly why a move is
 * unavailable, which is the difference between a rule you learn and a button
 * that seems broken.
 */

export interface SheetOption {
  id: string
  label: string
  detail?: string
  cost?: (EnergyType | null)[]
  damage?: number
  /** Disabled options remain visible, with `reason` explaining why. */
  disabled?: boolean
  reason?: string
  onSelect: () => void
}

export function ActionSheet({
  title,
  subtitle,
  options,
  onClose,
}: {
  title: string
  subtitle?: string
  options: SheetOption[]
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="absolute inset-0" style={{ background: 'rgba(8,6,3,.62)' }} />

        <motion.div
          className="on-dark relative rounded-t-xl pb-safe"
          style={{ background: 'var(--surface)', maxHeight: '72vh' }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 40 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 px-5 pt-4 pb-2">
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-md text-ink-strong truncate">{title}</h2>
              {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-pill grid place-items-center text-ink-muted shrink-0"
              style={{ background: 'var(--bg-sunk)' }}
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="scroll-y px-4 pb-4" style={{ maxHeight: '56vh' }}>
            <ActionList options={options} onChosen={onClose} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * The list of moves itself, without the sheet around it.
 *
 * Split out because the Active Figure presents the same options underneath its
 * enlarged card rather than in a sheet. One implementation, so an attack's
 * cost, damage and unavailable-reason are laid out the same wherever you meet
 * it — two copies of this would drift the moment one gained a field.
 */
export function ActionList({
  options,
  onChosen,
  emptyNote = 'Nothing can be done with this right now.',
}: {
  options: SheetOption[]
  onChosen: () => void
  emptyNote?: string
}) {
  if (options.length === 0) {
    return <p className="text-sm text-ink-muted text-center py-6 px-4">{emptyNote}</p>
  }

  return (
    <ul className="space-y-2">
      {options.map((option) => (
        <li key={option.id}>
          <button
            onClick={() => {
              if (option.disabled) return
              option.onSelect()
              onChosen()
            }}
            disabled={option.disabled}
            className="w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-opacity"
            style={{
              background: 'var(--surface-raised)',
              // Dimmed enough to read as unavailable, not so far that the move
              // becomes unreadable. At 0.45 an unavailable attack's name was
              // illegible on the viewer's dark tray — and the whole point of
              // showing it rather than hiding it is that you can read what you
              // cannot yet do, and why.
              opacity: option.disabled ? 0.62 : 1,
            }}
          >
            {option.cost && option.cost.length > 0 && (
              <EnergyCost cost={option.cost} size={16} className="shrink-0" />
            )}

            <span className="flex-1 min-w-0">
              <span className="block font-display text-base text-ink-strong">{option.label}</span>
              {(option.detail || option.reason) && (
                <span className="block text-xs text-ink-muted mt-0.5 leading-snug">
                  {option.disabled ? option.reason : option.detail}
                </span>
              )}
            </span>

            {option.damage !== undefined && option.damage > 0 && (
              <span className="font-numeric font-bold text-lg text-ink-strong shrink-0">
                {option.damage}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
