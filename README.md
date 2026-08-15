<div align="center">

# The Covenant

**A trading card game drawn from scripture.**

Collect the faithful, build your deck, and contend for the covenant.

</div>

---

## What this is

The Covenant is a mobile-first collectible card battler. It borrows its screen
architecture and interaction feel from Pokémon TCG Pocket — a tap-to-enter
splash, a home hub built around a booster-pack carousel, two free packs a day on
a timer, a card binder, a deck builder, and fast head-to-head matches — and
applies it to characters, events and imagery from the Bible.

It ships as an installable PWA: open it in a phone browser, add it to the home
screen, and it launches full-screen with its own icon and works offline.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the engine and economy test suites |
| `npm run typecheck` | Typecheck without emitting |

## How the game plays

Two players, 20-card decks, first to **3 points** wins.

- A coin flip decides who goes first. **Heads** you, **tails** the opponent.
- Both draw 5. The deck reshuffles until your opening hand holds at least one
  Basic Figure, so there is no mulligan penalty.
- You place one Basic Figure in the Active slot and up to 3 on the Bench.
- The player going **first** gets no energy and cannot attack on turn 1 — they
  trade tempo for board position, and are first to Ascend on round 2. The player
  going **second** gets energy immediately and can attack straight away.
- Knocking out a Figure scores 1 point. Knocking out an **Anointed** scores 2.

Energy is not a card. Each deck declares one or two of the six types — Light,
Fire, Water, Earth, Spirit, Shadow — and the Altar supplies one per turn.

Figures **Ascend** rather than evolve. Some ascensions are a calling, where God
renames the same person (Abram → Abraham, Simon → Peter, Jacob → Israel); others
are a lineage, passing the promise down a generation (Abraham → Isaac → Jacob).

The full ruleset, including every tunable number, is in
**[docs/RULES.md](docs/RULES.md)**.

## Repository layout

```
public/art/cards/   Card artwork, one webp per card id — drop-in, see docs/ART.md
public/art/key/     Key art used by the splash
public/fonts/       Self-hosted Cinzel + Inter, so the PWA renders offline
scripts/            Art import pipeline
src/styles/         Design tokens — every colour, radius and shadow in the game
src/art/            Card back, energy orbs, rarity marks, pack wrappers, icons (SVG)
src/components/     The card frame and the shared neumorphic UI kit
src/data/           Card pool, pack definitions, story content
src/engine/         The rules engine: pure TypeScript, no React, fully tested
src/store/          Persisted player state — collection, economy, decks, progress
src/screens/        One file per screen
```

The engine is deliberately isolated. `src/engine/` is a reducer over an
immutable `MatchState` driven by a seeded RNG; it imports nothing from React and
touches no DOM. That keeps the rules unit-testable, makes matches deterministic
and replayable from a seed, and means the same code could run server-side if
online play is ever added. The battle screen only dispatches actions and renders
state.

## Artwork

Five cards ship with finished art. Every other card renders in the same
code-drawn frame with a typographic placeholder, and becomes a finished card the
moment real art is dropped in — no code change required. See
**[docs/ART.md](docs/ART.md)** for the contract and the import script.

## Credits

Card artwork and the Covenant key art are provided by the project owner. Cinzel
and Inter are licensed under the SIL Open Font License.
