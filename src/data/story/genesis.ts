import { DIFFICULTY } from '@/engine/ai'
import type { AiConfig } from '@/engine/ai'
import type { EnergyType } from '@/game/types'
import type { PlayerId } from '@/engine/types'

/**
 * Story mode, chapter by chapter.
 *
 * Every chapter's five encounters, in order, each with a hand-built opposing
 * deck rather than a generated one — a scripted opponent is the only place in
 * the game where the deck is part of the writing. The Serpent plays
 * disruption because that is what the Serpent does; the Deluge plays a single
 * overwhelming Anointed because the flood is not a fair fight; the Darkness
 * over Egypt plays nothing but Shadow because that is the one thing it has.
 *
 * Difficulty climbs through the AI's `mistakeRate` rather than by handing the
 * opponent extra resources, the same curve repeated once per chapter: the
 * first encounter is meant to be won with a starter deck, the last is meant
 * to take a real one. Card power climbs alongside it within each chapter —
 * commons and uncommons early, rares and the odd Anointed by the close — so
 * the mistake rate is not carrying the whole difficulty curve by itself.
 *
 * This file is still named for the first chapter it shipped with, `genesis`,
 * rather than for what it holds now — worth knowing if `exodus` and its
 * successors ever earn a file of their own.
 */

export interface Encounter {
  id: string
  chapter: string
  index: number
  title: string
  /** Who the player faces, shown on the nameplate. */
  opponent: string
  verse: string
  /** Tints the mat. */
  theme: EnergyType
  /** Shown before the match. */
  intro: string[]
  /** Shown on a first win. */
  victory: string[]
  /** Shown on a loss, so failure has a line too. */
  defeat: string
  difficulty: AiConfig
  /** Forced coin flip, where the encounter is meant to teach a specific rule. */
  forceFirst?: PlayerId
  deck: { cards: string[]; energy: EnergyType[] }
  reward: { cardId: string; talents: number; grace?: number }
}

export interface Chapter {
  id: string
  name: string
  subtitle: string
  /** Locked chapters render sealed and cannot be entered. */
  locked: boolean
  theme: EnergyType
  encounters: Encounter[]
}

/* ------------------------------------------------------------------ decks */

const SERPENT_DECK = {
  cards: [
    'the-serpent',
    'the-tempter',
    'the-tempter',
    'the-curse',
    'the-curse',
    'the-outer-darkness',
    'the-outer-darkness',
    'the-shadow-of-death',
    'the-shadow-of-death',
    // Adam stays: his first attack is colourless, so this Altar can pay for
    // it. Eve was here too and could not attack at all — every one of her
    // costs is Light, which a Shadow/Spirit Altar never supplies. The Cherubim
    // guard the way to the garden and are on-colour.
    'adam',
    'the-cherubim',
    'the-still-small-voice',
    'the-breath-of-life',
    'the-ladder-host',
    'the-scattering',
    'the-well-of-beersheba',
    'the-famine',
    'the-staff',
    'the-censer',
    'the-tent-of-meeting',
  ],
  energy: ['shadow', 'spirit'] as EnergyType[],
}

const CAIN_DECK = {
  cards: [
    'cain',
    'cain',
    'the-mark-of-cain',
    'the-mark-of-cain',
    'esau',
    'esau',
    'nimrod',
    'laban',
    'terah',
    'lot',
    'the-outer-darkness',
    'the-shadow-of-death',
    'the-curse',
    'babel',
    'the-famine',
    'the-scattering',
    'the-staff',
    'the-staff',
    'the-birthright',
    'the-well-of-beersheba',
  ],
  energy: ['earth', 'shadow'] as EnergyType[],
}

const FLOOD_DECK = {
  cards: [
    'the-deluge',
    'the-deluge',
    'leviathan',
    'leviathan',
    'the-firmament',
    'the-firmament',
    'noah',
    'shem',
    'japheth',
    'ham',
    'the-raven',
    'the-raven',
    'the-dove',
    'the-dove',
    'the-covenant-rainbow',
    'the-ark',
    'the-sabbath',
    'the-well-of-beersheba',
    'the-censer',
    'the-tent-of-meeting',
  ],
  energy: ['water', 'spirit'] as EnergyType[],
}

// Earth and Shadow, not Earth and Spirit. Babel and the Nephilim are the two
// cards this encounter is built around and both are Shadow-typed, so a Spirit
// Altar left them unable to attack at all — the tower would have stood there
// doing nothing. The ladder and the heavenly host went out with the Spirit.
const BABEL_DECK = {
  cards: [
    'babel',
    'babel',
    'nimrod',
    'nimrod',
    'the-nephilim',
    'the-nephilim',
    'the-tempter',
    'the-curse',
    'the-outer-darkness',
    'the-outer-darkness',
    'the-shadow-of-death',
    'esau',
    'terah',
    'laban',
    'the-scattering',
    'the-scattering',
    'the-famine',
    'the-staff',
    'the-staff',
    'the-stone-pillow',
  ],
  energy: ['earth', 'shadow'] as EnergyType[],
}

const TRIAL_DECK = {
  cards: [
    'melchizedek',
    'melchizedek',
    'abraham',
    'abraham',
    'abram',
    'abram',
    'isaac',
    'isaac',
    'sarah',
    'sarah',
    'the-angel-of-the-lord',
    'the-ram-in-the-thicket',
    'enoch',
    'the-garden-of-eden',
    'the-binding',
    'the-binding',
    'jacobs-blessing',
    'the-sabbath',
    'the-ark',
    'the-signet-ring',
  ],
  energy: ['light', 'spirit'] as EnergyType[],
}

/* -------------------------------------------------------------- Exodus decks */

const PHARAOH_DECK = {
  cards: [
    // Nimrod stands in for Pharaoh's own might — no Pharaoh card exists, and
    // "a mighty one" is exactly what the part calls for.
    'nimrod',
    'nimrod',
    'the-outer-darkness',
    'the-outer-darkness',
    'the-shadow-of-death',
    'the-shadow-of-death',
    'the-curse',
    'the-curse',
    'esau',
    'esau',
    'laban',
    'terah',
    'lot',
    'babel',
    'the-scattering',
    'the-famine',
    'the-staff',
    'the-staff',
    'the-well-of-beersheba',
    'the-well-of-beersheba',
  ],
  energy: ['earth', 'shadow'] as EnergyType[],
}

// Mono-Shadow on purpose: a darkness that can be felt has nothing else in it.
const DARKNESS_DECK = {
  cards: [
    'the-outer-darkness',
    'the-outer-darkness',
    'the-shadow-of-death',
    'the-shadow-of-death',
    'the-curse',
    'the-curse',
    'the-tempter',
    'the-tempter',
    'the-nephilim',
    'the-nephilim',
    'babel',
    'babel',
    'lamech',
    'lamech',
    'the-famine',
    'the-scattering',
    'the-staff',
    'the-staff',
    'the-well-of-beersheba',
    'the-well-of-beersheba',
  ],
  energy: ['shadow'] as EnergyType[],
}

// Mono-Water too: nothing on either side of the corridor but sea.
const RED_SEA_DECK = {
  cards: [
    'the-red-sea',
    'the-red-sea',
    'miriam',
    'miriam',
    'leviathan',
    'leviathan',
    'the-firmament',
    'the-firmament',
    'the-dove',
    'the-dove',
    'the-raven',
    'the-raven',
    'shem',
    'japheth',
    'ham',
    'the-well-of-beersheba',
    'the-well-of-beersheba',
    'the-censer',
    'the-ark',
    'the-sabbath',
  ],
  energy: ['water'] as EnergyType[],
}

const GOLDEN_CALF_DECK = {
  cards: [
    'nadab-and-abihu',
    'nadab-and-abihu',
    'the-serpents-curse',
    'the-serpents-curse',
    'the-altar-fire',
    'the-altar-fire',
    'babel',
    'babel',
    'the-outer-darkness',
    'the-outer-darkness',
    'the-tempter',
    'the-curse',
    'the-curse',
    'the-scattering',
    'the-famine',
    'the-staff',
    'the-staff',
    'the-well-of-beersheba',
    'the-well-of-beersheba',
    'the-signet-ring',
  ],
  energy: ['fire', 'shadow'] as EnergyType[],
}

const GLORY_DECK = {
  cards: [
    'archangel-michael',
    'archangel-michael',
    'the-cherubim',
    'the-cherubim',
    'the-angel-of-the-lord',
    'the-angel-of-the-lord',
    'the-three-visitors',
    'the-three-visitors',
    'gabriel',
    'gabriel',
    'the-breath-of-life',
    'the-breath-of-life',
    'the-ladder-host',
    'enoch',
    'the-binding',
    'the-binding',
    'jacobs-blessing',
    'the-sabbath',
    'the-ark',
    'the-signet-ring',
  ],
  energy: ['light', 'spirit'] as EnergyType[],
}

/* ------------------------------------------------------------- encounters */

const GENESIS_ENCOUNTERS: Encounter[] = [
  {
    id: 'the-garden',
    chapter: 'genesis',
    index: 1,
    title: 'The Garden',
    opponent: 'The Serpent',
    verse: 'Genesis 3:1',
    theme: 'shadow',
    intro: [
      'The garden is quiet in the cool of the day.',
      'Something in the branches has been listening a long while, and it speaks first.',
      '"Did God really say?"',
    ],
    victory: [
      'The voice goes quiet. The branches are only branches again.',
      'But the question it asked does not leave the garden with you.',
    ],
    defeat: 'The question stays with you. Come back when you have an answer.',
    // The opening encounter teaches the turn-1 handicap from the better side.
    difficulty: DIFFICULTY.gentle,
    forceFirst: 'you',
    deck: SERPENT_DECK,
    reward: { cardId: 'the-tempter', talents: 120 },
  },
  {
    id: 'cain-and-abel',
    chapter: 'genesis',
    index: 2,
    title: 'Cain & Abel',
    opponent: 'Cain',
    verse: 'Genesis 4:7',
    theme: 'earth',
    intro: [
      'Two offerings on two altars. Only one column of smoke goes straight up.',
      'Cain does not look at his brother. He looks at the ground, and his face falls.',
      '"Sin is crouching at your door. Its desire is for you."',
    ],
    victory: [
      'The field is still. Somewhere a voice asks where his brother is.',
      'The ground does not answer, but it remembers.',
    ],
    defeat: 'The smoke drifts sideways. Try again when your offering is ready.',
    difficulty: DIFFICULTY.gentle,
    deck: CAIN_DECK,
    reward: { cardId: 'abel', talents: 140, grace: 2 },
  },
  {
    id: 'the-flood',
    chapter: 'genesis',
    index: 3,
    title: 'The Flood',
    opponent: 'The Deluge',
    verse: 'Genesis 7:11',
    theme: 'water',
    intro: [
      'The fountains of the great deep burst forth, and the windows of heaven are opened.',
      'There is no army to fight here. There is only water, and how long you can stand in it.',
    ],
    victory: [
      'The dove does not come back. The waters have gone down off the earth.',
      'A bow is set in the cloud, and it is not drawn.',
    ],
    defeat: 'The water closes over. Forty days is a long time to hold out.',
    difficulty: DIFFICULTY.steady,
    deck: FLOOD_DECK,
    reward: { cardId: 'noah', talents: 180, grace: 2 },
  },
  {
    id: 'the-tower',
    chapter: 'genesis',
    index: 4,
    title: 'The Tower',
    opponent: 'Babel',
    verse: 'Genesis 11:4',
    theme: 'earth',
    intro: [
      '"Come, let us build ourselves a city, and a tower with its top in the heavens."',
      '"Let us make a name for ourselves, lest we be scattered."',
      'The bricks are good. The mortar is good. The reason is not.',
    ],
    victory: [
      'The work stops. Not because the tower fell, but because no one can ask for another brick.',
      'They leave off building the city, and are scattered over the face of all the earth.',
    ],
    defeat: 'The tower goes up another course. Nobody understands why you stopped.',
    difficulty: DIFFICULTY.steady,
    deck: BABEL_DECK,
    reward: { cardId: 'babel', talents: 220, grace: 3 },
  },
  {
    id: 'the-covenant',
    chapter: 'genesis',
    index: 5,
    title: 'The Covenant',
    opponent: 'The Trial of Abraham',
    verse: 'Genesis 22:12',
    theme: 'light',
    intro: [
      'Three days walking, and the mountain is in sight.',
      '"Behold, the fire and the wood. But where is the lamb for the offering?"',
      '"God will provide for himself the lamb, my son."',
    ],
    victory: [
      'The hand is stayed. There is a ram caught in the thicket by its horns.',
      '"Now I know." The covenant is cut, and it is not cut with you alone.',
    ],
    defeat: 'The mountain is still there. So is the question it asks.',
    difficulty: DIFFICULTY.hard,
    deck: TRIAL_DECK,
    reward: { cardId: 'melchizedek', talents: 320, grace: 6 },
  },
]

const EXODUS_ENCOUNTERS: Encounter[] = [
  {
    id: 'bricks-without-straw',
    chapter: 'exodus',
    index: 1,
    title: 'Bricks Without Straw',
    opponent: 'Pharaoh',
    verse: 'Exodus 5:7',
    theme: 'earth',
    intro: [
      'The quota has not changed. The straw has stopped coming.',
      'A taskmaster stands over the brickfield, counting.',
      '"Who is the Lord, that I should listen to his voice?"',
    ],
    victory: [
      'The bricks stack unevenly, but they stack. The count is made, somehow.',
      'A voice in the brickfields says a word no one there has heard before: freedom.',
    ],
    defeat: 'The quota stands. Gather the stubble yourselves and go on.',
    difficulty: DIFFICULTY.gentle,
    deck: PHARAOH_DECK,
    reward: { cardId: 'nimrod', talents: 140 },
  },
  {
    id: 'plague-of-darkness',
    chapter: 'exodus',
    index: 2,
    title: 'The Plague of Darkness',
    opponent: 'The Darkness over Egypt',
    verse: 'Exodus 10:22',
    theme: 'shadow',
    intro: [
      'Moses stretches his hand toward the sky, and the sky answers.',
      'A darkness that can be felt settles over the land, three days deep.',
      'No one rises from where they are. No one can see their brother.',
    ],
    victory: [
      'Light finds a seam in it and does not stop finding one.',
      'In Goshen, where the Israelites are, there is light where they live.',
    ],
    defeat: 'The dark holds. Wait for a light that does not come from you.',
    difficulty: DIFFICULTY.gentle,
    deck: DARKNESS_DECK,
    reward: { cardId: 'lamech', talents: 170, grace: 2 },
  },
  {
    id: 'the-red-sea',
    chapter: 'exodus',
    index: 3,
    title: 'The Red Sea',
    opponent: 'The Red Sea',
    verse: 'Exodus 14:21',
    theme: 'water',
    intro: [
      'The sea in front, chariots behind, and nowhere that is not water or Egypt.',
      '"Stand firm, and see the salvation of the Lord."',
      'A wind out of the east begins, and does not stop all night.',
    ],
    victory: [
      'A wall on the right hand and a wall on the left, and dry ground between them.',
      'By morning the sea is only a sea again, and it has taken the horses and the riders.',
    ],
    defeat: 'The water holds its shape a moment longer than you needed it to.',
    difficulty: DIFFICULTY.steady,
    deck: RED_SEA_DECK,
    reward: { cardId: 'miriam', talents: 210, grace: 2 },
  },
  {
    id: 'the-golden-calf',
    chapter: 'exodus',
    index: 4,
    title: 'The Golden Calf',
    opponent: 'The Golden Calf',
    verse: 'Exodus 32:4',
    theme: 'fire',
    intro: [
      'Forty days is a long time to wait for a voice you cannot see.',
      'The gold comes off in earrings, and goes into the fire, and comes out an answer.',
      '"These are your gods, O Israel."',
    ],
    victory: [
      'The calf is ground to powder and scattered on the water. The camp drinks it down.',
      'Moses comes down the mountain, and the tablets in his hands do not survive what he sees.',
    ],
    defeat: 'The dance goes on around the fire. Someone has to come down the mountain.',
    difficulty: DIFFICULTY.steady,
    deck: GOLDEN_CALF_DECK,
    reward: { cardId: 'nadab-and-abihu', talents: 260, grace: 3 },
  },
  {
    id: 'face-to-face',
    chapter: 'exodus',
    index: 5,
    title: 'Face to Face',
    opponent: 'The Glory of the Lord',
    verse: 'Exodus 33:11',
    theme: 'light',
    intro: [
      '"Please show me your glory."',
      '"I will make all my goodness pass before you — but you cannot see my face and live."',
      'A hand covers him in the cleft of the rock, until the glory has passed by.',
    ],
    victory: [
      'The hand is lifted. What is left is only the back of it, going away — enough, and almost more than a man can carry.',
      'His face is still shining when he comes down, and he does not know it, and he has to wear a veil so no one has to look away.',
    ],
    defeat: 'The rock holds you a moment longer. The glory has not finished passing.',
    difficulty: DIFFICULTY.hard,
    deck: GLORY_DECK,
    // The chapter's own capstone, same as Melchizedek closing Genesis: not a
    // card from the fight itself, but what the whole chapter was earning
    // toward. You do not meet Moses until you have walked the road with him.
    reward: { cardId: 'moses', talents: 380, grace: 6 },
  },
]

/* ---------------------------------------------------------------- chapters */

export const CHAPTERS: Chapter[] = [
  {
    id: 'genesis',
    name: 'Genesis',
    subtitle: 'In the beginning',
    locked: false,
    theme: 'light',
    encounters: GENESIS_ENCOUNTERS,
  },
  {
    id: 'exodus',
    name: 'Exodus',
    subtitle: 'Let my people go',
    locked: false,
    theme: 'fire',
    encounters: EXODUS_ENCOUNTERS,
  },
  {
    id: 'kings',
    name: 'Kings',
    subtitle: 'A crown and a harp',
    locked: true,
    theme: 'earth',
    encounters: [],
  },
  {
    id: 'prophets',
    name: 'Prophets',
    subtitle: 'A voice in the wilderness',
    locked: true,
    theme: 'spirit',
    encounters: [],
  },
  {
    id: 'gospel',
    name: 'Gospel',
    subtitle: 'The Word made flesh',
    locked: true,
    theme: 'water',
    encounters: [],
  },
  {
    id: 'revelation',
    name: 'Revelation',
    subtitle: 'Behold, I make all things new',
    locked: true,
    theme: 'shadow',
    encounters: [],
  },
]

export const ALL_ENCOUNTERS = CHAPTERS.flatMap((c) => c.encounters)

export const getEncounter = (id: string) => ALL_ENCOUNTERS.find((e) => e.id === id)

/** An encounter unlocks once the one before it in its chapter is cleared. */
export function isEncounterUnlocked(encounter: Encounter, cleared: string[]): boolean {
  if (encounter.index <= 1) return true
  const chapter = CHAPTERS.find((c) => c.id === encounter.chapter)
  const previous = chapter?.encounters.find((e) => e.index === encounter.index - 1)
  return previous ? cleared.includes(previous.id) : true
}
