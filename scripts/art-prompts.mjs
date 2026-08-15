/**
 * Generates the card art prompt sheet.
 *
 *   npm run art:prompts    write the sheet
 *   npm run art:status     coverage only
 *
 * Reads the real card data rather than a copy. `src/data/cards.ts` imports
 * nothing at runtime — its single import is type-only and gets erased — so Node
 * can load it directly with type stripping. No parser, no extra dependency, and
 * no chance of the sheet drifting away from the set it describes.
 *
 * Writes docs/art-prompts.md for copying by hand and docs/art-prompts.json for
 * driving an image API in a loop.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ART_DIRECTION } from './art-direction.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ART_DIR = path.join(ROOT, 'public', 'art', 'cards')
const DOCS = path.join(ROOT, 'docs')

const { CARDS } = await import(path.join(ROOT, 'src', 'data', 'cards.ts'))
const { STARTER_CARD_IDS } = await import(path.join(ROOT, 'src', 'data', 'starter.ts'))

/* --------------------------------------------------------------- the style */

/**
 * Shared across every prompt, so each one is standalone and can be pasted
 * without assembling anything by hand.
 */
const STYLE = [
  'A painted illustration in the manner of a classical oil painting:',
  'painterly realism, visible brushwork in the shadows, fine detail in faces and',
  'textiles, strong chiaroscuro. Ancient Near Eastern setting, historically',
  'grounded — hand-woven striped wool, undyed linen, worked leather, rough-hewn',
  'stone. No anachronisms. A rich warm palette of ochre, umber, deep crimson and',
  'antique gold against near-black shadow, slightly desaturated, with the depth',
  'of aged varnish.',
].join(' ')

/** Composition per shape. */
const COMPOSITION = {
  portrait:
    'Compose as a portrait: the subject from mid-chest up, turned three-quarters, eyeline in the upper third of the frame looking off-frame toward the light. The setting falls away behind them — readable, but subordinate to the face.',
  creature:
    'Compose close on the creature so it fills the middle of the frame, alert and aware of the viewer. The setting is readable but subordinate.',
  scene:
    'Compose as a wide scene with no single face carrying it. The event itself is the subject; stage it so the eye lands in the upper third of the frame.',
  object:
    'Compose as a still life: one object, centred, lit like a museum piece against a dark ground. Textured surfaces, shallow depth of field. No hands and no people.',
}

/** Lighting per energy type. Cards without a type set their own. */
const LIGHT = {
  light: 'Warm god-rays breaking through high cloud, with gold rim-light on the subject.',
  fire: 'Firelight and drifting embers, a hot amber key light against deep shadow.',
  water: 'Rain-heavy blue-grey light, wet stone and spray, everything soaked through.',
  earth: 'Low dusty sunlight, ochre and umber, dry stone with grit hanging in the air.',
  spirit: 'A cool luminous glow with no visible source, pale gold and ivory.',
  shadow: 'Near-eclipse: deep indigo shadow with one narrow shaft of light.',
}

/**
 * Production constraints.
 *
 * Measured against the real frame in card.css rather than assumed, which
 * corrected two of them:
 *
 * The nameplate does NOT sit over the artwork. It spans 3.6–15.6cqw and the
 * art window starts at 17.4cqw, so the top of the image is fully visible —
 * and `object-position: 50% 18%` deliberately favours it. Asking for the top
 * eighth to be kept clear was throwing away the best part of the frame.
 *
 * The type orb does overlap, covering the bottom 8% of the window on a
 * compact card and 14% on a full one, about a fifth of the width, centred.
 *
 * The window itself changes shape with the card's size: 0.87 (near the whole
 * portrait) in the binder, on the mat and in hand; 1.45 — a wide band across
 * the top — at full size. So the lower third of a render is seen small and
 * not at all large, which is the one thing worth stating outright.
 */
const CONSTRAINTS = [
  'Portrait orientation, slightly taller than wide — roughly 6:7, about 896 by 1056 pixels.',
  'Fill the entire canvas with the illustration. No card frame, no border, no nameplate, no text, no lettering, no watermark, no signature, no logo.',
  'Compose so the whole subject sits within the upper two-thirds of the image: at large sizes the card crops to a wide band across the top, and the lowest third is not shown.',
  'Keep the bottom centre free of anything essential — a circular emblem sits there in the finished card.',
].join(' ')

/* ------------------------------------------------------------------ prompt */

function buildPrompt(card) {
  const direction = ART_DIRECTION[card.id]
  if (!direction) return null

  const lighting = direction.light
    ? `Lighting: ${direction.light}.`
    : LIGHT[card.type] ?? LIGHT.light

  return [
    STYLE,
    '',
    `Subject: ${direction.scene}`,
    '',
    COMPOSITION[direction.shape],
    '',
    lighting,
    '',
    CONSTRAINTS,
  ].join('\n')
}

/* ---------------------------------------------------------------- ordering */

/**
 * Story first-clear rewards, read out of the story file by pattern.
 *
 * `src/data/story/genesis.ts` cannot be imported the way the card data can —
 * it has a real runtime import behind a path alias that Node will not resolve.
 * The reward lines are one stable shape, so a match over the source is the
 * cheap correct answer rather than pulling in a bundler for one list.
 */
function storyRewardIds() {
  const file = path.join(ROOT, 'src', 'data', 'story', 'genesis.ts')
  if (!fs.existsSync(file)) return new Set()
  const source = fs.readFileSync(file, 'utf8')
  return new Set([...source.matchAll(/reward:\s*\{\s*cardId:\s*'([^']+)'/g)].map((m) => m[1]))
}

const RARITY_RANK = {
  crown: 6,
  sacred: 5,
  illustration: 4,
  anointed: 3,
  rare: 2,
  uncommon: 1,
  common: 0,
}

/**
 * Most-visible first, so stopping halfway still fixes the cards a player sees
 * most: the starter deck every new player opens with, then story rewards, then
 * the chase rarities, then everything else.
 */
function priority(card, starter, rewards) {
  if (starter.has(card.id)) return 0
  if (rewards.has(card.id)) return 1
  if (RARITY_RANK[card.rarity] >= RARITY_RANK.anointed) return 2
  return 3
}

/* ------------------------------------------------------------------- write */

const haveArt = new Set(
  fs.existsSync(ART_DIR)
    ? fs.readdirSync(ART_DIR).filter((f) => f.endsWith('.webp')).map((f) => f.replace('.webp', ''))
    : [],
)

const starter = new Set(STARTER_CARD_IDS)
const rewards = storyRewardIds()

const missing = CARDS.filter((card) => !haveArt.has(card.id)).sort((a, b) => {
  const pa = priority(a, starter, rewards)
  const pb = priority(b, starter, rewards)
  return (
    pa - pb || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.name.localeCompare(b.name)
  )
})

const undirected = missing.filter((card) => !ART_DIRECTION[card.id])

if (process.argv.includes('--status')) {
  console.log(`Art coverage: ${haveArt.size}/${CARDS.length} cards illustrated.`)
  console.log(`Awaiting art: ${missing.length}`)
  if (undirected.length) {
    console.log(`No direction written for: ${undirected.map((c) => c.id).join(', ')}`)
  }
  if (missing.length) {
    console.log('\nNext up:')
    missing.slice(0, 10).forEach((c, i) => console.log(`  ${i + 1}. ${c.name}  (${c.id})`))
  }
  process.exit(0)
}

if (undirected.length) {
  console.error(
    `No art direction for: ${undirected.map((c) => c.id).join(', ')}\n` +
      'Add entries to scripts/art-direction.ts before generating.',
  )
  process.exit(1)
}

const GROUP_LABEL = [
  'Starter deck — seen by every new player before anything else',
  'Story rewards — the card handed over on a first clear',
  'Chase rarities — Anointed and above',
  'The rest of the set',
]

const lines = [
  '# Card art prompts',
  '',
  '**Generated — do not edit by hand.** Run `npm run art:prompts` to rebuild.',
  '',
  `${missing.length} of ${CARDS.length} cards are awaiting art. Each prompt below is`,
  'standalone: paste it whole into ChatGPT, DALL·E or Gemini, save the result as',
  '`<card-id>.png`, and drop it in a folder.',
  '',
  'When the folder is ready:',
  '',
  '```bash',
  'npm run art:import -- --dir ~/covenant-art',
  '```',
  '',
  'Order is by how visible the card is in play, so stopping part-way still fixes',
  'the cards you see most.',
  '',
  '---',
  '',
]

let lastGroup = -1
for (const card of missing) {
  const group = priority(card, starter, rewards)
  if (group !== lastGroup) {
    lines.push(`## ${GROUP_LABEL[group]}`, '')
    lastGroup = group
  }

  const kind = card.kind === 'figure' ? `${card.type} · ${card.stage}` : card.kind
  const note = card.flavor ?? ('text' in card ? card.text : undefined)

  lines.push(
    `### ${card.name}`,
    '',
    `\`${card.id}.png\` · ${kind} · ${card.rarity}${card.verse ? ` · ${card.verse}` : ''}`,
    '',
    note ? `> ${note}` : '',
    note ? '' : '',
    '```text',
    buildPrompt(card),
    '```',
    '',
  )
}

fs.mkdirSync(DOCS, { recursive: true })
fs.writeFileSync(path.join(DOCS, 'art-prompts.md'), lines.filter((l) => l !== undefined).join('\n'))

fs.writeFileSync(
  path.join(DOCS, 'art-prompts.json'),
  JSON.stringify(
    {
      generated: 'npm run art:prompts',
      illustrated: haveArt.size,
      total: CARDS.length,
      cards: missing.map((card) => ({
        id: card.id,
        name: card.name,
        filename: `${card.id}.png`,
        kind: card.kind,
        type: card.type ?? null,
        rarity: card.rarity,
        verse: card.verse ?? null,
        shape: ART_DIRECTION[card.id].shape,
        prompt: buildPrompt(card),
      })),
    },
    null,
    2,
  ) + '\n',
)

console.log(`Wrote docs/art-prompts.md and docs/art-prompts.json — ${missing.length} prompts.`)
console.log(`Coverage: ${haveArt.size}/${CARDS.length} illustrated.`)
