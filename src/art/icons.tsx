import type { SVGProps } from 'react'
import { TreeGlyph } from './tree'

/**
 * The interface icon set.
 *
 * One consistent construction: a 24×24 box, 1.7 stroke, round caps and joins,
 * no fills. That weight matches the reference UI's soft line icons and stays
 * legible at the 22–26 px the tab bar and chips render them at. Everything
 * inherits `currentColor` so a single class controls colour in both themes.
 */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/* ------------------------------------------------------------- navigation */

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.6 10.4 12 3.8l8.4 6.6" />
    <path d="M5.6 9.4V19a1.4 1.4 0 0 0 1.4 1.4h10a1.4 1.4 0 0 0 1.4-1.4V9.4" />
    <path d="M9.8 20.4v-5.2h4.4v5.2" />
  </Icon>
)

/** Binder: a ring-bound album of cards. */
export const BinderIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="3.4" width="16" height="17.2" rx="2" />
    <path d="M8.2 3.4v17.2" />
    <path d="M5.9 7.2h.9M5.9 11.5h.9M5.9 15.8h.9" />
    <rect x="11" y="7.4" width="6" height="9.2" rx="1" />
  </Icon>
)

/** Two figures side by side. */
export const SocialIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8.6" cy="8.2" r="2.9" />
    <path d="M3.4 19.6a5.2 5.2 0 0 1 10.4 0" />
    <circle cx="17" cy="9.4" r="2.3" />
    <path d="M15 19.6a4.2 4.2 0 0 1 5.6-3.96" />
  </Icon>
)

/** Two cards clashing — the versus mark. */
export const BattleIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.6" y="6.4" width="8" height="11.2" rx="1.4" transform="rotate(-9 6.6 12)" />
    <rect x="13.4" y="6.4" width="8" height="11.2" rx="1.4" transform="rotate(9 17.4 12)" />
    <path d="M12 4.6v14.8" strokeDasharray="2.4 2.6" />
  </Icon>
)

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

/* ------------------------------------------------------------------ chrome */

export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5.6" width="18" height="12.8" rx="2.2" />
    <path d="m3.8 7.4 7.3 5.2a1.6 1.6 0 0 0 1.8 0l7.3-5.2" />
  </Icon>
)

export const GiftIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.2" y="9.4" width="17.6" height="11" rx="1.8" />
    <path d="M2.4 9.4h19.2M12 9.4v11" />
    <path d="M12 9.4S10.4 4.2 8 4.2a2.2 2.2 0 0 0 0 4.4h4" />
    <path d="M12 9.4S13.6 4.2 16 4.2a2.2 2.2 0 0 1 0 4.4h-4" />
  </Icon>
)

export const ScrollIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.4 4.2h11a2 2 0 0 1 2 2v11.6a2 2 0 0 1-2 2h-11" />
    <path d="M6.4 4.2a2 2 0 0 0-2 2v1.6h4V6.2a2 2 0 0 0-2-2Z" />
    <path d="M6.4 19.8a2 2 0 0 0 2-2v-1.6h-4v1.6a2 2 0 0 0 2 2Z" />
    <path d="M10.4 9h6M10.4 12.4h6M10.4 15.8h3.4" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.8" cy="10.8" r="6.2" />
    <path d="m15.4 15.4 4.2 4.2" />
  </Icon>
)

export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9.4 5.6 6.4 6.4-6.4 6.4" />
  </Icon>
)

export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.6 5.6 8.2 12l6.4 6.4" />
  </Icon>
)

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 16.4H8.6a4.2 4.2 0 0 1 0-8.4H19" />
    <path d="m11.6 4.6-3.4 3.4 3.4 3.4" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6" />
  </Icon>
)

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.4V12l3.2 1.9" />
  </Icon>
)

export const ShopIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.6 8.4h14.8l-1.1 11a1.6 1.6 0 0 1-1.6 1.4H7.3a1.6 1.6 0 0 1-1.6-1.4Z" />
    <path d="M9 8.4V6.6a3 3 0 0 1 6 0v1.8" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.4 12.6 4.2 4.2 9-9.6" />
  </Icon>
)

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2" />
    <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5.4v13.2M5.4 12h13.2" />
  </Icon>
)

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.4 12h13.2" />
  </Icon>
)

/* ------------------------------------------------------------- currencies */

/** Talents: a stack of coins. */
export const TalentIcon = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="7" rx="7" ry="2.9" />
    <path d="M5 7v4.2c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9V7" />
    <path d="M5 11.6v4.2c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9v-4.2" />
  </Icon>
)

/** Grace: a flask of anointing oil, mid-pour. */
export const GraceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.4h4v3.1l3.4 5.6a4.6 4.6 0 0 1-3.9 7H10.5a4.6 4.6 0 0 1-3.9-7L10 6.5Z" />
    <path d="M8.2 14.2c1.5-1 2.6-.2 3.8.4s2.3 1 3.8 0" />
  </Icon>
)

/* ------------------------------------------------------------------ tokens */

/** The tree of life — the game's mark, used for the crest and the deck back. */
export const TreeMark = (p: IconProps) => (
  <Icon {...p}>
    <TreeGlyph />
  </Icon>
)
