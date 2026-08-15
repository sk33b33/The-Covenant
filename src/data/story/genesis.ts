import { DIFFICULTY } from '@/engine/ai'
import type { AiConfig } from '@/engine/ai'
import type { EnergyType } from '@/game/types'
import type { PlayerId } from '@/engine/types'

/**
 * Chapter One: Genesis.
 *
 * Five encounters, in order, each with a hand-built opposing deck rather than a
 * generated one — a scripted opponent is the only place in the game where the
 * deck is part of the writing. The Serpent plays disruption because that is
 * what the Serpent does; the Deluge plays a single overwhelming Anointed
 * because the flood is not a fair fight.
 *
 * Difficulty climbs through the AI's `mistakeRate` rather than by handing the
 * opponent extra resources. The first encounter is meant to be won with a
 * starter deck; the last is meant to take a real one.
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
    locked: true,
    theme: 'fire',
    encounters: [],
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
