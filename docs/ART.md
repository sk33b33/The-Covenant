# Artwork

## The short version

Drop a PNG into `public/art/cards/` named after the card's id, run the import
script, and the placeholder becomes a finished card. No code change.

```bash
python3 scripts/import-card-art.py jacob ~/renders/jacob.png
```

## Why the frame is drawn in code

The finished renders you supply are complete cards: black outer border, gold
filigree frame, parchment nameplate, artwork window, tree-of-life orb, and an
empty parchment text box at the bottom.

The game does not use them whole. It crops out the **artwork window** and
redraws everything around it — nameplate, orb, frame, text box — as a React
component in `src/components/card/Card.tsx`.

That is deliberate, and it buys four things:

1. **Live stats.** HP, attack costs, damage, weakness and retreat render as
   text over the frame. The supplied renders have an empty text box and no HP,
   so a baked image could never show them.
2. **Balance without re-rendering art.** Changing an attack from 60 to 50 is a
   one-line data edit, not a new image.
3. **Damage counters and states.** HP bars, KO overlays, status markers and
   selection glows all need to composite over the card.
4. **Consistency.** All 60 cards share one frame, so a card with placeholder
   art sits beside a finished one without looking like a different game.

## The art window

Measured against a **1054 × 1492** source render:

| | |
| --- | --- |
| Crop box | `(74, 178) → (972, 1232)` |
| Cropped size | 898 × 1054 |
| Aspect ratio | **0.852** |
| Exported width | 720 px |
| Format | WebP, quality 84 |
| Typical file size | 110–150 KB |

The bottom edge stops just above the tree-of-life orb, because the frame draws
its own orb over that seam.

Renders at other resolutions are fine — the script scales the crop box
proportionally. What matters is that the source is a **full card in the standard
Covenant frame**, not a bare illustration. If you have bare illustration with no
frame, crop it to a 0.852 aspect ratio yourself and place it directly in
`public/art/cards/<id>.webp`, skipping the script.

## Composition guidance

The frame overlays the artwork in two places, so keep them clear:

- **Top ~4%** sits under the nameplate's drop shadow.
- **Bottom centre**, a circle roughly 18% of the card width, is covered by the
  type orb.

Faces read best in the upper third. The five shipped cards all place the
subject's eyeline around 30% from the top, which is worth matching.

## Registering a card

Art alone is not enough — the card needs an entry in `src/data/cards.ts`. The
`id` there must match the art filename exactly:

```ts
{
  id: 'jacob',              // → public/art/cards/jacob.webp
  name: 'Jacob',
  type: 'earth',
  stage: 'ascended-2',
  ascendsFrom: 'isaac',
  hp: 130,
  // ...
}
```

If no file exists at `public/art/cards/<id>.webp`, the card renders with a
type-tinted parchment placeholder carrying its initial. That is a normal,
shipped state — not an error.

## Placeholder cards

55 of the 60 cards in the Genesis set currently use placeholders. They are fully
playable; only the illustration is missing. Replacing them is incremental — one
card at a time, in any order, with no rebuild of anything else.
