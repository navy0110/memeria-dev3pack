// Prueba del ingreso con wallet, el perfil y el guardado contra `wrangler dev --port 8799`.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { HTTP, newIdentity, rawPost, b58 } from './auth-client';

const WS = HTTP.replace('http', 'ws') + '/ws';
const wsStatus = (url: string): Promise<string> =>
  new Promise((res) => {
    const ws = new WebSocket(url);
    ws.addEventListener('message', (e) => {
      if (JSON.parse(String(e.data)).t === 'hello') { ws.close(); res('open'); }
    });
    ws.addEventListener('error', () => res('rejected'));
    ws.addEventListener('close', () => res('closed'));
  });

// 1. Sin token, o con uno falso, no se entra al mundo ni a la API.
assert.equal(await wsStatus(WS), 'rejected', 'ws sin token');
assert.equal(await wsStatus(WS + '?t=basura.1.2'), 'rejected', 'ws con token falso');
assert.equal((await fetch(HTTP + '/api/me')).status, 401, 'api sin token');

// 2. Firma ajena: otra clave firma el desafío de una dirección que no es suya.
const victim = await newIdentity();
const forger = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
const ch = await rawPost('/api/auth/challenge', { address: victim.address });
const bad = new Uint8Array(await webcrypto.subtle.sign('Ed25519', forger.privateKey, new TextEncoder().encode(ch.body.message)));
const forged = await rawPost('/api/auth/verify', { address: victim.address, message: ch.body.message, mac: ch.body.mac, signature: Buffer.from(bad).toString('base64') });
assert.equal(forged.status, 401, 'firma de otra clave rechazada');

// 3. Mensaje alterado (otra dirección en el texto) con el sello original: rechazado.
const other = b58(new Uint8Array(32).fill(7));
const tampered = await rawPost('/api/auth/verify', { address: other, message: ch.body.message.replace(victim.address, other), mac: ch.body.mac, signature: Buffer.from(bad).toString('base64') });
assert.equal(tampered.status, 401, 'mensaje alterado rechazado');

// 4. Perfil: ingresa, crea, lee, y el nombre es único sin distinguir mayúsculas.
const a = await newIdentity();
const b = await newIdentity();
let me = await a.call('/api/me');
assert.equal(me.status, 200); assert.equal(me.body.profile, null);
const put = (id: typeof a, alias: string | null, cls = 'shiba') => id.call('/api/profile', { method: 'PUT', body: JSON.stringify({ classId: cls, skin: 1, alias }) });
assert.equal((await put(a, 'Nacho')).status, 200);
assert.equal((await put(b, 'nacho')).status, 409, 'nombre repetido (otra caja)');
assert.equal((await b.call('/api/alias/check?name=NACHO')).body.ok, false);
assert.equal((await put(a, 'Nacho')).status, 200, 'el dueño puede guardar su propio nombre');
assert.equal((await put(b, 'admin')).status, 400, 'nombre reservado');
assert.equal((await put(b, null)).status, 200, 'sin nombre vale');
assert.equal((await put(a, 'x', 'noexiste')).status, 400, 'clase inválida');
me = await a.call('/api/me');
assert.deepEqual(me.body.profile, { classId: 'shiba', skin: 1, alias: 'Nacho' });

// 5. Guardado: ida y vuelta, y se rechaza lo que no tiene forma de guardado.
const save = { v: 1, classId: 'shiba', level: 4, xp: 10, coins: 33, kills: 5, inventory: [], quests: [] };
assert.equal((await a.call('/api/save', { method: 'PUT', body: JSON.stringify({ data: save }) })).status, 200);
assert.equal((await a.call('/api/save', { method: 'PUT', body: JSON.stringify({ data: { v: 1, level: 'x' } }) })).status, 400);
assert.deepEqual((await a.call('/api/me')).body.save, save);
assert.equal((await b.call('/api/me')).body.save, null, 'cada wallet ve solo lo suyo');

// 6. Con token válido el mundo abre, y el nombre que ven los demás sale del servidor.
assert.equal(await wsStatus(WS + '?t=' + encodeURIComponent(a.token)), 'open');
console.log('OK auth');
