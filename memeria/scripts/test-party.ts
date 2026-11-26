// Prueba de punta a punta contra `wrangler dev` (puerto 8799): party, chat de party y Mend entre amigos.
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
const clear = (b: Bot) => { b.inbox.length = 0; };
const pos = (b: Bot, name: string, x: number, hp: number, key: string) =>
  b.send({ t: 'pos', name, cls: 'pepe', skin: 0, x, z: 0, r: 0, key, lvl: 10, hp, maxHp: 100 });

const A = await bot();
const B = await bot();
const C = await bot();
pos(A, 'Alice', 0, 100, 'wallet-A');
pos(B, 'Bob', 5, 40, 'wallet-B');
pos(C, 'Cleo', 200, 100, 'wallet-C');
await new Promise((r) => setTimeout(r, 300));

// Mend sin party: se rechaza.
A.send({ t: 'heal', to: B.id });
await new Promise((r) => setTimeout(r, 200));
assert.ok(!A.inbox.some((m) => m.t === 'heal'), 'sin party no hay curación');

// Invitar, aceptar y ver la party completa en los dos.
A.send({ t: 'party', a: 'invite', to: B.id });
const inv = await B.wait((m) => m.t === 'pinv');
assert.equal(inv.from, A.id);
B.send({ t: 'party', a: 'accept' });
const pa = await A.wait((m) => m.t === 'party' && m.members.length === 2);
assert.equal(pa.leader, A.id);
await B.wait((m) => m.t === 'party' && m.members.length === 2);
console.log('party armada', pa.members.map((m: any) => `${m.name} ${m.hp}/${m.maxHp}`));

// Alguien que ya tiene party no puede ser invitado por otro, y la party respeta el tope.
C.send({ t: 'party', a: 'invite', to: B.id });
await C.wait((m) => m.t === 'pnote' && m.err);

// Chat de party: lo oye Bob, no Cleo.
clear(B); clear(C);
A.send({ t: 'say', name: 'Alice', text: '/p hola equipo' });
const said = await B.wait((m) => m.t === 'say' && m.kind === 'party');
assert.equal(said.text, 'hola equipo');
await new Promise((r) => setTimeout(r, 200));
assert.ok(!C.inbox.some((m) => m.t === 'say'), 'el chat de party es privado');

// Mend: Alice cura a Bob (40/100): lo ven los dos; el monto sale del nivel de Alice (lvl 10 -> 66) y se topa en lo que le falta a Bob (60).
clear(A); clear(B);
A.send({ t: 'heal', to: B.id });
const h = await B.wait((m) => m.t === 'heal');
assert.equal(h.to, B.id);
assert.equal(h.amt, 60);
await A.wait((m) => m.t === 'heal');

// Curar a quien ya está lleno se rechaza y avisa para devolver el MP.
await new Promise((r) => setTimeout(r, 2200));
pos(B, 'Bob', 5, 100, 'wallet-B');
await new Promise((r) => setTimeout(r, 300));
clear(A);
A.send({ t: 'heal', to: B.id });
await A.wait((m) => m.t === 'mendno');

// Lejos no alcanza: Cleo no es de la party y Bob se aleja.
pos(B, 'Bob', 100, 20, 'wallet-B');
await new Promise((r) => setTimeout(r, 300));
clear(A);
A.send({ t: 'heal', to: B.id });
await A.wait((m) => m.t === 'mendno');

// Al irse uno, la party de dos se disuelve.
clear(A);
B.send({ t: 'party', a: 'leave' });
await A.wait((m) => m.t === 'party' && m.members.length === 0);

for (const b of [A, B, C]) b.ws.close();
console.log('OK');
process.exit(0);
