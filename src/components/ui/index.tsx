import { motion } from 'framer-motion'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * The neumorphic UI kit.
 *
 * Three surfaces do almost all the work in the reference interface: a raised
 * panel, a pill button, and a sunk track. Everything here is built from the
 * shadow tokens so light and dark stay consistent without per-component
 * overrides.
 */

/* ------------------------------------------------------------------ button */

type ButtonVariant = 'raised' | 'gold' | 'ghost' | 'sunk'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Fills the available width. */
  block?: boolean
  children: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  raised: 'bg-surface text-ink shadow-raised',
  gold: 'text-[var(--ink-inverse)] shadow-raised',
  ghost: 'text-ink-muted',
  sunk: 'neu-sunk text-ink-muted',
}

export function Button({
  variant = 'raised',
  block,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      // Press feedback is scale only. Shadow transitions on every tap look
      // sluggish on mid-range phones, and scale reads as physical.
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.12 }}
      className={cx(
        'rounded-pill px-5 py-3 font-medium text-base select-none',
        'transition-opacity',
        VARIANTS[variant],
        block && 'w-full',
        disabled && 'opacity-40 pointer-events-none',
        className,
      )}
      style={variant === 'gold' ? { background: 'var(--gold-leaf)' } : undefined}
      disabled={disabled}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  )
}

/* ------------------------------------------------------------------- panel */

export function Panel({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('neu rounded-lg', className)} {...rest}>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------- chip */

interface ChipProps {
  icon?: ReactNode
  children: ReactNode
  className?: string
  /** Muted, sunk styling for secondary counters. */
  sunk?: boolean
}

export function Chip({ icon, children, className, sunk }: ChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5',
        'text-sm font-medium whitespace-nowrap',
        sunk ? 'neu-sunk text-ink-muted' : 'bg-surface shadow-raised-sm text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/* --------------------------------------------------------------- progress */

interface ProgressProps {
  /** 0–1. */
  value: number
  className?: string
  /** Gold by default; pass a token var for type-coloured bars. */
  fill?: string
  label?: string
}

export function Progress({ value, className, fill, label }: ProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100

  return (
    <div
      className={cx('neu-sunk rounded-pill h-2.5 overflow-hidden relative', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        className="h-full rounded-pill"
        style={{ background: fill ?? 'var(--gold-leaf)' }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------- badge */

/** The small red count badge from the reference UI. */
export function Badge({ count, className }: { count?: number; className?: string }) {
  return (
    <span
      className={cx(
        'absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] px-[3px]',
        'rounded-pill bg-[var(--negative)] text-white',
        'text-[8px] font-bold leading-[13px] text-center',
        'ring-2 ring-[var(--bg)]',
        className,
      )}
    >
      {count !== undefined && count > 0 ? (count > 99 ? '99+' : count) : ''}
    </span>
  )
}

/* ------------------------------------------------------------------ header */

export function ScreenTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="text-center px-4">
      <h1 className="font-display text-xl tracking-wide text-ink-strong">{children}</h1>
      {sub && <p className="text-sm text-ink-muted mt-1">{sub}</p>}
    </div>
  )
}

/* ------------------------------------------------------------- empty state */

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16 gap-3">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <h2 className="font-display text-md text-ink">{title}</h2>
      {children && <p className="text-sm text-ink-muted max-w-[38ch]">{children}</p>}
    </div>
  )
}
