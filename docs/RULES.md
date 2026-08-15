# The Covenant — Rules

Two players. 20-card decks. First to **3 points** wins.

Every number marked ⚙ is a tunable default and lives in
`src/engine/config.ts`. Nothing in the engine hardcodes a rule value.

---

## 1. Cards

### Figures

People. A Figure has a name, an energy type, a stage, HP, one or two attacks, a
weakness, and a retreat cost.

| Stage | Meaning |
| --- | --- |
| `basic` | Plays straight from hand onto the Active spot or Bench |
| `ascended-1` | Placed on top of the Figure named in `ascendsFrom` |
| `ascended-2` | Placed on top of an `ascended-1` |

An **Anointed** Figure is the game's heavyweight: higher HP and damage, but
knocking one out scores the opponent **2 points** instead of 1.

### Covenants

Supporter cards — a person or a divine act that intervenes once. **⚙ One
Covenant per turn.**

### Relics

Item cards. **Unlimited per turn.**

### Energy is not a card

Each deck declares one or two energy types. At the start of each turn the Altar
supplies one energy of a declared type, chosen at random between them. This
keeps all 20 slots in a deck filled with real content and removes the
energy-flood and energy-drought problem entirely.

---

## 2. The six types

| Type | Beats | Weak to |
| --- | --- | --- |
| Light | Shadow | Shadow |
| Shadow | Light | Light |
| Water | Fire | Spirit |
| Fire | Earth | Water |
| Earth | Spirit | Fire |
| Spirit | Water | Earth |

Light and Shadow are deliberately mutually weak — they answer each other, and
neither is safe.

An attack against a Figure weak to its type deals **⚙ +20** damage. Weakness is
additive, applied after the base damage and any modifiers.

---

## 3. Ascension

Figures **Ascend** rather than evolve. Two kinds, one mechanic:

- **Calling** — God renames the same person. Abram → Abraham. Simon → Peter.
  Saul → Paul. Jacob → Israel. Gideon → Mighty Warrior.
- **Lineage** — the promise passes down a generation. Abraham → Isaac → Jacob.

Ascending places the new card on top of the old one. The Figure keeps its damage
and its attached energy, and any status conditions are cleared.

**A Figure may not Ascend on the turn it entered play.** This includes the turn
it was placed during setup, so the earliest possible Ascension is round 2 — and
the player who went first reaches it one turn ahead of their opponent.

---

## 4. Deck construction

| Rule | Value |
| --- | --- |
| Deck size | ⚙ exactly 20 |
| Copies of any one card | ⚙ maximum 2 |
| Basic Figures | ⚙ at least 1 |
| Declared energy types | ⚙ 1–2 |

A deck failing any of these cannot be taken into a match.

---

## 5. Opening a match

1. **Coin flip.** Heads, you go first; tails, the opponent does.
2. **Draw 5.** The deck reshuffles until the opening five contains at least one
   Basic Figure. There is no mulligan penalty — you simply always have a legal
   opening.
3. **Setup.** Place one Basic Figure in the Active spot and up to **⚙ 3** on the
   Bench, then start the battle. Both players do this simultaneously and
   privately.

### The turn-1 handicap

The player going **first**:

- receives **no energy** on turn 1
- **cannot attack** on turn 1
- is first to Ascend on round 2

The player going **second**:

- receives energy on their first turn
- may attack immediately

This is the balance point of the whole game. Going first buys board development;
going second buys tempo.

---

## 6. The turn

| Phase | What happens |
| --- | --- |
| **Draw** | Draw 1. Drawing from an empty deck **loses the match**. |
| **Altar** | Gain 1 energy of a declared type. Skipped for the first player on turn 1. |
| **Main** | Play Figures to the Bench, attach **⚙ 1** energy, Ascend, play Relics freely, play **⚙ 1** Covenant, retreat **⚙ once** by paying its cost. |
| **Battle** | Declare one attack from the Active Figure. Apply weakness. Resolve knockouts. |
| **End** | Status conditions tick, then the turn passes. |

**⚙ 60 seconds per turn. ⚙ 20:00 total per player.** A turn that times out
passes automatically. If a player's match clock runs out, the match is decided
on points, and on total damage dealt if points are level.

---

## 7. Knockouts and points

A Figure with damage equal to or greater than its HP is knocked out. It and
everything stacked beneath it goes to the discard pile.

| Knocked out | Points |
| --- | --- |
| Figure | **1** |
| Anointed Figure | **2** |

The player who knocked it out takes the points. The player who lost the Figure
then promotes one from their Bench into the Active spot.

### Winning

- Reach **⚙ 3 points**.
- Your opponent must draw from an empty deck.
- Your opponent has no Figure to promote into the Active spot.

---

## 8. Status conditions

| Status | Effect | Clears |
| --- | --- | --- |
| **Blessed** | +⚙ 20 damage on its attacks | End of its next turn |
| **Bound** | Cannot retreat | End of its next turn |
| **Blinded** | Coin flip before attacking; tails, the attack fails | End of its next turn |
| **Afflicted** | ⚙ 10 damage at the End phase | When it leaves the Active spot |
| **Slumber** | Cannot attack or retreat; coin flip at End to wake | Coin flip, or leaving the Active spot |

Ascending clears all status conditions. Retreating clears Afflicted and Slumber.

---

## 9. Packs

**⚙ 5 cards per pack.**

| Rarity | Mark |
| --- | --- |
| Common | ◆ |
| Uncommon | ◆◆ |
| Rare | ◆◆◆ |
| Anointed | ◆◆◆◆ |
| Illustration | ★ |
| Sacred Art | ★★ |
| Crown | ♛ |

- Slots 1–3 are always Common.
- Slot 4 is Uncommon or better.
- Slot 5 is weighted most generously.
- **⚙ Pity:** a Rare or better is guaranteed at least once every 10 packs.

Duplicates convert to Talents automatically, scaled by rarity.

---

## 10. Economy

| Currency | Earned from | Spent on |
| --- | --- | --- |
| **Talents** | Battles, missions, story first-clears, duplicate cards | Packs in the Shop |
| **Grace** | Missions and milestones | Instantly refilling a pack slot |

**⚙ Two pack slots, each refilling on a 12-hour timer.** Playing morning and
evening yields both free packs each day.

---

## 11. Story

Six chapters, Genesis through Revelation. Genesis is playable; the rest are
sealed.

| # | Encounter | Opponent | Type |
| --- | --- | --- | --- |
| 1 | The Garden | The Serpent | Shadow |
| 2 | Cain & Abel | Cain | Earth |
| 3 | The Flood | The Deluge | Water |
| 4 | The Tower | Babel | Earth / Spirit |
| 5 | The Covenant | The Trial of Abraham | Light |

Each has dialogue before and after, a hand-built opposing deck, rising
difficulty, and a first-clear reward of a fixed card plus Talents.

---

## 12. The opponent

The AI is heuristic, not learned. Each turn it enumerates every legal action —
the same list the interface offers a human — and scores them:

1. An attack that wins the match
2. An attack that knocks out a Figure
3. Damage into a type weakness
4. Ascending
5. Developing the Bench
6. Energy efficiency

A difficulty-scaled error rate makes it discard its best option some of the
time, so early story encounters stay winnable and later ones do not.
