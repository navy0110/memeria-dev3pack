import type { Collider, SpawnDef, ZoneDef } from '../../shared/types';

// Zona inicial: Hodl Hollow (segura), Moonlit Road, Bagholder Fields, Diamond Meadow,
// Ruins of the First Mint y Rug Pull Marsh; más afuera, las cuatro zonas del fondo:
// Dead Cat Hills (este), Liquidation Canyon (oeste), Whitepaper Wastes (sur) y The Drained Pool (norte). Unidades en metros. La altura (y) es solo
// visual: las colisiones son en el plano XZ.
//
// Árboles, rocas y mobs se generan acá con una semilla fija (el mundo es idéntico en cada
// carga y en el servidor), evitando la villa, el camino, las ruinas y los obstáculos fijos.

// 320x260 m: pensado para tener lugar con unas 40 personas a la vez sin que se pisen.
const BOUNDS = { minX: -160, maxX: 160, minZ: -130, maxZ: 130 };
const VILLA = { minX: -22, maxX: 14, minZ: -20, maxZ: 20 };
const RUINS = { x: -38, z: 0, r: 12 };
// Campamentos de las zonas del fondo: sin árboles ni mobs alrededor.
const CAMPS = [
  { x: 98, z: 6, r: 7 }, // Dip Buyer Camp
  { x: -98, z: 8, r: 7 }, // Last Margin Post
  { x: 0, z: 100, r: 7 }, // Whitepaper Walt
  { x: 0, z: -110, r: 7 }, // Rekt Rick, borde del pozo
  // Arenas de los jefes
  { x: 140, z: 40, r: 7 },
  { x: -144, z: 40, r: 7 },
  { x: 100, z: 118, r: 7 },
  { x: 0, z: -124, r: 7 },
  { x: 146, z: -90, r: 11 }, // guarida del jefe de raid
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Obstáculos fijos hechos a mano.
const FIXED: Collider[] = [
  // Villa
  { shape: 'box', minX: -16, maxX: -9, minZ: 6, maxZ: 12, visual: 'house' },
  { shape: 'box', minX: 4, maxX: 10, minZ: -12, maxZ: -6, visual: 'house' },
  { shape: 'box', minX: -18, maxX: -8, minZ: -18, maxZ: -12, visual: 'inn' },
  { shape: 'box', minX: 6, maxX: 9, minZ: 8, maxZ: 11, visual: 'stall' },
  { shape: 'circle', x: 0, z: 0, r: 1.6, visual: 'fountain' },
  // Ruinas: seis columnas en círculo
  { shape: 'circle', x: -30, z: 0, r: 0.8, visual: 'pillar' },
  { shape: 'circle', x: -34, z: 6.93, r: 0.8, visual: 'pillar' },
  { shape: 'circle', x: -42, z: 6.93, r: 0.8, visual: 'pillar' },
  { shape: 'circle', x: -46, z: 0, r: 0.8, visual: 'pillar' },
  { shape: 'circle', x: -42, z: -6.93, r: 0.8, visual: 'pillar' },
  { shape: 'circle', x: -34, z: -6.93, r: 0.8, visual: 'pillar' },
  // Lagunas
  { shape: 'circle', x: 62, z: 34, r: 7, visual: 'pond' },
  { shape: 'circle', x: -68, z: 52, r: 5, visual: 'pond' },
  { shape: 'circle', x: 8, z: -62, r: 6, visual: 'pond' },
  { shape: 'circle', x: 110, z: -20, r: 8, visual: 'pond' },
  { shape: 'circle', x: -120, z: 90, r: 7, visual: 'pond' },
  { shape: 'circle', x: 40, z: 100, r: 6, visual: 'pond' },
  { shape: 'circle', x: -60, z: -100, r: 7, visual: 'pond' },
  { shape: 'circle', x: 90, z: -105, r: 6, visual: 'pond' },
];

function nearCollider(x: number, z: number, pad: number, list: Collider[]): boolean {
  for (const c of list) {
    if (c.shape === 'circle') {
      if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    } else if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
  }
  return false;
}

/** Zonas donde no se generan árboles ni rocas: la villa, el camino y las ruinas. */
function reserved(x: number, z: number): boolean {
  if (x > VILLA.minX - 5 && x < VILLA.maxX + 5 && z > VILLA.minZ - 5 && z < VILLA.maxZ + 5) return true;
  if (x > 8 && x < 46 && Math.abs(z) < 7) return true;
  if (CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) return true;
  return Math.hypot(x - RUINS.x, z - RUINS.z) < RUINS.r;
}

function generate(): { colliders: Collider[]; spawns: SpawnDef[] } {
  const rand = rng(20261026);
  const all: Collider[] = [...FIXED];
  const inside = (x: number, z: number, m: number): boolean =>
    x > BOUNDS.minX + m && x < BOUNDS.maxX - m && z > BOUNDS.minZ + m && z < BOUNDS.maxZ - m;
  const tryPlace = (x: number, z: number, pad: number): boolean =>
    inside(x, z, 2) && !reserved(x, z) && !nearCollider(x, z, pad, all);

  // Arboledas: grupos de árboles, más algunos sueltos
  const trees: Collider[] = [];
  const addTree = (x: number, z: number): void => {
    if (!tryPlace(x, z, 1.6)) return;
    const c: Collider = { shape: 'circle', x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, r: 0.6, visual: 'tree' };
    trees.push(c);
    all.push(c);
  };
  for (let g = 0; g < 46; g++) {
    const cx = BOUNDS.minX + 8 + rand() * (BOUNDS.maxX - BOUNDS.minX - 16);
    const cz = BOUNDS.minZ + 8 + rand() * (BOUNDS.maxZ - BOUNDS.minZ - 16);
    const n = 6 + Math.floor(rand() * 7);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = 1.5 + rand() * 9;
      addTree(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
    }
  }
  for (let i = 0; i < 105; i++) {
    addTree(BOUNDS.minX + 3 + rand() * (BOUNDS.maxX - BOUNDS.minX - 6), BOUNDS.minZ + 3 + rand() * (BOUNDS.maxZ - BOUNDS.minZ - 6));
  }
  // Rocas sueltas
  for (let i = 0; i < 75; i++) {
    const x = BOUNDS.minX + 4 + rand() * (BOUNDS.maxX - BOUNDS.minX - 8);
    const z = BOUNDS.minZ + 4 + rand() * (BOUNDS.maxZ - BOUNDS.minZ - 8);
    if (!tryPlace(x, z, 1.5)) continue;
    const c: Collider = { shape: 'circle', x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, r: 0.6 + rand() * 0.5, visual: 'rock' };
    trees.push(c);
    all.push(c);
  }

  // Mobs por región, con separación mínima entre ellos.
  const spawns: SpawnDef[] = [];
  const placed: Array<[number, number]> = [];
  const mobs = (tpl: string, prefix: string, n: number, box: [number, number, number, number], respawn: number): void => {
    let made = 0;
    let guard = 400;
    while (made < n && guard-- > 0) {
      const x = box[0] + rand() * (box[1] - box[0]);
      const z = box[2] + rand() * (box[3] - box[2]);
      if (nearCollider(x, z, 1.5, all)) continue;
      if (Math.hypot(x - VILLA.maxX, z) < 6 && x < 20) continue;
      if (CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 3)) continue;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7)) continue;
      placed.push([x, z]);
      made++;
      spawns.push({
        type: 'mob',
        id: `${prefix}-${made}`,
        template: tpl,
        position: [Math.round(x * 2) / 2, 0, Math.round(z * 2) / 2],
        respawnTime: respawn,
      });
    }
  };
  // Escalera de dificultad: cuanto más lejos de la villa, más nivel (ver data/mobs.ts).
  mobs('cub', 'cub', 10, [-16, 8, 30, 88], 8); // Diamond Meadow, Lv 1
  mobs('bear', 'bear', 22, [22, 88, -64, 88], 10); // Bagholder Fields, Lv 3
  mobs('grizzly', 'grizzly', 18, [-98, -28, -64, 88], 15); // Ruins of the First Mint, Lv 5
  mobs('ghost', 'ghost', 20, [-150, 150, -100, -76], 25); // Rug Pull Marsh, Lv 7
  // Capítulos 2 a 4: más lejos, más nivel, y un jefe (un Founder caído) al fondo de cada zona.
  mobs('dead-cat', 'dead-cat', 12, [96, 156, -64, 88], 12); // Dead Cat Hills, Lv 9
  mobs('bull-trap', 'bull-trap', 12, [100, 156, -64, 88], 14); // Dead Cat Hills, Lv 10
  mobs('golem', 'golem', 12, [-156, -104, -64, 88], 16); // Liquidation Canyon, Lv 12
  mobs('margin-caller', 'margin-caller', 12, [-156, -104, -64, 88], 16); // Liquidation Canyon, Lv 13
  mobs('shillbot', 'shillbot', 12, [-150, 150, 96, 126], 18); // Whitepaper Wastes, Lv 15
  mobs('vaporware-wisp', 'vaporware-wisp', 10, [-150, 150, 96, 126], 18); // Whitepaper Wastes, Lv 16
  mobs('slippage-wraith', 'slippage-wraith', 10, [-150, 150, -126, -106], 20); // Drained Pool, Lv 18
  mobs('rekt-revenant', 'rekt-revenant', 10, [-150, 150, -126, -106], 20); // Drained Pool, Lv 19
  // Jefes: posiciones fijas (despejadas de árboles por las zonas reservadas) y respawn largo.
  const boss = (tpl: string, x: number, z: number, respawn: number): void => {
    spawns.push({ type: 'mob', id: `boss-${tpl}`, template: tpl, position: [x, 0, z], respawnTime: respawn });
  };
  boss('bull-baron', 140, 40, 300);
  boss('stop-loss-colossus', -144, 40, 300);
  boss('hype-man', 100, 118, 360);
  boss('deployer', 0, -124, 600);
  // Jefe de raid: escondido en el rincón sudeste del pantano, sin camino ni campamento que lo marque.
  boss('rugwyrm', 146, -90, 1800);
  return { colliders: trees, spawns };
}

const gen = generate();

export const HODL_HOLLOW: ZoneDef = {
  id: 'hodl-hollow',
  name: 'Hodl Hollow',
  playerStart: [0, 0, 4],
  geometry: {
    bounds: BOUNDS,
    // El primero que contiene el punto gana (regionAt), y los parches del mismo suelo no deben
    // solaparse (se pisarían al dibujar): por eso las regiones del mismo tipo son rectángulos contiguos.
    regions: [
      { id: 'villa', name: 'Hodl Hollow', bounds: VILLA, safe: true, ground: 'stone' },
      { id: 'camino', name: 'Moonlit Road', bounds: { minX: 14, maxX: 44, minZ: -4, maxZ: 4 }, safe: false, ground: 'road' },
      { id: 'campo', name: 'Bagholder Fields', bounds: { minX: 14, maxX: 92, minZ: -70, maxZ: 92 }, safe: false, ground: 'grass' },
      { id: 'estepa', name: 'Ruins of the First Mint', bounds: { minX: -100, maxX: -22, minZ: -70, maxZ: 92 }, safe: false, ground: 'grass' },
      { id: 'prado', name: 'Diamond Meadow', bounds: { minX: -22, maxX: 14, minZ: 20, maxZ: 92 }, safe: false, ground: 'grass' },
      { id: 'pantano', name: 'Rug Pull Marsh', bounds: { minX: -160, maxX: 160, minZ: -104, maxZ: -70 }, safe: false, ground: 'swamp' },
      { id: 'colinas', name: 'Dead Cat Hills', bounds: { minX: 92, maxX: 160, minZ: -70, maxZ: 92 }, safe: false, ground: 'grass' },
      { id: 'canon', name: 'Liquidation Canyon', bounds: { minX: -160, maxX: -100, minZ: -70, maxZ: 92 }, safe: false, ground: 'stone' },
      { id: 'yermos', name: 'Whitepaper Wastes', bounds: { minX: -160, maxX: 160, minZ: 92, maxZ: 130 }, safe: false, ground: 'road' },
      { id: 'pozo', name: 'The Drained Pool', bounds: { minX: -160, maxX: 160, minZ: -130, maxZ: -104 }, safe: false, ground: 'swamp' },
    ],
    colliders: [...FIXED, ...gen.colliders],
  },
  spawns: [
    // NPCs de la villa
    { type: 'npc', id: 'npc-elder', npc: 'elder-hodl', position: [-3, 0, -1] },
    { type: 'npc', id: 'npc-ana', npc: 'ana-trader', position: [-6, 0, 9] },
    { type: 'npc', id: 'npc-tom', npc: 'tom-innkeeper', position: [-4, 0, -14] },
    { type: 'npc', id: 'npc-bruno', npc: 'bruno-scout', position: [12, 0, -4] },
    { type: 'npc', id: 'npc-dan', npc: 'diamond-dan', position: [2.5, 0, -9] },
    { type: 'npc', id: 'npc-pete', npc: 'paper-hands-pete', position: [-11, 0, 3] },
    { type: 'npc', id: 'npc-wanda', npc: 'whale-wanda', position: [6, 0, 2] },
    { type: 'npc', id: 'npc-dex', npc: 'degen-dex', position: [-9, 0, -6] },
    { type: 'npc', id: 'npc-eddie', npc: 'exit-eddie', position: [11, 0, 14] },
    { type: 'npc', id: 'npc-gary', npc: 'gary-grocer', position: [7.5, 0, 7] },
    { type: 'npc', id: 'npc-mike', npc: 'mod-mike', position: [12.5, 0, 3] },
    // En la entrada de las ruinas, fuera de la villa
    { type: 'npc', id: 'npc-founder', npc: 'last-founder', position: [-25, 0, 3] },
    // Campamentos de las zonas del fondo
    { type: 'npc', id: 'npc-dolores', npc: 'dolores-dipbuyer', position: [98, 0, 6] },
    { type: 'npc', id: 'npc-mary', npc: 'margin-mary', position: [-98, 0, 8] },
    { type: 'npc', id: 'npc-walt', npc: 'whitepaper-walt', position: [0, 0, 100] },
    { type: 'npc', id: 'npc-rick', npc: 'rekt-rick', position: [0, 0, -110] },
    ...gen.spawns,
  ],
};
