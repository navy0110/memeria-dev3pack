// Íconos de ítems en SVG: cada uno se dibuja con degradés, brillo y los colores propios del ítem
// (los del `look` en las armas), en vez de un carácter suelto. Sirven para el inventario, la tienda,
// la barra de consumibles y los avisos de botín. Los colores salen del ítem; la forma, de su tipo.
import type { ItemDef } from '../shared/types';
import { t } from '../i18n';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic' | 'ancient' | 'legendary';

const RARITY_NAME: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  mythic: 'Mythic',
  ancient: 'Ancient',
  legendary: 'Legendary',
};
export const rarityName = (r: Rarity): string => t(RARITY_NAME[r]);

// Cada tier de equipo sube un escalón de rareza; la legendaria (MMRIA) queda arriba de todo.
const BY_LEVEL: Array<[number, Rarity]> = [
  [16, 'ancient'],
  [12, 'mythic'],
  [8, 'epic'],
  [5, 'rare'],
  [2, 'uncommon'],
];
const SPECIAL: Record<string, Rarity> = {
  'health-potion': 'common',
  apple: 'common',
  'greater-potion': 'uncommon',
  'grand-potion': 'rare',
  'bear-pelt': 'common',
  'ghost-wisp': 'uncommon',
  'bull-horn': 'uncommon',
  'golem-shard': 'rare',
  'shill-script': 'rare',
  'slippage-ichor': 'epic',
  'ledger-page-7': 'legendary',
  'mmria-token': 'legendary',
};

export function rarityOf(def: ItemDef): Rarity {
  if (def.rarity === 'legendary') return 'legendary';
  if (SPECIAL[def.id]) return SPECIAL[def.id];
  if (def.id.startsWith('ledger-page')) return 'epic';
  if (def.levelReq !== undefined) return BY_LEVEL.find(([lv]) => def.levelReq! >= lv)?.[1] ?? 'common';
  return 'common';
}

/** Mezcla un color #rrggbb con blanco (t > 0) o negro (t < 0). */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
const hexOf = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

let uid = 0;
/** Cada SVG lleva sus degradés con ids propios: varios íconos en la misma página no se pisan. */
function svg(body: (id: (name: string) => string) => string, glow?: string): string {
  const k = `ic${++uid}`;
  const id = (name: string): string => `${k}-${name}`;
  const halo = glow ? `<circle cx="24" cy="24" r="20" fill="url(#${id('halo')})"/>` : '';
  const defs = glow ? `<defs><radialGradient id="${id('halo')}"><stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>` : '';
  return `<svg class="ico-svg" viewBox="0 0 48 48" aria-hidden="true">${defs}${halo}${body(id)}</svg>`;
}

const grad = (id: string, a: string, b: string, vertical = true): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

// --- Pociones y comida ----------------------------------------------------------------------

function potion(def: ItemDef): string {
  const c = def.color;
  const big = (def.heal ?? 0) >= 100;
  const grand = (def.heal ?? 0) >= 200;
  return svg(
    (id) => `
    <defs>${grad(id('liq'), shade(c, 0.35), shade(c, -0.35))}${grad(id('glass'), '#ffffff', '#9fb4d8')}</defs>
    <path d="${big ? 'M18 5h12v7l9 12c3 5 1 15-6 17H15c-7-2-9-12-6-17l9-12z' : 'M19 6h10v8l7 9c3 5 1 14-5 16H17c-6-2-8-11-5-16l7-9z'}" fill="url(#${id('glass')})" opacity=".25" stroke="#e8f0ff" stroke-opacity=".7" stroke-width="1.3"/>
    <path d="${big ? 'M12 28c4-3 8 2 12-1s8 2 12-1c1 6-2 12-6 12H18c-5 0-7-5-6-10z' : 'M14 29c4-3 7 2 10-1s7 2 10-1c1 5-2 10-5 10H19c-4 0-6-4-5-8z'}" fill="url(#${id('liq')})"/>
    <path d="${big ? 'M13 26c3-2 6 1 11-1' : 'M15 28c3-2 5 1 9-1'}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <rect x="${big ? 17 : 18}" y="${big ? 3 : 4}" width="${big ? 14 : 12}" height="5" rx="1.5" fill="${grand ? '#ffd24a' : '#b98250'}" stroke="#4a2f17" stroke-width="1"/>
    <ellipse cx="${big ? 16 : 17}" cy="31" rx="2" ry="5" fill="#fff" opacity=".45" transform="rotate(8 17 31)"/>
    ${grand ? '<path d="M38 8l1.4 3.2L43 12.5l-3.2 1.3L38.5 17l-1.3-3.2L34 12.5l3.2-1.3z" fill="#fff6c0"/><path d="M8 10l1 2.2L11.2 13 9 13.8 8 16l-1-2.2L4.8 13 7 12.2z" fill="#fff6c0"/>' : ''}
    ${def.heal ? `<path d="M22 24h4v3h3v4h-3v3h-4v-3h-3v-4h3z" fill="#fff" opacity=".85"/>` : ''}`,
    c,
  );
}

function apple(def: ItemDef): string {
  const c = def.color;
  return svg(
    (id) => `
    <defs><radialGradient id="${id('a')}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${shade(c, 0.5)}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.55)}"/></radialGradient></defs>
    <path d="M24 14c-6-5-16-1-15 11 1 9 7 17 12 17 2 0 2-1 3-1s1 1 3 1c5 0 11-8 12-17 1-12-9-16-15-11z" fill="url(#${id('a')})" stroke="${shade(c, -0.6)}" stroke-width="1.2"/>
    <path d="M24 14c0-4 1-7 4-9" stroke="#5a3a1c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M26 9c4-4 10-3 11 0-3 4-8 4-11 0z" fill="#5fcf4a" stroke="#2d7a24" stroke-width="1"/>
    <ellipse cx="16" cy="22" rx="3" ry="5" fill="#fff" opacity=".4" transform="rotate(22 16 22)"/>`,
  );
}

// --- Materiales -----------------------------------------------------------------------------

function material(def: ItemDef): string {
  const c = def.color;
  switch (def.id) {
    case 'bear-pelt':
      return svg(
        (id) => `<defs>${grad(id('p'), shade(c, 0.25), shade(c, -0.4))}</defs>
        <path d="M10 10l8 3 6-4 6 4 8-3 2 10-4 4 3 8-8 2-3 6-4-4-4 4-3-6-8-2 3-8-4-4z" fill="url(#${id('p')})" stroke="${shade(c, -0.6)}" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M17 18l2 4M24 15v6M31 18l-2 4M18 28l3-2M30 28l-3-2" stroke="${shade(c, -0.5)}" stroke-width="1.2" stroke-linecap="round"/>
        <rect x="21" y="22" width="6" height="12" rx="1" fill="#e0403c" stroke="#7a1d1b" stroke-width="1"/><path d="M24 19v3" stroke="#222" stroke-width="1.4"/>`,
      );
    case 'ghost-wisp':
      return svg(
        (id) => `<defs><radialGradient id="${id('w')}" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.5)}"/></radialGradient></defs>
        <path d="M24 5c8 6 14 12 12 21-1 5-4 7-6 10l-3-3-3 6-3-6-3 3c-3-3-6-6-6-11 0-8 6-14 12-20z" fill="url(#${id('w')})" opacity=".92"/>
        <circle cx="19" cy="22" r="2.4" fill="#2a1a52"/><circle cx="29" cy="22" r="2.4" fill="#2a1a52"/><ellipse cx="24" cy="29" rx="2.2" ry="3" fill="#2a1a52"/>`,
        c,
      );
    case 'bull-horn':
      return svg(
        (id) => `<defs>${grad(id('h'), '#fffaf0', shade(c, -0.45), false)}</defs>
        <path d="M8 38c0-14 8-28 30-30-6 4-8 8-9 14-1 6-5 12-13 16-4 2-8 1-8 0z" fill="url(#${id('h')})" stroke="${shade(c, -0.6)}" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M14 33c6-4 10-10 12-17" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <path d="M10 36l8 2" stroke="${shade(c, -0.55)}" stroke-width="1.4"/>`,
      );
    case 'golem-shard':
      return svg(
        (id) => `<defs>${grad(id('s'), shade(c, 0.6), shade(c, -0.45))}</defs>
        <path d="M24 3l11 14-5 26H18L13 17z" fill="url(#${id('s')})" stroke="${shade(c, -0.6)}" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M24 3l-4 14 4 26 6-26zM13 17h22" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>
        <path d="M24 17l-3 12 3 8 2-8z" fill="#ff4d5a" opacity=".75"/>`,
        c,
      );
    case 'shill-script':
      return svg(
        (id) => `<defs>${grad(id('r'), '#f7f0d6', '#cdbf8e')}</defs>
        <path d="M11 9c0-3 3-4 5-4h20c-2 1-2 4 0 5v27c0 3-3 5-6 5H14c-2 0-3-1-3-3z" fill="url(#${id('r')})" stroke="#6b5a2b" stroke-width="1.3"/>
        <path d="M17 14h14M17 19h14M17 24h10M17 29h14M17 34h8" stroke="${shade(c, -0.25)}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="35" cy="36" r="5" fill="${c}" stroke="${shade(c, -0.5)}" stroke-width="1.2"/><path d="M33 36l2 2 3-4" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
      );
    case 'slippage-ichor':
      return svg(
        (id) => `<defs>${grad(id('l'), shade(c, 0.4), shade(c, -0.6))}</defs>
        <path d="M17 5h14v6l-2 3c6 3 10 10 8 18-1 6-6 10-13 10s-12-4-13-10c-2-8 2-15 8-18l-2-3z" fill="#e8efff" fill-opacity=".2" stroke="#e0e6ff" stroke-opacity=".7" stroke-width="1.3"/>
        <path d="M11 28c3-3 7 1 13-1s10 2 13 0c1 8-4 14-13 14S10 36 11 28z" fill="url(#${id('l')})"/>
        <circle cx="19" cy="33" r="2" fill="#fff" opacity=".35"/><circle cx="28" cy="36" r="1.4" fill="#fff" opacity=".3"/>
        <path d="M17 5h14v3H17z" fill="#6b5a2b"/>`,
        c,
      );
    default:
      if (def.id.startsWith('ledger-page')) {
        const last = def.id.endsWith('7');
        return svg(
          (id) => `<defs>${grad(id('pg'), '#f9efc9', '#cdb878')}</defs>
          <path d="M12 6h20l6 6v30H12z" fill="url(#${id('pg')})" stroke="#6b5420" stroke-width="1.3"/>
          <path d="M32 6v6h6" fill="#e0cf96" stroke="#6b5420" stroke-width="1.2"/>
          <path d="M17 17h14M17 22h14M17 27h9" stroke="#8a6a2a" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
          <circle cx="29" cy="35" r="5.5" fill="${last ? '#ffe680' : '#c0392b'}" stroke="${last ? '#a8770d' : '#6e1b13'}" stroke-width="1.2"/>
          <path d="M29 31.5l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z" fill="${last ? '#fff7cf' : '#f5c6bf'}"/>`,
          last ? '#ffe680' : undefined,
        );
      }
      return generic(def);
  }
}

function generic(def: ItemDef): string {
  const c = def.color;
  return svg((id) => `<defs>${grad(id('g'), shade(c, 0.4), shade(c, -0.4))}</defs><path d="M24 5l16 10v18L24 43 8 33V15z" fill="url(#${id('g')})" stroke="${shade(c, -0.6)}" stroke-width="1.3" stroke-linejoin="round"/><path d="M24 5v38M8 15l32 18M40 15L8 33" stroke="#fff" stroke-opacity=".25"/>`);
}

// --- Armas ----------------------------------------------------------------------------------

function weapon(def: ItemDef): string {
  const look = def.look!;
  const blade = hexOf(look.blade);
  const trim = hexOf(look.trim);
  const glow = look.glow !== undefined ? hexOf(look.glow) : undefined;
  const fx = look.fx ?? [];
  const sparkle = fx.length > 1 || def.rarity === 'legendary';
  const cls = def.classes?.[0];
  const star = (x: number, y: number, s: number, col: string): string => `<path d="M${x} ${y - s}l${s * 0.3} ${s * 0.7} ${s * 0.7} ${s * 0.3}-${s * 0.7} ${s * 0.3}-${s * 0.3} ${s * 0.7}-${s * 0.3}-${s * 0.7}-${s * 0.7}-${s * 0.3} ${s * 0.7}-${s * 0.3}z" fill="${col}"/>`;
  const extra = sparkle ? star(38, 10, 4.5, '#fff6c0') + star(9, 36, 3.5, '#fff6c0') : '';
  const dark = shade(blade, -0.5);
  return svg((id) => {
    const bg = `<defs>${grad(id('b'), shade(blade, 0.55), blade)}${grad(id('t'), shade(trim, 0.3), shade(trim, -0.4))}</defs>`;
    let art: string;
    switch (cls) {
      case 'shiba': // espada
        art = `<g transform="rotate(45 24 24)"><path d="M24 2l4 6v22h-8V8z" fill="url(#${id('b')})" stroke="${dark}" stroke-width="1.1" stroke-linejoin="round"/><path d="M24 4v26" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><rect x="15" y="30" width="18" height="4" rx="1.5" fill="url(#${id('t')})" stroke="${shade(trim, -0.55)}" stroke-width="1"/><rect x="21.5" y="34" width="5" height="9" rx="1.5" fill="#5a3a22" stroke="#2a1a0e" stroke-width="1"/><circle cx="24" cy="45" r="2.4" fill="url(#${id('t')})"/></g>`;
        break;
      case 'doge': // daga
        art = `<g transform="rotate(45 24 24)"><path d="M24 7c4 5 5 12 4 22h-8c-1-10 0-17 4-22z" fill="url(#${id('b')})" stroke="${dark}" stroke-width="1.1" stroke-linejoin="round"/><path d="M24 9v18" stroke="#fff" stroke-opacity=".5" stroke-width="1.1"/><path d="M16 29h16l-2 4H18z" fill="url(#${id('t')})" stroke="${shade(trim, -0.55)}" stroke-width="1"/><rect x="21.5" y="33" width="5" height="9" rx="1.5" fill="#5a3a22" stroke="#2a1a0e" stroke-width="1"/></g>`;
        break;
      case 'pepe': // bastón con gema
        art = `<g transform="rotate(40 24 24)"><rect x="22" y="14" width="4" height="31" rx="2" fill="#7a5230" stroke="#3a2412" stroke-width="1"/><path d="M17 15c0-6 3-9 7-12 4 3 7 6 7 12-2 2-4 2-7 2s-5 0-7-2z" fill="url(#${id('t')})" stroke="${shade(trim, -0.55)}" stroke-width="1"/><circle cx="24" cy="11" r="5" fill="url(#${id('b')})" stroke="${dark}" stroke-width="1"/><circle cx="22.4" cy="9.4" r="1.6" fill="#fff" opacity=".8"/></g>`;
        break;
      case 'popcat': // bo
        art = `<g transform="rotate(45 24 24)"><rect x="21" y="2" width="6" height="44" rx="3" fill="url(#${id('b')})" stroke="${dark}" stroke-width="1.1"/><rect x="20" y="9" width="8" height="4" rx="1" fill="url(#${id('t')})"/><rect x="20" y="35" width="8" height="4" rx="1" fill="url(#${id('t')})"/><path d="M23 4v40" stroke="#fff" stroke-opacity=".45" stroke-width="1"/></g>`;
        break;
      default: // arco
        art = `<path d="M14 5c16 4 26 20 20 38" fill="none" stroke="url(#${id('t')})" stroke-width="3.6" stroke-linecap="round"/><path d="M14 5c16 4 26 20 20 38" fill="none" stroke="${blade}" stroke-width="1.6" stroke-linecap="round"/><path d="M14 5L34 43" stroke="#f4efe0" stroke-width="1"/><path d="M12 38L38 12" stroke="#cfc6a0" stroke-width="1.6" stroke-linecap="round"/><path d="M38 12l-6 1 5 5z" fill="${trim}" stroke="${dark}" stroke-width=".8"/>`;
    }
    return bg + art + extra;
  }, glow ?? (sparkle ? blade : undefined));
}

// --- Armaduras ------------------------------------------------------------------------------

function armor(def: ItemDef): string {
  const c = def.color;
  const lvl = def.levelReq ?? 1;
  return svg(
    (id) => `
    <defs>${grad(id('a'), shade(c, 0.45), shade(c, -0.45))}${grad(id('g'), '#fff0b0', '#c98a14')}</defs>
    <path d="M15 6l9 4 9-4 9 7-6 8-3-2v22c0 2-2 3-4 3H19c-2 0-4-1-4-3V19l-3 2-6-8z" fill="url(#${id('a')})" stroke="${shade(c, -0.65)}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M24 10v33" stroke="${shade(c, -0.55)}" stroke-width="1.2"/>
    <path d="M18 19c4 2 8 2 12 0" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/>
    ${lvl >= 5 ? `<rect x="18" y="30" width="12" height="3" rx="1.2" fill="url(#${id('g')})" stroke="#7a5410" stroke-width=".8"/>` : ''}
    ${lvl >= 8 ? `<circle cx="24" cy="23" r="3.2" fill="url(#${id('g')})" stroke="#7a5410" stroke-width=".9"/>` : ''}
    ${lvl >= 12 ? `<path d="M15 6l-3 5M33 6l3 5" stroke="url(#${id('g')})" stroke-width="2.4" stroke-linecap="round"/>` : ''}
    ${lvl >= 16 ? '<path d="M39 6l1 2.4 2.4 1-2.4 1L39 13l-1-2.6-2.4-1 2.4-1z" fill="#fff6c0"/>' : ''}`,
    lvl >= 12 ? c : undefined,
  );
}

function token(): string {
  return svg(
    (id) => `<defs>${grad(id('c'), '#fff0b0', '#c98a14')}</defs>
    <circle cx="24" cy="24" r="17" fill="url(#${id('c')})" stroke="#7a5410" stroke-width="2"/>
    <circle cx="24" cy="24" r="12.5" fill="#0a0c2c" stroke="#ffd35a" stroke-width="1.4"/>
    <path d="M16 31V18l8 10 8-10v13" fill="none" stroke="url(#${id('c')})" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24 8.5l1.4 2.8 3 .4-2.2 2.1.5 3-2.7-1.4-2.7 1.4.5-3-2.2-2.1 3-.4z" fill="#fff0b0" transform="translate(0 -1)"/>`,
    '#ffd35a',
  );
}

/** SVG del ítem, listo para meter en una casilla. */
export function itemIcon(def: ItemDef): string {
  if (def.id === 'mmria-token') return token();
  if (def.look && def.slot === 'weapon') return weapon(def);
  if (def.slot === 'armor') return armor(def);
  if (def.heal !== undefined) return def.id === 'apple' ? apple(def) : potion(def);
  if (def.kind === 'material') return material(def);
  return generic(def);
}
