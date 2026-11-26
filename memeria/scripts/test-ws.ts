// Prueba de punta a punta contra `wrangler dev` (puerto 8799): dos clientes comparten un oso.
import assert from 'node:assert/strict';
import { newIdentity } from './auth-client';

const URL_WS = process.env.WS ?? 'ws://127.0.0.1:8799/ws';
interface Bot { ws: WebSocket; id: string; inbox: any[]; send(m: unknown): void; wait(f: (m: any) => boolean, ms?: number): Promise<any> }

async function bot(): Promise<Bot> {
  const id = await newIdentity();
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${URL_WS}?t=${encodeURIComponent(id.token)}`);
    const inbox: any[] = [];
    const waiters: Array<{ f: (m: any) => boolean; ok: (m: any) => void }> = [];
    const b: Bot = {
      ws, id: '', inbox,
      send: (m) => ws.send(JSON.stringify(m)),
      wait: (f, ms = 4000) => new Promise((ok, no) => {
        const hit = inbox.find(f);
        if (hit) return ok(hit);
        const t = setTimeout(() => no(new Error('timeout esperando mensaje')), ms);
        waiters.push({ f, ok: (m) => { clearTimeout(t); ok(m); } });
      }),
    };
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data));
      if (m.t === 'hello') { b.id = m.id; res(b); }
      inbox.push(m);
      for (const w of waiters.splice(0)) { if (w.f(m)) w.ok(m); else waiters.push(w); }
    });
    ws.addEventListener('error', () => rej(new Error('no conecta')));
  });
}

const A = await bot();
const hello = A.inbox.find((m) => m.t === 'hello');
assert.ok(hello.mobs.length > 20, 'hello trae los mobs');
const bear = hello.mobs.find((m: any[]) => String(m[0]).startsWith('bear'));
console.log('oso', bear.slice(0, 3));
const [, bx, bz] = bear;

const B = await bot();
// A y B se paran junto al oso, fuera de la villa.
const pos = (b: Bot, name: string, cls: string, dx: number, key: string) =>
  b.send({ t: 'pos', name, cls, skin: 0, x: bx + dx, z: bz, r: 0, key, lvl: 3 });
pos(A, 'Shiba A', 'shiba', 1, 'wallet-A');
pos(B, 'Pepe B', 'pepe', 3, 'wallet-B');

// El oso los persigue y muerde a alguien.
const strike = await Promise.race([A.wait((m) => m.t === 'mhit', 6000), B.wait((m) => m.t === 'mhit', 6000)]);
console.log('mordida', strike);
assert.ok(strike.d > 0);

// B le pega: A ve el golpe ajeno. Luego lo rematan entre los dos.
B.send({ t: 'hit', id: bear[0], dmg: 20 });
const seen = await A.wait((m) => m.t === 'hit' && m.id === bear[0]);
assert.equal(seen.a, 20);
let killedA = false, killedB = false;
for (let i = 0; i < 30 && !(killedA && killedB); i++) {
  A.send({ t: 'hit', id: bear[0], dmg: 20 });
  await new Promise((r) => setTimeout(r, 150));
  killedA = A.inbox.some((m) => m.t === 'kill');
  killedB = B.inbox.some((m) => m.t === 'kill');
  if (killedA) break;
}
const kA = await A.wait((m) => m.t === 'kill');
const kB = await B.wait((m) => m.t === 'kill');
assert.equal(kA.tpl, 'bear');
assert.equal(kB.tpl, 'bear', 'el que ayudó también cobra');
const drop = (await A.wait((m) => m.t === 'drop')).drop;
console.log('bolsa', drop);
const dead = await B.wait((m) => m.t === 'mobs' && m.m.some((x: any[]) => x[0] === bear[0] && x[6] === 0));
assert.ok(dead, 'todos ven al oso muerto');

// La bolsa: pickup desde lejos falla; los dos la piden y uno solo se la lleva.
pos(A, 'Shiba A', 'shiba', 0, 'wallet-A');
pos(B, 'Pepe B', 'pepe', 0, 'wallet-B');
await new Promise((r) => setTimeout(r, 300));
A.send({ t: 'pickup', id: drop.id });
B.send({ t: 'pickup', id: drop.id });
await new Promise((r) => setTimeout(r, 600));
const gotA = A.inbox.filter((m) => m.t === 'loot').length;
const gotB = B.inbox.filter((m) => m.t === 'loot').length;
assert.equal(gotA + gotB, 1, `la bolsa la recoge uno solo (A=${gotA}, B=${gotB})`);
assert.ok(A.inbox.some((m) => m.t === 'dropgone' && m.id === drop.id));

// Ranking.
A.send({ t: 'lb' });
const lb = await A.wait((m) => m.t === 'lb');
console.log('ranking', JSON.stringify(lb));
assert.ok(lb.top.length >= 2 && lb.me && lb.me.k >= 1);
assert.ok(lb.factions.shiba >= 1 && lb.factions.pepe >= 1);

// Mal formado: no tumba al servidor.
A.ws.send('{{{');
A.send({ t: 'hit', id: 'bear-1', dmg: 'x' });
A.send({ t: 'pos', x: 'a' });
A.send({ t: 'say', name: 'Shiba A', text: 'hola' });
const said = await A.wait((m) => m.t === 'say' && m.text === 'hola');
assert.equal(said.id, A.id, 'el mensaje lleva el id de quien habla');
assert.equal(said.kind, 'say');

// Emotes y /me: el texto sale del servidor; lo desconocido se descarta.
await new Promise((r) => setTimeout(r, 900));
B.send({ t: 'say', text: '/wave' });
const wave = await A.wait((m) => m.t === 'say' && m.kind === 'emote' && m.id === B.id);
assert.equal(wave.emoji, '👋');
await new Promise((r) => setTimeout(r, 900));
B.send({ t: 'say', text: '/me stares at the Well' });
const me = await A.wait((m) => m.t === 'say' && m.kind === 'emote' && m.text === 'stares at the Well');
assert.equal(me.emoji, undefined);
await new Promise((r) => setTimeout(r, 900));
B.send({ t: 'say', text: '/hack everything' });
await new Promise((r) => setTimeout(r, 400));
assert.ok(!A.inbox.some((m) => m.t === 'say' && String(m.text).includes('hack')), 'un comando desconocido no es chat');

// «Escribiendo...» llega a los demás, con el id de quien escribe.
B.send({ t: 'typing' });
const typ = await A.wait((m) => m.t === 'typing');
assert.equal(typ.id, B.id);
console.log('OK');
A.ws.close(); B.ws.close();
