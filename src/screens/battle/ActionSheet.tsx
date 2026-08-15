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
            {options.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-6 px-4">
                Nothing can be done with this right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {options.map((option) => (
                  <li key={option.id}>
                    <button
                      onClick={() => {
                        if (option.disabled) return
                        option.onSelect()
                        onClose()
                      }}
                      disabled={option.disabled}
                      className="w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-opacity"
                      style={{
                        background: 'var(--surface-raised)',
                        opacity: option.disabled ? 0.45 : 1,
                      }}
                    >
                      {option.cost && option.cost.length > 0 && (
                        <EnergyCost cost={option.cost} size={16} className="shrink-0" />
                      )}

                      <span className="flex-1 min-w-0">
                        <span className="block font-display text-base text-ink-strong">
                          {option.label}
                        </span>
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
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
