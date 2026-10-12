import { asset } from '@/lib/asset'
import { cx } from '@/lib/cx'

/**
 * The card back.
 *
 * Every face-down card in the game is this: both decks, the opening hand, the
 * five cards inside an unopened pack. The supplied artwork — a tooled leather
 * cover stamped with the tree-of-life seal — replaces what used to be a
 * hand-drawn SVG, so every face-down card in the product now matches it
 * exactly rather than approximating it in vector shapes.
 */
export function CardBack({ className }: { className?: string }) {
  return (
    <img
      src={asset('art/card-back.webp')}
      alt="Card back"
      className={cx('block w-full h-full object-cover', className)}
      style={{
        borderRadius: '4.5% / 3.22%',
        // `border-box`, not the `img` default — otherwise the border adds
        // to the element's own size instead of insetting into it, pushing
        // this 1px past whatever edge the face side and every other card
        // on the mat already line up on.
        boxSizing: 'border-box',
        border: '1px solid var(--gold-bright)',
      }}
      draggable={false}
    />
  )
}
