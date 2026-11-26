// Prueba del mundo compartido del servidor, sin Cloudflare: tsx scripts/test-world.ts
import assert from 'node:assert/strict';
import { MobWorld } from '../src/server/world';
import { Ranking, weekKey, type RankStore } from '../src/server/ranking';

const w = new MobWorld();
const bear = w.mobs.find((m) => m.templateId === 'bear')!;
console.log('mobs', w.mobs.length, 'primer oso', bear.id, bear.x, bear.z);

// Dos jugadores en la zona de caza: el oso persigue al más cercano y lo muerde.
const a = { id: 'a', cls: 'shiba', x: bear.x + 3, z: bear.z };
const b = { id: 'b', cls: 'pepe', x: bear.x + 6, z: bear.z };
let bitten = '';
for (let i = 0; i < 100 && !bitten; i++) {
  const r = w.tick(0.1, [a, b]);
  const s = r.strikes.find((x) => x.mobId === bear.id);
  if (s) bitten = s.playerId;
  a.x = bear.x + 1.2; // el jugador se queda al lado
}
assert.equal(bitten, 'a', 'el oso muerde al más cercano');

// Golpes: lejos no cuenta; el tope de daño recorta; matar reparte créditos a los dos.
const far = { id: 'c', cls: 'shiba', x: bear.x + 60, z: bear.z };
assert.equal(w.hit(far, bear.id, 10, 1000).ok, false, 'fuera de alcance');
const near = { ...a, x: bear.x + 1, z: bear.z };
const cheat = w.hit(near, bear.id, 99999, 2000);
assert.ok(cheat.ok);
if (cheat.ok) assert.ok(cheat.dmg < 200, `daño recortado (${cheat.dmg})`);

const w2 = new MobWorld();
const m2 = w2.mobs[0];
const p1 = { id: 'p1', cls: 'shiba', x: m2.x, z: m2.z };
const p2 = { id: 'p2', cls: 'pepe', x: m2.x, z: m2.z };
let kill = null as ReturnType<MobWorld['hit']> | null;
w2.hit(p2, m2.id, 5, 0);
for (let t = 0; t < 40 && !(kill && kill.ok && kill.kill); t++) kill = w2.hit(p1, m2.id, 20, 1000 + t * 300);
assert.ok(kill && kill.ok && kill.kill, 'murió');
if (kill && kill.ok && kill.kill) assert.deepEqual(kill.kill.credit.sort(), ['p1', 'p2']);
assert.equal(w2.drops.length, 1, 'cayó una bolsa');
const bag = w2.drops[0];
assert.equal(w2.pickup(far, bag.id), null, 'lejos no la recoge');
assert.ok(w2.pickup(p1, bag.id), 'el primero se la lleva');
assert.equal(w2.pickup(p2, bag.id), null, 'el segundo llega tarde');
assert.equal(w2.hit(p1, m2.id, 5, 99999).ok, false, 'muerto no recibe golpes');

// Respawn: pasa el tiempo y vuelve entero.
for (let i = 0; i < 700; i++) w2.tick(0.1, []);
assert.ok(m2.alive && m2.hp > 0, 'respawneó');

// Ráfagas: más de 12 golpes en el mismo instante se cortan.
const w3 = new MobWorld();
const spam = { id: 's', cls: 'shiba', x: w3.mobs[0].x, z: w3.mobs[0].z };
const oks = Array.from({ length: 30 }, () => w3.hit(spam, w3.mobs[0].id, 1, 5000).ok).filter(Boolean).length;
assert.ok(oks <= 13, `ráfaga cortada (${oks})`);

// Los mobs que no cambian no se reenvían.
const w4 = new MobWorld();
assert.equal(w4.tick(0.1, []).changed.length, w4.mobs.length, 'el primer tick manda todo');
assert.equal(w4.tick(0.1, []).changed.length, 0, 'quietos, no se manda nada');

// Ranking.
const mem = new Map<string, unknown>();
const store: RankStore = {
  get: async <T>(k: string) => mem.get(k) as T | undefined,
  put: async (k, v) => void mem.set(k, structuredClone(v)),
  delete: async (ks) => ks.filter((k) => mem.delete(k)).length,
  list: async ({ prefix }) => new Map([...mem].filter(([k]) => k.startsWith(prefix))),
};
const day = Date.UTC(2026, 9, 27, 12);
assert.equal(weekKey(day), '2026-W44');
assert.equal(weekKey(Date.UTC(2026, 9, 26, 0, 0, 1)), '2026-W44');
assert.equal(weekKey(Date.UTC(2026, 9, 25, 23)), '2026-W43');
assert.equal(weekKey(Date.UTC(2027, 0, 1)), '2026-W53');
const r = new Ranking(store);
await r.sync(day);
r.addKill('k1', 'Pepe 1', 'pepe', 3);
r.addKill('k2', 'Shiba 2', 'shiba', 5);
r.addKill('k2', 'Shiba 2', 'shiba', 5);
assert.equal(r.top(5)[0].n, 'Shiba 2');
assert.deepEqual(r.rankOf('k1'), { rank: 2, k: 1 });
assert.equal(r.rankOf('nadie'), null);
assert.deepEqual(r.factions(), { pepe: 1, shiba: 2 });
await r.flush();
const r2 = new Ranking(store);
await r2.sync(day + 3600_000);
assert.equal(r2.top(5).length, 2, 'se recupera lo guardado');
await r2.sync(day + 8 * 86400_000);
assert.equal(r2.top(5).length, 0, 'semana nueva, tablero vacío');
console.log('OK');
