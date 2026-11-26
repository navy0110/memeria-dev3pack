import type { ItemDef, WeaponLook } from '../shared/types';

// Catálogo de ítems. Las recipes y el crafteo llegan después; el equipo de acá se compra con monedas.
//
// Escalera de equipo (tres tiers, atada a los niveles de las zonas; ver PLAN.md):
//   Tier 1  Lv 2   arma +3  / armadura 6    (Meadow y primeras misiones)
//   Tier 2  Lv 5   arma +7  / armadura 14   (Ruins)
//   Tier 3  Lv 8   arma +12 / armadura 26   (Marsh)
//   Tier 4  Lv 12  arma +16 / armadura 40   (Dead Cat Hills y Liquidation Canyon)
//   Tier 5  Lv 16  arma +21 / armadura 56   (Whitepaper Wastes y Drained Pool)
// El equipo de gama alta (recipes + MMRIA) queda por encima de estos tiers.

// --- Armas -----------------------------------------------------------------------------
// Una línea por clase, tres tiers de monedas y una legendaria que solo se paga en MMRIA.
// Cada una tiene `look`: así se ve en la mano y en la vista previa de la tienda. Las de tier
// bajo son sobrias; el brillo y los efectos aumentan con el tier y estallan en las legendarias.
type Tier = 1 | 2 | 3 | 4 | 5 | 'L';
const TIERS = {
  1: { levelReq: 2, damage: 3, buy: 60, sell: 24 },
  2: { levelReq: 5, damage: 7, buy: 280, sell: 112 },
  3: { levelReq: 8, damage: 12, buy: 900, sell: 360 },
  4: { levelReq: 12, damage: 16, buy: 2400, sell: 960 },
  5: { levelReq: 16, damage: 21, buy: 5200, sell: 2080 },
  // Precio provisorio en MMRIA; no se puede comprar hasta que el token esté en circulación.
  L: { levelReq: 8, damage: 20, mmria: 2500 },
} as const;
const ICON: Record<string, string> = { shiba: '†', doge: '‡', pepe: '/', popcat: '|', wif: ')' };

function weapon(cls: string, tier: Tier, id: string, name: string, desc: string, look: WeaponLook): ItemDef {
  const t: { levelReq: number; damage: number; buy?: number; sell?: number; mmria?: number } = TIERS[tier];
  const hex = `#${(look.glow ?? look.blade).toString(16).padStart(6, '0')}`;
  return { id, name, kind: 'weapon', desc, icon: ICON[cls], color: hex, slot: 'weapon', classes: [cls], look, rarity: tier === 'L' ? 'legendary' : undefined, ...t };
}

const WEAPON_LIST: ItemDef[] = [
  // Shiba, espada
  weapon('shiba', 1, 'tin-sword', 'Tin Fang Sword', 'Dull, light, and better than paws.', { blade: 0xb8c0cc, trim: 0x8a8f99 }),
  weapon('shiba', 2, 'hodlers-blade', "Hodler's Blade", 'It has never been sold. Neither has its owner.', { blade: 0x9fd0ff, trim: 0xc9a24a, glow: 0x4aa0ff }),
  weapon('shiba', 3, 'diamond-paw-sword', 'Diamond-Paw Sword', 'Cut from a gem that refused to be sold at any price.', { blade: 0x7be3ff, trim: 0xffffff, glow: 0x30d0ff, fx: ['halo', 'embers'], size: 1.05 }),
  weapon('shiba', 4, 'liquidation-cleaver', 'Liquidation Cleaver', 'Cuts a position in half before the market can. Heavy, loud, and always sold at the worst moment.', { blade: 0xff8a5a, trim: 0x6d6a78, glow: 0xff5a2a, fx: ['halo', 'embers'], size: 1.1 }),
  weapon('shiba', 5, 'conviction-greatsword', 'Conviction Greatsword', 'Tempered in the Lantern Well itself. It weighs exactly as much as your doubts, and swings anyway.', { blade: 0xe8f6ff, trim: 0xffe680, glow: 0x9fe0ff, fx: ['halo', 'embers', 'runes'], size: 1.15 }),
  weapon('shiba', 'L', 'candle-cutter', 'Candle Cutter', 'Forged in the heat of the Great Rug Pull. Every red candle it meets goes green. Dan swears it hums when markets crash.', { blade: 0xff5a20, trim: 0xffd24a, glow: 0xff7a2a, fx: ['halo', 'embers', 'runes'], size: 1.2 }),
  // Doge, daga
  weapon('doge', 1, 'rusty-dagger', 'Rusty Dagger', 'Much rust. Very sharp where it counts.', { blade: 0x9a8668, trim: 0x6b5a3a }),
  weapon('doge', 2, 'wow-dagger', 'Wow Dagger', 'Such edge. Many cuts. Wow.', { blade: 0xffd04d, trim: 0xe0b23a, glow: 0xffb300 }),
  weapon('doge', 3, 'moonshot-dagger', 'Moonshot Dagger', 'Forged on the way to the moon. Has not come back yet.', { blade: 0xfff27a, trim: 0xffffff, glow: 0xffe066, fx: ['halo', 'embers'], size: 1.05 }),
  weapon('doge', 4, 'dip-buyer-dirk', "Dip Buyer's Dirk", 'Bought at the bottom, sharpened ever since. Wow, such timing.', { blade: 0xff9a4d, trim: 0xffd24a, glow: 0xff7a1a, fx: ['halo', 'embers'], size: 1.1 }),
  weapon('doge', 5, 'diamond-tooth-kris', 'Diamond-Tooth Kris', 'Wavy blade, steady hands. Much patience, very pointy.', { blade: 0xcaf6ff, trim: 0xffffff, glow: 0x7fe9ff, fx: ['crescent', 'halo'], size: 1.15 }),
  weapon('doge', 'L', 'moonbreaker', 'Moonbreaker', 'It reached the moon, took a bite, and came back for more. A golden crescent follows every swing.', { blade: 0xfff2a0, trim: 0xffd24a, glow: 0xffd84a, fx: ['crescent', 'halo', 'embers', 'orbit'], size: 1.2 }),
  // Pepe, bastón
  weapon('pepe', 1, 'twig-staff', 'Twig Staff', 'A branch from the Meadow with a bit of hope tied to it.', { blade: 0xa8c97a, trim: 0x6b4a2b }),
  weapon('pepe', 2, 'feels-staff', 'Feels Staff', 'Hums softly. It feels everything, so you do not have to.', { blade: 0x8bd36b, trim: 0x3d7d2c, glow: 0x5cff7a }),
  weapon('pepe', 3, 'rare-staff', 'Rare Pepe Staff', 'One of very few. The collectors are not wrong.', { blade: 0x5cff9d, trim: 0x2f8f55, glow: 0x3dffa0, fx: ['orbit', 'halo'], size: 1.05 }),
  weapon('pepe', 4, 'sadge-crook', 'Sadge Crook', 'Carved from a tree that watched a thousand red candles. It still hums, a little sadly.', { blade: 0x6fd0c0, trim: 0x2f6f66, glow: 0x3dd9c0, fx: ['orbit', 'halo'], size: 1.1 }),
  weapon('pepe', 5, 'comfy-scepter', 'Comfy Scepter', 'Feels good, man. The staff finally agrees.', { blade: 0xb6ff9a, trim: 0xffe680, glow: 0x7dff6a, fx: ['rings', 'orbit', 'halo'], size: 1.15 }),
  weapon('pepe', 'L', 'genesis-scepter', 'Genesis Scepter', 'The first emerald ever minted, still warm. Three shards circle it, and two rings of old magic.', { blade: 0x7dffb0, trim: 0xffd24a, glow: 0x2dff9a, fx: ['halo', 'orbit', 'rings', 'embers'], size: 1.15 }),
  // Popcat, bo
  weapon('popcat', 1, 'wooden-bo', 'Wooden Bo', 'A plain training staff. It has heard a lot of pops.', { blade: 0x9a7a4a, trim: 0xa83a32 }),
  weapon('popcat', 2, 'red-lacquer-bo', 'Red Lacquer Bo', 'Polished until the pop echoes back.', { blade: 0x7a2a2a, trim: 0xffd24a, glow: 0xff5a4a }),
  weapon('popcat', 3, 'pop-rod', 'Pop Rod', 'Taps the beat and the beat taps back.', { blade: 0xff8fb3, trim: 0xffffff, glow: 0xff6a9a, fx: ['runes', 'halo'], size: 1.05 }),
  weapon('popcat', 4, 'pop-crusher', 'Pop Crusher', 'Each hit pops a little louder. The Golems have started to flinch at the sound.', { blade: 0xffb0d0, trim: 0xfff2a0, glow: 0xff7ab0, fx: ['runes', 'halo'], size: 1.1 }),
  weapon('popcat', 5, 'resonant-bo', 'Resonant Bo', 'Strike it once and the whole Wasteland hears. Strike it twice and the Shills go quiet.', { blade: 0xffeaf4, trim: 0xff6aa0, glow: 0xff9acb, fx: ['rings', 'halo', 'embers'], size: 1.15 }),
  weapon('popcat', 'L', 'heavenly-bo', "Poppin' Heavenly Bo", 'Struck once, it never stops ringing. Rings of pink light orbit it, popping in time.', { blade: 0xffffff, trim: 0xff6aa0, glow: 0xff4f9a, fx: ['rings', 'halo', 'embers', 'orbit'], size: 1.15 }),
  // Dogwifhat, arco
  weapon('wif', 1, 'hunting-bow', 'Hunting Bow', 'Plain wood and a plainer string. The hat does the rest.', { blade: 0x7a5230, trim: 0xd9b56c }),
  weapon('wif', 2, 'pink-longbow', 'Pink Longbow', 'Matches the hat. That is the whole design brief.', { blade: 0xff7fb0, trim: 0xffd0e4, glow: 0xff5a9a }),
  weapon('wif', 3, 'hat-trick-bow', 'Hat Trick Bow', 'Three arrows, one hat, zero questions.', { blade: 0xffa0c8, trim: 0xffffff, glow: 0xff7ab0, fx: ['halo', 'orbit'], size: 1.05 }),
  weapon('wif', 4, 'brimmed-bow', 'Brimmed Bow', 'The wide brim shades the aim. The aim, for once, is never in doubt.', { blade: 0xff9ac8, trim: 0xfff2d0, glow: 0xff6aa8, fx: ['halo', 'orbit'], size: 1.1 }),
  weapon('wif', 5, 'knitted-windbow', 'Knitted Windbow', 'Strung with wool from the hat itself. Arrows ride the wind and the wind rides the arrows.', { blade: 0xffd0e6, trim: 0xffffff, glow: 0xff8cc4, fx: ['rings', 'orbit', 'embers'], size: 1.15 }),
  weapon('wif', 'L', 'hattrick-starbow', 'Hattrick Starbow', 'Pulled from a falling star and strung with moonlight. Stars orbit the limbs and the hat never slips.', { blade: 0xfff0f6, trim: 0xffb0d0, glow: 0xff6ab0, fx: ['rings', 'embers', 'halo', 'orbit'], size: 1.15 }),
];
const WEAPONS: Record<string, ItemDef> = Object.fromEntries(WEAPON_LIST.map((w) => [w.id, w]));

export const ITEMS: Record<string, ItemDef> = {
  'health-potion': {
    id: 'health-potion',
    name: 'Health Potion',
    kind: 'consumable',
    desc: 'Brewed before the Founders left. Restores 40 HP.',
    icon: '✚',
    color: '#ff5c6c',
    heal: 40,
    buy: 25,
    sell: 8,
  },
  'grand-potion': {
    id: 'grand-potion',
    name: 'Grand Potion',
    kind: 'consumable',
    desc: 'Brewed on the road, from whatever the road had left. Restores 220 HP.',
    icon: '✚',
    color: '#ff7ad1',
    heal: 220,
    buy: 170,
    sell: 54,
  },
  'greater-potion': {
    id: 'greater-potion',
    name: 'Greater Potion',
    kind: 'consumable',
    desc: 'A stronger brew, from the last batch of the old cauldron. Restores 100 HP.',
    icon: '✚',
    color: '#ffb35c',
    heal: 100,
    buy: 70,
    sell: 22,
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    kind: 'consumable',
    desc: 'Fresh from the Grocery Store. Restores 15 HP.',
    icon: '●',
    color: '#e0403c',
    heal: 15,
    buy: 6,
    sell: 2,
  },
  'bear-pelt': {
    id: 'bear-pelt',
    name: 'Bear Pelt',
    kind: 'material',
    desc: 'Rough fur with a red candle stuck in it. Overpriced, and always trending down.',
    icon: '▦',
    color: '#b5763c',
    sell: 8,
  },
  'ghost-wisp': {
    id: 'ghost-wisp',
    name: 'Ghost Wisp',
    kind: 'material',
    desc: 'What is left of an abandoned roadmap. Faintly warm. Crafting material.',
    icon: '✦',
    color: '#c9a8ff',
    sell: 18,
  },

  'bull-horn': { id: 'bull-horn', name: 'Bull Horn', kind: 'material', desc: 'Polished and perfect, like the promise that came with it. Crafting material.', icon: '⌒', color: '#f2ead2', sell: 36 },
  'golem-shard': { id: 'golem-shard', name: 'Golem Shard', kind: 'material', desc: 'A cold crystal splinter with a red vein inside. Forced liquidation, in solid form.', icon: '◆', color: '#7be3ff', sell: 64 },
  'shill-script': { id: 'shill-script', name: 'Shill Script', kind: 'material', desc: '"Not financial advice. Definitely financial advice." Seven pages of identical enthusiasm.', icon: '▤', color: '#3fd0b0', sell: 90 },
  'slippage-ichor': { id: 'slippage-ichor', name: 'Slippage Ichor', kind: 'material', desc: 'Dark liquid that is always worth a little less than when you picked it up.', icon: '◉', color: '#5a63c9', sell: 150 },

  // Las siete páginas del Ledger of the Seven. Se encuentran, no se compran: son la historia.
  'ledger-page-1': { id: 'ledger-page-1', name: 'Ledger Page I', kind: 'material', desc: '"THE WELL. We lit the Lantern Well from the first block ever laid. It burns on conviction alone: as long as one of us holds, it cannot go dark. Seven signed. We were so sure." Torn at the edge.', icon: '❡', color: '#ffe680', sell: 120 },
  'ledger-page-2': { id: 'ledger-page-2', name: 'Ledger Page II', kind: 'material', desc: '"GREED. I, Fakeout, bought the top and called it a strategy. The Deployer said the green candle would never end. I believed him, and I made others believe me. A trap needs a trusted hand." Torn at the edge.', icon: '❡', color: '#ffe680', sell: 120 },
  'ledger-page-3': { id: 'ledger-page-3', name: 'Ledger Page III', kind: 'material', desc: '"FEAR. I set a single stop-loss, just one, just in case. The Deployer said it was prudent. When the red candle came, it sold the Well\'s light for me. I could not stop it. I was the stop." Torn at the edge.', icon: '❡', color: '#ffe680', sell: 120 },
  'ledger-page-4': { id: 'ledger-page-4', name: 'Ledger Page IV', kind: 'material', desc: '"VANITY. I told everyone it was the next big thing. I told them so loudly that I forgot to check. The Deployer only smiled and handed me a bigger megaphone." Torn at the edge.', icon: '❡', color: '#ffe680', sell: 120 },
  'ledger-page-5': { id: 'ledger-page-5', name: 'Ledger Page V', kind: 'material', desc: '"THE KEY. Every contract the Deployer wrote had one line nobody read: an Admin Key, kept by the author. A door only he could open. We called it a safety. It was a trapdoor." Torn at the edge.', icon: '❡', color: '#ffe680', sell: 120 },
  'ledger-page-6': { id: 'ledger-page-6', name: 'Ledger Page VI', kind: 'material', desc: '"THE PULL. He did not steal the treasure. He drained the Pool underneath it, and every promise in Memeria slid after it. We did not run. We were pulled, one by one, into what we had built." Torn at the edge.', icon: '❡', color: '#ffe680', sell: 120 },
  'ledger-page-7': { id: 'ledger-page-7', name: 'Ledger Page VII', kind: 'material', desc: '"THE SEVENTH. One of us never signed the Deployer\'s page. One of us only held. Find him, Wanderer. A Well needs only one pair of hands that will not let go." The ink is still wet.', icon: '❡', color: '#ffe680', sell: 400 },

  // Ficha del juego: la tira el servidor y su saldo vive en la base, no en el inventario del héroe (por eso no se guarda ni se vende).
  'mmria-token': {
    id: 'mmria-token',
    name: 'MMRIA Token',
    kind: 'material',
    desc: 'The coin of Memeria. Monsters carry them, the server counts them. Select it and press Redeem to ask for real MMRIA on Solana.',
    icon: '◎',
    color: '#ffd35a',
  },

  ...WEAPONS,

  // --- Armaduras (todas las clases) ----------------------------------------------------
  'leather-vest': { id: 'leather-vest', name: 'Leather Vest', kind: 'armor', desc: 'Sturdy enough for the Meadow. Smells like a bad trade.', icon: '▲', color: '#b5763c', slot: 'armor', levelReq: 2, defense: 6, buy: 50, sell: 20 },
  'bearhide-coat': { id: 'bearhide-coat', name: 'Bearhide Coat', kind: 'armor', desc: 'Stitched from bears that never saw it coming. Warm, and always in the green.', icon: '▲', color: '#c98a4a', slot: 'armor', levelReq: 5, defense: 14, buy: 250, sell: 100 },
  'grizzly-plate': { id: 'grizzly-plate', name: 'Grizzly Plate', kind: 'armor', desc: 'Plate over grizzly hide. It sold the bottom once. Never again.', icon: '▲', color: '#8a8a9a', slot: 'armor', levelReq: 8, defense: 26, buy: 800, sell: 320 },
  'golem-mail': { id: 'golem-mail', name: 'Golem-Crystal Mail', kind: 'armor', desc: 'Plates of liquidated stone, still faintly warm. It does not feel the dip. Nothing does.', icon: '▲', color: '#7be3ff', slot: 'armor', levelReq: 12, defense: 40, buy: 1900, sell: 760 },
  'aegis-of-conviction': { id: 'aegis-of-conviction', name: 'Aegis of Conviction', kind: 'armor', desc: 'Woven from Lantern light and refusal. It has never once been sold, and neither will you.', icon: '▲', color: '#ffe680', slot: 'armor', levelReq: 16, defense: 56, buy: 4200, sell: 1680 },
};
