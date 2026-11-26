import type { QuestDef } from '../shared/types';

// Capítulo 1 (abajo, Lv 2-7) y capítulos 2 a 4 (Lv 9-20): una cadena lineal que sigue la escalera.
// Capítulo 1: tres misiones encadenadas que siguen la escalera de dificultad del mundo
// (bears Lv 3 -> grizzlies Lv 5 -> ghosts Lv 7). Las dos primeras las da el Elder; la tercera,
// Bruno, y cierra el capítulo. `level` es el nivel recomendado, no una puerta.
export const QUESTS: Record<string, QuestDef> = {
  'dry-well': {
    id: 'dry-well',
    title: 'The Dry Well',
    chapter: 'Chapter 1 · To the Last Breath',
    giver: 'elder-hodl',
    target: 'bear',
    targetName: 'Bear Markets',
    count: 4,
    level: 2,
    rewardXp: 70,
    rewardCoins: 40,
    offer:
      'Welcome, Wanderer. I am Elder Hodl, and I have not sold a single grain of hope. The Lantern Well in this square is the last one still glowing, but the Bear Markets are gnawing at the roads and its light is fading. Thin out four of them on the east road and in the Bagholder Fields.',
    progress: 'The Bears still prowl. Keep hunting. Diamond paws, friend.',
    complete:
      'The Well just flickered brighter. I felt it. Take this, you earned it. But the bears are only the small ones. The big ones sleep in the Ruins of the First Mint, and they are waking. Grow a little, Wanderer, then come back to me.',
  },
  'hold-the-line': {
    id: 'hold-the-line',
    title: 'Hold the Line',
    chapter: 'Chapter 1 · To the Last Breath',
    giver: 'elder-hodl',
    requires: 'dry-well',
    target: 'grizzly',
    targetName: 'Capitulation Grizzlies',
    count: 6,
    level: 5,
    rewardXp: 300,
    rewardCoins: 150,
    offer:
      'Good, you grew. The bears smell weakness, and the big ones are coming down from the ruins: Capitulation Grizzlies, the kind that sold the bottom and never forgave themselves. Hold the line, Wanderer. Six of them, and Hodl Hollow can breathe again.',
    progress: 'The grizzlies keep coming down from the ruins. That is how a bear market works. Hold.',
    complete:
      'The Well shines like the first day. You did what the Founders never did: you stayed. Now go and find Bruno the Scout, by the east road. He has been watching the marsh, and he does not like what he sees.',
  },
  'ghosts-of-the-rug': {
    id: 'ghosts-of-the-rug',
    title: 'Ghosts of the Rug',
    chapter: 'Chapter 1 · To the Last Breath',
    giver: 'bruno-scout',
    requires: 'hold-the-line',
    target: 'ghost',
    targetName: 'Rug Pull Ghosts',
    count: 3,
    level: 7,
    rewardXp: 450,
    rewardCoins: 300,
    rewardItems: ['ledger-page-1'],
    offer:
      'Psst. Hodl sent you? Good, because you will need that strength. I scouted the Rug Pull Marsh to the south. The ghosts of abandoned projects drift there: every broken roadmap, every "we are building" that never shipped. They drain the Well from afar. Banish three of them and the flow should steady.',
    progress: 'The marsh is south, past the edge of the fields. Three ghosts. Do not read their roadmaps.',
    complete:
      'Three fewer ghosts, and I can feel the Well humming from here. But listen: a torn page came loose from one of them, and it is yours now. The Ledger of the Seven is real, and it is out there in pieces. Rest, Wanderer. When you are ready, go east along the Moonlit Road, past the fields, to Dip Buyer Camp. Dolores will know where the pages went. Chapter One ends here.',
  },
  'dead-cats-dont-stay-dead': {
    id: 'dead-cats-dont-stay-dead',
    title: "Dead Cats Don't Stay Dead",
    chapter: 'Chapter 2 · Dead Cat Hills',
    giver: 'dolores-dipbuyer',
    requires: 'ghosts-of-the-rug',
    target: 'dead-cat',
    targetName: 'Dead Cat Bounces',
    count: 8,
    level: 9,
    rewardXp: 1400,
    rewardCoins: 320,
    offer:
      'You walked the whole road. Good. Chapter Two starts here, Wanderer. The Dead Cat Hills are crawling with Dead Cat Bounces: little grey corpses that jump back up after every drop, and every time, someone cheers for the recovery. Put eight of them down properly. Dead means dead.',
    progress: 'Eight of them. They keep bouncing, so aim for the landing.',
    complete:
      "That's the sound of a real bottom. Quiet. Now listen: the cats are only the decoration. Something up the ridge is feeding them, and it wears green. Come back when you're ready to meet it.",
  },

  'the-bull-trap': {
    id: 'the-bull-trap',
    title: 'The Bull Trap',
    chapter: 'Chapter 2 · Dead Cat Hills',
    giver: 'dolores-dipbuyer',
    requires: 'dead-cats-dont-stay-dead',
    target: 'bull-trap',
    targetName: 'Bull Traps',
    count: 6,
    level: 10,
    rewardXp: 1900,
    rewardCoins: 420,
    offer:
      'The bulls up on the ridge look like the best news you ever had: green coats, gold nose rings, steady eyes. They are bait. Every hoof on those hills is a trap for anyone who thought it could only go up. Break six of them and the ridge gets quiet.',
    progress: 'Six Bull Traps. They look friendly. Hit them before they look at you.',
    complete:
      "Six fewer traps, and I could finally sleep. Now the hard part: the one that built them. The Founders called him Fakeout. He's the Bull Trap Baron, and he's up on the ridge. Take your time, buy potions, and come back alive.",
  },

  'baron-fakeout': {
    id: 'baron-fakeout',
    title: 'Fakeout, the Baron',
    chapter: 'Chapter 2 · Dead Cat Hills',
    giver: 'dolores-dipbuyer',
    requires: 'the-bull-trap',
    target: 'bull-baron',
    targetName: 'Fakeout, the Bull Trap Baron',
    count: 1,
    level: 11,
    rewardXp: 2800,
    rewardCoins: 650,
    offer:
      "Fakeout was a Founder, you know. The Ledger of the Seven says as much. He bought the top and told everyone it was a strategy. The Deployer turned that into a body. He sits on the ridge with a coat made of green candles. Bring him down. And bring me the page he's holding. It hits hard: bring up to three friends (P opens the Party panel) and let Mend (H) keep the front line standing.",
    progress: "The Baron is on the high ridge to the east. Watch for the charge, it's slower than it looks, until it isn't.",
    complete:
      "He fell. The page he held is yours: the second of the Ledger. Take it to the Last Founder at the ruins, he'll want to read it. Then go west past the ruins, Wanderer. The Canyon is next, and Mary will tell you what it costs.",
  },

  'forced-sale': {
    id: 'forced-sale',
    title: 'Forced Sale',
    chapter: 'Chapter 2 · Liquidation Canyon',
    giver: 'margin-mary',
    requires: 'baron-fakeout',
    target: 'golem',
    targetName: 'Liquidation Golems',
    count: 8,
    level: 12,
    rewardXp: 2400,
    rewardCoins: 520,
    offer:
      "Welcome to Last Margin Post. Everything past this fence is the Canyon, and the Canyon is a liquidation in progress. The Liquidation Golems are what's left of the city that got called. They walk, they hit hard, they don't negotiate. Break eight of them and I can finally measure the ground.",
    progress: 'Eight golems. Hit the red vein on the chest when they raise their arms.',
    complete:
      'Eight down. Their shards are worth keeping. Now the ones who did the calling: Margin Callers. They float, they scream numbers at you, and every number is more than you have.',
  },

  'call-in-the-margin': {
    id: 'call-in-the-margin',
    title: 'Call In the Margin',
    chapter: 'Chapter 2 · Liquidation Canyon',
    giver: 'margin-mary',
    requires: 'forced-sale',
    target: 'margin-caller',
    targetName: 'Margin Callers',
    count: 6,
    level: 13,
    rewardXp: 3000,
    rewardCoins: 640,
    offer:
      'Margin Callers are faster and angrier than the golems. They drift in from the deep canyon and ask politely, then not politely, for what you owe. Banish six of them. If they ask for your lunch, give them a swing instead.',
    progress: 'Six Margin Callers. Never answer their question. Just hit.',
    complete:
      "Quiet at last. That's the only sound the canyon should make. The thing at the end of it, though, has been counting for years. The Stop-Loss Colossus. Founder number three, if the Ledger is right.",
  },

  'the-colossus': {
    id: 'the-colossus',
    title: 'The Stop-Loss Colossus',
    chapter: 'Chapter 2 · Liquidation Canyon',
    giver: 'margin-mary',
    requires: 'call-in-the-margin',
    target: 'stop-loss-colossus',
    targetName: 'The Stop-Loss Colossus',
    count: 1,
    level: 14,
    rewardXp: 4600,
    rewardCoins: 950,
    offer:
      'It was a Founder once. He set one stop-loss, just one, and the Deployer made sure it triggered. Now it stands at the end of the canyon, selling everything that comes near. It hits slowly and it hits hard. Put it down, Wanderer, and bring back the page it keeps in its chest. It hits hard: bring up to three friends (P opens the Party panel) and let Mend (H) keep the front line standing.',
    progress: "It's at the far end of the canyon. Wait for the swing, then answer.",
    complete:
      "It's down. The page is real. Three pages now, three Founders, and none of them were thieves, just men who trusted the wrong signature. Walt is waiting in the Whitepaper Wastes, south of the meadow. He has been waiting a long time.",
  },

  'shill-season': {
    id: 'shill-season',
    title: 'Shill Season',
    chapter: 'Chapter 3 · Whitepaper Wastes',
    giver: 'whitepaper-walt',
    requires: 'the-colossus',
    target: 'shillbot',
    targetName: 'Shillbots',
    count: 8,
    level: 15,
    rewardXp: 3600,
    rewardCoins: 780,
    offer:
      "You came a long way. Sit, if you can. These sands were the Roadmap Plains once. Now the Shillbots patrol them, reciting the same pitch to nobody. They are wound up and they don't stop. Switch off eight of them and the wind might clear.",
    progress: 'Eight Shillbots. If one starts a speech, interrupt it with a blade.',
    complete:
      "That's eight pitches that won't be repeated. The Wisps are next. They float out of the old roadmap, shiny and empty, and they are very good at making you believe.",
  },

  'vaporware': {
    id: 'vaporware',
    title: 'Vaporware',
    chapter: 'Chapter 3 · Whitepaper Wastes',
    giver: 'whitepaper-walt',
    requires: 'shill-season',
    target: 'vaporware-wisp',
    targetName: 'Vaporware Wisps',
    count: 6,
    level: 16,
    rewardXp: 4200,
    rewardCoins: 880,
    offer:
      "Vaporware Wisps are what's left of every roadmap that never shipped. Beautiful, bright, and not there when you reach for them. Strike six of them while they believe in you. It's the only time they hold still.",
    progress: "Six Wisps. Don't read their roadmaps. I told you not to.",
    complete:
      "Six fewer dreams in the air. Now the one behind all of them. The Founders called him Hype Man, once, as a joke. He turned it into a title. He's in the middle of the Wastes, and he's very loud.",
  },

  'silence-the-hype-man': {
    id: 'silence-the-hype-man',
    title: 'Silence the Hype Man',
    chapter: 'Chapter 3 · Whitepaper Wastes',
    giver: 'whitepaper-walt',
    requires: 'vaporware',
    target: 'hype-man',
    targetName: 'Hype Man, Lord of Shills',
    count: 1,
    level: 17,
    rewardXp: 6500,
    rewardCoins: 1300,
    offer:
      'Founder number four. The page says it plainly: vanity. He told everyone it was the next big thing and he told them so loudly that he forgot to check. The Deployer gave him a bigger megaphone. Silence him, Wanderer. Please. And bring the page. It hits hard: bring up to three friends (P opens the Party panel) and let Mend (H) keep the front line standing.',
    progress: "He's in the middle of the Wastes. You'll hear him first.",
    complete:
      "It's quiet. I forgot what that sounded like. Four pages, then. Go north, all the way through the marsh, to Rick's lantern. There's a Pool up there, and what's in it is the end of this story.",
  },

  'into-the-drained-pool': {
    id: 'into-the-drained-pool',
    title: 'Into the Drained Pool',
    chapter: 'Chapter 4 · The Drained Pool',
    giver: 'rekt-rick',
    requires: 'silence-the-hype-man',
    target: 'slippage-wraith',
    targetName: 'Slippage Wraiths',
    count: 8,
    level: 18,
    rewardXp: 5200,
    rewardCoins: 1050,
    rewardItems: ['ledger-page-5'],
    offer:
      "You made it. I'm Rick. Up here we keep a lantern lit and a bad joke ready. Down there is the Drained Pool, where every promise in Memeria slid that night. Slippage Wraiths drift at the rim: they shave a little off everything you do. Cut eight of them down.",
    progress: 'Eight Slippage Wraiths. They take a little from every blow. Hit harder.',
    complete:
      "Eight. I counted. The rim is clearer. Don't be fooled; the real horrors live deeper. The Rekt Revenants. They used to be people with plans. Here, take this: the fifth page was stuck to the last wraith. Keep it with the others.",
  },

  'rekt': {
    id: 'rekt',
    title: 'Rekt',
    chapter: 'Chapter 4 · The Drained Pool',
    giver: 'rekt-rick',
    requires: 'into-the-drained-pool',
    target: 'rekt-revenant',
    targetName: 'Rekt Revenants',
    count: 6,
    level: 19,
    rewardXp: 6000,
    rewardCoins: 1200,
    rewardItems: ['ledger-page-6'],
    offer:
      "Rekt Revenants are the ones who didn't leave in time. They walk the bed of the Pool like it owes them money, and it does. Six of them, Wanderer, and the way to the Deployer opens. I'll keep the lantern lit.",
    progress: 'Six Revenants. Slow, heavy, and absolutely out of patience.',
    complete:
      "Six. You're stronger than the rest of us put together. The Deployer sits at the bottom, on the Admin Key. He's been there since the Pull. He knows you're coming. Make it count. And take the sixth page, it was stuck to the last Revenant.",
  },

  'the-deployer': {
    id: 'the-deployer',
    title: 'The Deployer',
    chapter: 'Chapter 4 · The Drained Pool',
    giver: 'rekt-rick',
    requires: 'rekt',
    target: 'deployer',
    targetName: 'The Deployer',
    count: 1,
    level: 20,
    rewardXp: 12000,
    rewardCoins: 3000,
    offer:
      "He wrote the Well's contract. He kept the key. He pulled the Pool and watched the rest follow. The Deployer is not a monster, he's an author, and he's been editing this world for a long time. Strike him down, Wanderer, and bring the last page back to the Well. Memeria is waiting. It hits hard: bring up to three friends (P opens the Party panel) and let Mend (H) keep the front line standing.",
    progress: "He's at the bottom of the Pool, beside the Admin Key. Bring everything you've got.",
    complete:
      "It's over. The Key shattered, the Pool is filling, and the Lantern Well is burning brighter than I've ever seen it. Take the seventh page back to the Lantern Well and read it there, where it is quiet. It is the page the Last Founder never signed. You didn't just kill a boss, Wanderer: you stayed. Welcome home.",
  },
};
