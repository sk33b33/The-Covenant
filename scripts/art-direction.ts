/**
 * Art direction for The Covenant.
 *
 * One authored scene beat per card. This is deliberately hand-written rather
 * than templated off the card name: "a painting of The Firmament" gets you a
 * shrug from any image model, and the difference between a usable prompt and a
 * generic one is entirely in the concrete nouns. Every entry below names what
 * is actually in the frame.
 *
 * `shape` decides composition, and it is set per card rather than derived from
 * `kind`, because the set is not neatly divided. Several Figures are not people
 * at all — the Deluge, the Firmament, Babel — and framing them as portraits
 * would be wrong.
 *
 *   portrait  a person, upper body, eyeline high
 *   creature  an animal or being, seen close
 *   scene     an event; no single face carries it
 *   object    a single thing, still life, lit like a museum piece
 *
 * `light` overrides the energy-type lighting where a card needs its own. Cards
 * with no energy type — every Covenant and Relic — must set it.
 *
 * Kept out of src/data/ on purpose: this is production tooling, not game data,
 * and nothing the app ships needs to know it exists.
 */

/**
 * How a card is framed. Set per card rather than derived from `kind`, because
 * the set is not neatly divided — several Figures are phenomena, not people.
 */
export type Shape = 'portrait' | 'creature' | 'scene' | 'object'

export interface Direction {
  shape: Shape
  /** What is actually in the frame. The whole value of this file. */
  scene: string
  /** Overrides the energy-type lighting. Required for cards with no type. */
  light?: string
}

export const ART_DIRECTION: Record<string, Direction> = {
  /* ---------------------------------------------------------------- Light */

  adam: {
    shape: 'portrait',
    scene:
      'The first man, newly made, kneeling in wet clay at the edge of a garden. Bare-shouldered, dust still on his forearms, one hand pressed to his own chest as if feeling breath arrive for the first time. Unlined face, no beard yet, an expression closer to astonishment than joy.',
  },
  eve: {
    shape: 'portrait',
    scene:
      'A woman standing beneath heavy fruit-laden branches, long dark hair unbound, a fig leaf caught in her fingers. She is half-turned away from a fruit tree behind her, weight shifting, caught in the instant before a decision rather than after it.',
  },
  abel: {
    shape: 'portrait',
    scene:
      'A young shepherd kneeling at a low stone altar, a lamb\'s fleece folded over his forearms and the smoke of his offering going straight up through still air. Unshorn hair, undyed tunic, hands that have handled animals since he could walk. He is watching the smoke rise, not the viewer.',
  },
  seth: {
    shape: 'portrait',
    scene:
      'A man in early middle age at a newly raised family altar, hands open at his sides, mouth just parted on the first word of a prayer. Low dwellings and cook-fires behind him, a line starting over. He carries his dead brother\'s face and does not know it.',
  },
  enoch: {
    shape: 'portrait',
    scene:
      'An old man mid-stride on a hilltop path, walking away from the viewer but glancing back, his outline already going translucent at the edges where the light touches it. Empty sandals left on the stones behind him. Nothing dramatic — he is simply not going to arrive.',
  },
  sarah: {
    shape: 'portrait',
    scene:
      'An elderly woman at a tent flap, one hand covering her mouth, eyes bright with a laugh she is trying to hold in. Fine lines at her eyes, grey hair under a striped head covering, a bowl of curds set down forgotten beside her.',
  },
  abram: {
    shape: 'portrait',
    scene:
      'A weathered herdsman standing at the edge of everything he owns, staff in hand, a loaded pack camel and rolled tents behind him. He is looking out at open country he has never crossed. Travel dust on his robe, sandals already worn through.',
  },
  abraham: {
    shape: 'portrait',
    scene:
      'The same man, older and grander, standing beneath a night-bright sky thick with stars, arms loose at his sides, head tipped back to count what cannot be counted. Silver in his beard now, a heavier striped mantle, deep calm in the face.',
  },
  isaac: {
    shape: 'portrait',
    scene:
      'A young man on his back atop a stack of split wood, seen close and from above: bound wrists crossed on his chest, chin lifted, eyes open and steady on something past the frame. Rope, bark, and one curled horn of a ram caught in thicket behind his head.',
  },
  melchizedek: {
    shape: 'portrait',
    scene:
      'A priest-king in white linen with a plain gold circlet, holding out a round loaf in one hand and a shallow cup of dark wine in the other. City walls of Salem behind him. No genealogy in the face — he could be forty or four hundred.',
  },
  'jesus-carrying-cross': {
    shape: 'portrait',
    scene:
      'A man bent almost double beneath a rough crossbeam lashed across his shoulders, one hand gripping the wood, the other braced against the stones of a narrow street. Blood dried at the hairline, dust in the beard, breath held. The frame stays with him; no one in the crowd is given a face.',
  },
  'the-garden-of-eden': {
    shape: 'scene',
    scene:
      'A walled garden seen from within at first morning: four rivers braiding out from a spring, fruit trees in impossible simultaneous bloom and harvest, animals at ease in the middle distance and no fear anywhere in the composition. Not a jungle — a cultivated, ordered paradise.',
  },
  'the-tree-of-life': {
    shape: 'scene',
    scene:
      'A single vast tree at the centre of the frame, trunk fluted like a column, twelve kinds of fruit hanging together on the same branches, leaves catching light like beaten metal. Roots drink from a clear river at its base. Nothing else competes for attention.',
  },
  job: {
    shape: 'portrait',
    scene:
      'A man seated on a heap of ashes outside a ruined homestead, potsherd in one hand for scraping sores, robe torn and head shaved in mourning. Three distant figures wait at the edge of the frame, not yet approaching. His face holds grief without collapse.',
  },
  hannah: {
    shape: 'portrait',
    scene:
      'A woman kneeling alone at the entrance of a hillside shrine at dusk, lips moving without sound, hands pressed together, an empty small tunic folded over one arm. No child yet in the frame — only the shape of a prayer being made.',
  },

  /* ---------------------------------------------------------------- Earth */

  jacob: {
    shape: 'portrait',
    scene:
      'A traveller sitting up out of sleep on open stony ground at first light, one hand still resting on the flat stone he used for a pillow, looking at the empty air above the hillside where something was. Cloak twisted from the night, dust on one cheek, wholly awake.',
  },
  israel: {
    shape: 'portrait',
    scene:
      'A man at daybreak after an all-night fight, robe torn at the shoulder, favouring one hip, dirt ground into his knuckles. His face is not beaten — it is fixed, stubborn, changed. First light on a ford of the Jabbok behind him.',
  },
  cain: {
    shape: 'portrait',
    scene:
      'A farmer standing over a stone altar heaped with grain and cut fruit whose smoke will not rise — it crawls sideways along the ground. Broad shoulders, soil under the nails, jaw set. He is looking away from his own offering.',
  },
  nimrod: {
    shape: 'portrait',
    scene:
      'A heavy-built hunter in a lion pelt with a composite bow across his back, foot planted on a felled beast, city walls rising behind him. Braided beard, gold at the wrists. Every line of him says he intends to be remembered.',
  },
  esau: {
    shape: 'portrait',
    scene:
      'A red-haired, thickly bearded man crouched over a clay bowl of red lentil stew, eating fast with both hands, hunting bow dropped in the dirt beside him. Sunburnt, dust-caked, entirely present in the meal and nowhere else.',
  },
  laban: {
    shape: 'portrait',
    scene:
      'A prosperous herd-owner with a shrewd, pleasant face, counting spotted and speckled sheep as they pass a gate, one hand raised mid-tally. Fine wool robe, rings on the fingers. The smile does not reach the eyes.',
  },
  terah: {
    shape: 'portrait',
    scene:
      'An old patriarch seated on a loaded cart at a crossroads outside Ur, looking back toward a ziggurat on the horizon he has decided to leave. Tired, unresolved, a journey begun that he will not finish.',
  },
  lot: {
    shape: 'portrait',
    scene:
      'A man hurrying downhill by the hand of someone out of frame, robe gathered up in one fist, head turned rigidly forward with visible effort. Behind him, a red glow on the underside of the smoke. He is not looking back.',
  },
  joseph: {
    shape: 'portrait',
    scene:
      'A young man in a long sleeved coat of banded colour — indigo, saffron, madder — standing straight-backed among plain-robed brothers who are turned away from him. Untroubled, a little too certain, still holding a dream he has not learned to keep quiet.',
  },
  'the-ram-in-the-thicket': {
    shape: 'creature',
    scene:
      'A heavy-horned ram caught fast by its curling horns in a dense thorn bush on a bare mountainside, breath steaming, dark eye fixed on the viewer. Utterly still. Provision arriving exactly on time and knowing it.',
  },
  babel: {
    shape: 'scene',
    scene:
      'An unfinished stepped tower of fired brick and black bitumen rising into low cloud, ramps and scaffolding crawling with tiny figures, baskets and hods abandoned mid-course. Ambitious, ugly, enormous. The top disappears rather than arrives.',
  },
  rebekah: {
    shape: 'portrait',
    scene:
      'A young woman at a stone well at evening, water jar braced on one shoulder and a second jar tipped mid-pour into a stone trough for waiting camels. Veil loose, sleeve pushed back, an unhesitating look toward a stranger just arrived at the edge of frame.',
  },
  rachel: {
    shape: 'portrait',
    scene:
      "A shepherdess at a well among grazing flocks, crook in hand, hair windblown under a plain headscarf. She is watching someone roll a heavy stone from the well's mouth on her behalf, expression caught between surprise and recognition.",
  },

  /* ---------------------------------------------------------------- Water */

  noah: {
    shape: 'portrait',
    scene:
      'A grey-bearded shipwright with an adze in one hand, sawdust and pitch on his forearms, standing before the vast unfinished ribs of a wooden hull that dwarfs him. Rain has not started. Nobody around him believes it will.',
  },
  'the-deluge': {
    shape: 'scene',
    scene:
      'The moment the deep breaks open: black water bursting upward from fissured ground while sheets of rain come down to meet it, the last hilltops going under, sky and sea no longer distinguishable. No ark, no survivors in frame — only the water winning.',
  },
  'the-dove': {
    shape: 'creature',
    scene:
      'A white dove on the wing against a clearing sky, a freshly plucked olive sprig held crosswise in its beak, wingtips catching the first clean sunlight in forty days. Below and far off, water still covering everything.',
  },
  'the-raven': {
    shape: 'creature',
    scene:
      'A large black raven perched on a floating spar of wreckage above grey water, feathers oil-sheened, head cocked, entirely at home in a drowned world. Nothing in its beak. It has no intention of returning.',
  },
  shem: {
    shape: 'portrait',
    scene:
      'A steady, dark-eyed son of Noah walking backwards with a folded cloak held up behind him, face carefully averted, jaw tight with the effort of not looking. Dignity doing hard, unglamorous work.',
  },
  japheth: {
    shape: 'portrait',
    scene:
      'The youngest brother at a ship rail looking outward at open coastline, wind in a loose head-cloth, a rolled chart of coastlines under one arm. Restless, already measuring how far the world goes.',
  },
  ham: {
    shape: 'portrait',
    scene:
      'A brother caught mid-turn in a tent doorway, mouth open on a word he should not be saying, one hand still on the flap. A little too pleased with what he has seen.',
  },
  leviathan: {
    shape: 'creature',
    scene:
      'An immense sea-beast breaching in a storm-black sea, overlapping scales like shield plates shedding water, a double row of teeth, one ancient eye above the waterline. Most of the body stays under. It is bigger than the frame allows.',
  },
  'the-firmament': {
    shape: 'scene',
    scene:
      'The waters divided: a burnished vault of sky holding an ocean above it, sunlight refracting through the boundary in bands, a calm sea beneath mirroring it exactly. Cosmological and architectural, more diagram than weather.',
  },
  'the-covenant-rainbow': {
    shape: 'scene',
    scene:
      'A full rainbow standing over a drowned valley where the water has just begun to fall, its arc set in clearing storm cloud like a war bow hung up and unstrung. Wet mud, the first green, an altar of rough stones smoking on high ground.',
  },
  miriam: {
    shape: 'portrait',
    scene:
      'A woman on a sandy shore leading a line of dancing women, tambourine raised overhead mid-strike, hem soaked from the sea. Behind her the water has just gone still after standing in walls; ahead, wreckage rides the tideline.',
  },
  'the-red-sea': {
    shape: 'scene',
    scene:
      'Two sheer cliffs of dark green seawater standing apart on either side of a wide corridor of wet, rutted seabed, spray still hanging in the air above the walls, fish visible suspended inside the water itself. No shore in the frame — only the corridor.',
  },

  /* ----------------------------------------------------------------- Fire */

  'the-flaming-sword': {
    shape: 'object',
    scene:
      'A bronze sword hanging unsupported in the air at the eastern gate of a walled garden, wreathed in fire and turning slowly on its own axis, scorching the stone beneath. No hand holds it. The gate behind it is shut.',
  },
  'sodom-and-gomorrah': {
    shape: 'scene',
    scene:
      'Two cities on a plain under a rain of burning sulphur, streets already alight, a column of smoke going up like the smoke of a furnace. Seen from a ridge at distance, small and absolute. Salt crusting the foreground stones.',
  },
  'the-burning-bush': {
    shape: 'scene',
    scene:
      'A thorn bush on a bare Midian slope entirely enveloped in fire and completely unburnt — every leaf and twig intact inside the flame. Sandals set down on the rock in the foreground. The fire gives light but casts no destruction.',
  },
  'the-pillar-of-fire': {
    shape: 'scene',
    scene:
      'A towering column of living flame standing on the desert floor at night, lighting a vast encampment of tents and the faces turned up toward it. It does not spread and does not consume; it simply waits to move.',
  },
  'the-altar-fire': {
    shape: 'object',
    scene:
      'A rough uncut-stone altar with a fresh fire newly kindled on it, split wood arranged beneath, sparks lifting into blue dusk. Simple, small, domestic — the beginning of worship rather than its climax.',
  },
  'the-serpents-curse': {
    shape: 'scene',
    scene:
      'A serpent striking low at a bare human heel on stony ground while the heel comes down — the two motions caught in the same instant, neither yet resolved. Dust, thorns, thistles pushing up through cracked earth.',
  },
  'the-consuming-fire': {
    shape: 'scene',
    scene:
      'Fire falling from above onto a laden altar and taking the whole offering at once — wood, stone and water in the trench going up together in a white-hot column. Onlookers thrown flat at the edges of frame.',
  },
  elijah: {
    shape: 'portrait',
    scene:
      'A gaunt, wind-scoured prophet in a rough hair mantle standing on open ground as a chariot of fire and horses of fire descend around him in a whirlwind of flame and dust. His mantle is already slipping from one shoulder, about to fall.',
  },
  'nadab-and-abihu': {
    shape: 'scene',
    scene:
      'Two priests in linen robes at a smoking altar, censers just lifted, engulfed from above in a sudden sheet of white fire that leaves the altar itself untouched. Their sandals and censers survive on the ground; nothing else does.',
  },
  'the-refiners-fire': {
    shape: 'object',
    scene:
      'A small clay crucible glowing white over coals, molten silver pooled inside it catching a perfect, motionless reflection of the metalworker leaning close above — watching for the instant the surface clears, lit like a museum piece against total dark.',
  },
  phinehas: {
    shape: 'portrait',
    scene:
      'A young priest standing at the entrance of a striped tent with a bronze-tipped spear levelled and still smoking at its point, chest heaving, camp fires and startled onlookers blurred in the background behind him. Zeal rather than anger in the set of his jaw.',
  },
  moses: {
    shape: 'portrait',
    scene:
      'An old man coming down a bare mountain with two stone tablets braced against one hip, sandals dusted white, his face lit from within rather than from above — bright enough that the fold of cloth over one shoulder is already half-raised to veil it.',
  },

  /* --------------------------------------------------------------- Spirit */

  'archangel-michael': {
    shape: 'portrait',
    scene:
      'An armoured archangel with drawn sword and broad barred wings, standing over a coiled dragon pinned beneath one greave. Face severe and unmoved, no strain in the posture — the fight is already decided.',
  },
  'the-angel-of-the-lord': {
    shape: 'portrait',
    scene:
      'A tall figure that has just caught a raised wrist in mid-descent, holding it easily, the knife still in the frozen hand. The angel is looking at the man, not the blade. Terrible gentleness in the face.',
  },
  'the-cherubim': {
    shape: 'creature',
    scene:
      'A four-faced living creature — man, lion, ox, eagle — with wings full of open eyes, standing within interlocking wheels rimmed with more eyes, burnished bronze catching light. Awe-inducing rather than pretty. Nothing cherubic about it.',
  },
  'the-breath-of-life': {
    shape: 'scene',
    scene:
      'A close view of a still clay figure lying on the ground at the instant breath enters it: a luminous current entering the nostrils, colour spreading outward through grey clay into living skin, fingers just beginning to curl.',
  },
  'the-ladder-host': {
    shape: 'scene',
    scene:
      'Angels ascending and descending a stair of light set between earth and a broken-open sky, seen mid-traffic — some rising, some coming down, all purposeful, none looking at the viewer. A sleeping man tiny at the foot of it.',
  },
  'the-three-visitors': {
    shape: 'portrait',
    scene:
      'Three travellers standing together in the noon heat at the oaks of Mamre, dust on their feet, accepting bread and curds. Their faces are calm and closely alike. They speak as one and the shadows behind them do not agree with the sun.',
  },
  'the-still-small-voice': {
    shape: 'scene',
    scene:
      'The mouth of a mountain cave after the storm has passed: wind-stripped rock, a settling scatter of dust, a lone figure at the entrance with his face wrapped in his cloak. Absolute quiet, rendered as thin clear air and long shadow.',
  },
  'the-ladder-to-heaven': {
    shape: 'scene',
    scene:
      'A stone stair rising from a bare hillside straight into a gate of light standing open in the sky, its steps worn as though long used. A stone pillow and a poured oil jar at the base. The gate is the brightest thing in the frame.',
  },
  gabriel: {
    shape: 'portrait',
    scene:
      'A tall, still figure in plain pale robes standing just inside a low doorway, wings folded close rather than spread, hands open and empty at his sides. No halo, no ornament — only an unnatural stillness and a straight, unblinking gaze.',
  },
  'the-four-living-creatures': {
    shape: 'creature',
    scene:
      'Four winged beings ranked close together around a wheel of burning coals, each turned to show a different face — man, lion, ox, eagle — where the others overlap behind it. Eyes set into the rims of the wheels beneath them. Overwhelming, orderly, not grotesque.',
  },
  'balaams-donkey': {
    shape: 'creature',
    scene:
      'A grey pack-donkey on a narrow terraced path between two vineyard walls, forelegs braced and haunches down, ears flat, refusing to go another step. Its rider is thrown forward against its neck. The path ahead is empty as far as the eye can tell.',
  },

  /* --------------------------------------------------------------- Shadow */

  'the-serpent': {
    shape: 'creature',
    scene:
      'A large serpent wound along a fruiting branch, head level with the viewer, patterned scales beautiful and iridescent, tongue just out. Intelligent, unhurried, entirely unafraid. The most attractive thing in the garden.',
  },
  'the-tempter': {
    shape: 'portrait',
    scene:
      'A gracious well-dressed figure leaning in from the edge of frame to speak close to someone unseen, hand open in reasonable invitation, face half-lit and pleasant. Nothing monstrous. That is the point.',
  },
  'the-nephilim': {
    shape: 'portrait',
    scene:
      'A giant of the old world seen from below, chest and shoulders filling the frame, scarred, armoured in bronze scale, a spear shaft thick as a beam. Ordinary men reach his knee. Renown worn like a grudge.',
  },
  'the-curse': {
    shape: 'scene',
    scene:
      'Ground that has turned against the people working it: thorn and thistle bursting through split earth, a broken mattock, a bent back in the far distance. Heat, sweat, and no yield. The soil itself is the antagonist.',
  },
  'the-mark-of-cain': {
    shape: 'portrait',
    scene:
      'A hollow-eyed wanderer on a road going nowhere, a faint sign burned into his brow that catches light strangely. Protected and exiled by the same stroke. Nobody will touch him and nobody will have him.',
  },
  'the-outer-darkness': {
    shape: 'scene',
    scene:
      'The edge where creation stops: formless void, unlit water without horizon, no stars, a single failing thread of light at the very top of the frame being swallowed. Emptiness with weight to it.',
  },
  'the-shadow-of-death': {
    shape: 'scene',
    scene:
      'A narrow ravine at dusk with sheer walls closing overhead, the path ahead unreadable, one thin band of sky far above. Shapes at the edges that may or may not be there. Frightening, but a valley you pass through.',
  },
  lamech: {
    shape: 'portrait',
    scene:
      'A broad-shouldered man addressing two wives inside a dim tent, a bloodied blade still in one hand and his other arm raised mid-boast, firelight throwing his shadow huge across the tent wall behind him. Pride, not remorse, in the posture.',
  },
  goliath: {
    shape: 'portrait',
    scene:
      'A helmeted giant in bronze scale armour standing head and shoulders over the ridgeline of a dry valley, a spear like a weaver\'s beam braced against one shoulder, small figures of two armies frozen far below on either slope. Contemptuous, unhurried.',
  },
  'judas-iscariot': {
    shape: 'portrait',
    scene:
      'A man at the edge of firelit torchlight in a garden of old olive trees, coin-purse cinched at his belt, leaning in to kiss a cheek just out of frame. His own face is turned half away from the viewer, already regretting the motion.',
  },

  /* ------------------------------------------------------------ Covenants */

  'let-there-be-light': {
    shape: 'scene',
    light:
      'the first light there ever was, tearing across a lightless deep; no sun in frame, the light is its own source',
    scene:
      'Darkness over the face of the deep, split by the first light — a hard clean edge advancing across black water, revealing texture where there was none. Cosmic scale, no landmass, no figures.',
  },
  'the-rainbow': {
    shape: 'scene',
    light: 'clearing storm light, low sun behind the viewer, wet air holding colour',
    scene:
      'A bow of light set in the cloud over a washed world, seen from a muddy hillside where an altar of rough stones smokes. A covenant hung in the sky like a weapon deliberately laid down.',
  },
  'the-sabbath': {
    shape: 'scene',
    light: 'late golden afternoon going soft, long shadows, everything at rest',
    scene:
      'A finished world at rest on the seventh evening: tools set down and covered, a lamp lit in a doorway, animals lying in cropped grass, nothing being made. Stillness as an achievement rather than an absence.',
  },
  'the-call-of-abram': {
    shape: 'scene',
    light: 'hard dawn light from ahead, throwing the figure and camels into near-silhouette',
    scene:
      'A small caravan of loaded camels and driven flocks setting out from a walled Mesopotamian city at first light, the road ahead empty to the horizon. Seen from behind. Nobody is looking back at the gate.',
  },
  'the-binding': {
    shape: 'scene',
    light: 'high hard mountain sun, almost no shadow, nowhere to hide',
    scene:
      'Wood laid in order on a stone altar on a bare summit, cords coiled beside it, a knife set down on the rock. No people in frame. The absence is the whole weight of it.',
  },
  'jacobs-blessing': {
    shape: 'scene',
    light: 'warm interior lamplight, deep amber, the world reduced to one room',
    scene:
      'The hands of an old blind father laid on the head of a kneeling son in a dim tent, a dish of savoury food pushed aside. The hands are the subject; both faces are partly in shadow.',
  },
  'the-scattering': {
    shape: 'scene',
    light: 'flat overcast, colourless, no sun anywhere — a day that has lost its centre',
    scene:
      'Work abandoned at the foot of a half-built tower: crowds streaming away in every direction down separate roads, tools dropped where they stood, nobody speaking to anybody. Seen from above.',
  },
  'the-famine': {
    shape: 'scene',
    light: 'white bleached noon, no cloud, heat haze flattening the distance',
    scene:
      'A dry riverbed cracked into plates, empty grain jars tipped on their sides, a dead field of stubble going to dust in the wind. One thin animal in the middle distance. Nothing green anywhere.',
  },
  'the-well-of-beersheba': {
    shape: 'scene',
    light: 'cool early light, blue shadow in the well mouth, gold on the rim stones',
    scene:
      'A stone-lined desert well with a worn rope and a wet leather bucket just drawn up, water running bright down the outside. Seven ewe lambs standing apart. Relief made physical.',
  },
  'the-dream-of-pharaoh': {
    shape: 'scene',
    light: 'strange dream-light, two incompatible light sources, everything slightly too vivid',
    scene:
      'Seven fat cattle grazing rich Nile grass while seven gaunt ones come up the bank behind them to eat them — both sets in the same impossible frame. Dreamlike, not surreal: painted with total conviction.',
  },

  /* --------------------------------------------------------------- Relics */

  'the-ark': {
    shape: 'object',
    light: 'raking side light on wet timber, deep shadow in the joins',
    scene:
      'A section of the ark itself: cypress planking sealed inside and out with black pitch, a single small window high under the eaves, a heavy shut door. Built for weather that has not arrived.',
  },
  'the-coat-of-many-colours': {
    shape: 'object',
    light: 'clean even light, colours allowed to speak for themselves',
    scene:
      'A long sleeved robe laid out flat, woven in bands of indigo, saffron, madder and undyed wool, its finish plainly costlier than anything around it. One sleeve slightly torn. Expensive, and a mistake.',
  },
  'the-staff': {
    shape: 'object',
    light: 'low warm side light picking out grain and wear',
    scene:
      'A shepherd\'s staff of seasoned almond wood standing upright, the crook polished smooth by decades of one hand, the heel of it split from stony ground. Utterly ordinary until it is not.',
  },
  'the-birthright': {
    shape: 'object',
    light: 'dim interior light, one shaft across the objects, dust in the air',
    scene:
      'A clay tablet and cord seal set on a table beside a cooling bowl of red stew — the deed and the price side by side, the trade already made. Nobody in frame.',
  },
  'the-censer': {
    shape: 'object',
    light: 'dark ground, smoke lit from within by the coals',
    scene:
      'A bronze censer on fine chains, lid pierced in a pattern, live coals glowing through the holes and a thick rope of fragrant smoke climbing straight up. Warm metal, worn where hands hold it.',
  },
  'the-tent-of-meeting': {
    shape: 'object',
    light: 'blue evening outside, warm light leaking from the doorway',
    scene:
      'A goat-hair tent pitched apart from the camp at dusk, entrance flap tied open, a pillar of cloud standing at its door. Plain, weathered, and clearly the most important structure in the desert.',
  },
  'the-stone-pillow': {
    shape: 'object',
    light: 'grey pre-dawn, one warm edge of sunrise on the upper stone',
    scene:
      'A single smooth stone set upright as a pillar on a bare hillside, oil poured over its crown and running down the sides, still wet. The impression of a head worn into the ground beside it.',
  },
  'the-signet-ring': {
    shape: 'object',
    light: 'jewel lighting, hard specular highlights on gold, deep black ground',
    scene:
      'A heavy Egyptian gold signet ring lying on dark linen beside a fresh clay seal impression bearing its mark. Authority reduced to a single small object you could close your hand around.',
  },
}

/**
 * Cards this map deliberately does not cover, because they already have art.
 *
 * Empty at the moment: the five shipped illustrations were pulled so they can
 * be replaced, so every card in the set is back on a placeholder and every one
 * of them needs direction. Add an id here — and delete its entry above — as
 * each card's artwork lands.
 */
export const ALREADY_ILLUSTRATED: string[] = []
