# Artwork

74 cards, 5 illustrated, 69 on placeholders. Filling that in is a loop of three
commands, and this file is the whole contract.

```bash
npm run art:status     # what is still missing, most-visible first
npm run art:prompts    # write the prompt sheet
npm run art:import -- --dir ~/covenant-art    # bring the finished renders in
```

## The loop

**1. Generate the sheet.** `npm run art:prompts` reads the real card data and
writes two files:

- `docs/art-prompts.md` — one standalone prompt per card, each carrying the full
  style preamble so nothing has to be assembled by hand.
- `docs/art-prompts.json` — the same content structured, for driving an image
  API in a loop.

Both are generated. Do not edit them; edit `scripts/art-direction.ts` and
regenerate.

Order is by how visible the card is in play — starter deck, then story rewards,
then the chase rarities, then the rest — so stopping part-way still fixes the
cards you see most.

**2. Make the images.** Paste a prompt whole into ChatGPT, DALL·E or Gemini. The
prompts ask for **bare artwork** at roughly 6:7 — no frame, no nameplate, no
lettering — because the game draws all of that itself. Save each result as
`<card-id>.png` (the sheet names the file for you) into one folder.

**3. Import.** Point the importer at the folder:

```bash
npm run art:import -- --dir ~/covenant-art
```

It matches each filename to a card id, converts to WebP at 720 px wide, and
writes `public/art/cards/<id>.webp`. It reports anything that matched no card,
plus the cards still awaiting art, so a typo is visible instead of silent.

Refresh the app and the placeholder is a finished card. No code change.

### Filenames

Matching is tolerant of what actually comes out of an image tool and a downloads
folder: capitals, spaces, underscores, a trailing `(1)` or ` copy`. All of these
land on `jesus-carrying-cross`:

```
jesus-carrying-cross.png    Jesus_Carrying_Cross.png    jesus carrying cross (1).png
```

A single card can still be done one at a time:

```bash
npm run art:import -- jacob ~/renders/jacob.png
```

## Two accepted source formats

The importer tells them apart by aspect ratio, so both workflows run through one
command.

| | Bare artwork | Complete card render |
| --- | --- | --- |
| Aspect | ~0.852 | ~0.706 |
| What it is | What the prompts ask for | A full Covenant card with frame, nameplate and orb |
| What happens | Resized only | The artwork window is cropped out |

Bare artwork is preferred: on a complete render, most of the generated
resolution is spent on frame pixels that get cropped away.

## The art window

For a complete card render, measured against a **1054 × 1492** source:

| | |
| --- | --- |
| Crop box | `(74, 178) → (972, 1232)` |
| Cropped size | 898 × 1054 |
| Aspect ratio | **0.852** |

Other resolutions are fine — the crop box scales proportionally. Everything
lands at 720 px wide, WebP quality 84, typically 110–150 KB.

The bottom edge stops just above the tree-of-life orb, because the frame draws
its own orb over that seam.

## Why the frame is drawn in code

The game crops out the **artwork window** and redraws everything around it —
nameplate, orb, frame, text box — as a React component in
`src/components/card/Card.tsx`.

That is deliberate, and it buys four things:

1. **Live stats.** HP, attack costs, damage, weakness and retreat render as text
   over the frame. A supplied render has an empty text box and no HP, so a baked
   image could never show them.
2. **Balance without re-rendering art.** Changing an attack from 60 to 50 is a
   one-line data edit, not a new image.
3. **Damage counters and states.** HP bars, KO overlays, status markers and
   selection glows all composite over the card.
4. **Consistency.** All 74 cards share one frame, so a card on a placeholder
   sits beside a finished one without looking like a different game.

## Composition

The frame overlays the artwork in two places, so keep them clear — the prompts
say so, but it is worth knowing when judging a render:

- **Top eighth** sits under the nameplate.
- **Bottom centre**, a circle roughly 18% of the card width, is covered by the
  type orb.

Faces read best in the upper third. The five shipped cards place the subject's
eyeline around 30% from the top, which is worth matching.

## Art direction

`scripts/art-direction.ts` holds one hand-authored scene beat per card. It is
the part that decides whether a prompt produces the card you meant or a generic
illustration, so it is written per card rather than templated from the name.

```ts
'the-flood': {
  shape: 'scene',
  scene: 'A wall of grey water rising over a drowned valley, ...',
},
```

| Field | |
| --- | --- |
| `shape` | `portrait`, `creature`, `scene` or `object` — selects the composition block |
| `scene` | What is actually in the frame. The whole value of the file |
| `light` | Overrides the energy-type lighting. **Required** for cards with no type (Covenants and Relics) |

Style, composition and lighting live in `scripts/art-prompts.mjs` and are shared
across every prompt. Change the look of the whole set there; change one card
here.

`ALREADY_ILLUSTRATED` at the bottom of the direction file lists the five cards
that are done, kept only as a record — coverage itself is read from what is on
disk.

`src/data/__tests__/artCoverage.test.ts` fails if a card has no direction, if a
direction points at a card that does not exist or is already illustrated, if a
scene is too thin to produce a specific image, if a typeless card has no light,
or if two cards share a scene opening.

## Registering a card

Art alone is not enough — the card needs an entry in `src/data/cards.ts`, and
the `id` there must match the art filename exactly:

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
shipped state — not an error, and the card is fully playable. Replacing
placeholders is incremental: one card at a time, in any order, with no rebuild
of anything else.
