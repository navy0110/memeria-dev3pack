// Prueba del pago automático de premios contra `wrangler dev --port 8799` con un RPC falso (:8801) y una pagadora de prueba.
//   pnpm exec wrangler d1 migrations apply memeria --local
//   pnpm exec tsx scripts/test-payout.ts setup          (crea .keys/test-payer.json y muestra su clave)
//   pnpm exec wrangler dev --port 8799 --var TREASURY_ADDRESS:<cualquiera> --var SOLANA_RPC:http://127.0.0.1:8801 --var "PAYER_KEY:$(cat .keys/test-payer.json)"
//   pnpm exec tsx scripts/test-payout.ts
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { getTransactionDecoder } from '@solana/kit';
import { newIdentity, b58 } from './auth-client';

const KEY = join(import.meta.dirname, '..', '.keys', 'test-payer.json');
if (process.argv[2] === 'setup') {
  if (!existsSync(KEY)) {
    const pair = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
    const priv = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).slice(-32);
    const pub = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
    writeFileSync(KEY, JSON.stringify(Array.from(new Uint8Array([...priv, ...pub]))), { mode: 0o600 });
  }
  console.log('listo:', KEY);
  process.exit(0);
}

// Estado del RPC falso, que el test cambia para simular cada escenario.
const rpcState = { sol: 1, mmria: 1_000_000_000n, confirm: true, height: 100, sent: [] as string[], hidden: new Set<string>() };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { method, params } = JSON.parse(body);
    let result: unknown = null;
    if (method === 'getBalance') result = { value: Math.round(rpcState.sol * 1e9) };
    else if (method === 'getTokenAccountBalance') result = { value: { amount: String(rpcState.mmria) } };
    // El blockhash cambia en cada pedido: si no, el reintento sale idéntico (misma firma) al original.
    else if (method === 'getLatestBlockhash') result = { value: { blockhash: b58(webcrypto.getRandomValues(new Uint8Array(32))), lastValidBlockHeight: rpcState.height + 150 } };
    else if (method === 'getBlockHeight') result = rpcState.height;
    else if (method === 'sendTransaction') {
      const tx = getTransactionDecoder().decode(Buffer.from(params[0], 'base64'));
      const sig = b58(Object.values(tx.signatures).find((s) => s)!);
      rpcState.sent.push(sig);
      result = sig;
    } else if (method === 'getSignatureStatuses') {
      result = { value: (params[0] as string[]).map((s) => (rpcState.confirm && rpcState.sent.includes(s) && !rpcState.hidden.has(s) ? { confirmationStatus: 'confirmed', err: null } : null)) };
    }
    res.setHeader('content-type', 'application/json');
    res.setHeader('connection', 'close'); // sin keep-alive: workerd no debe reusar un socket que Node ya cerró
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  });
}).listen(8801);

const d1 = (sql: string): string => execSync(`pnpm exec wrangler d1 execute memeria --local --json --command "${sql}"`, { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' });
const giveTokens = (address: string, n: number): void => void d1(`INSERT INTO balances (address, tokens, updated_at) VALUES ('${address}', ${n}, ${Date.now()}) ON CONFLICT(address) DO UPDATE SET tokens = ${n}`);
const row = (address: string): { status: string; tx: string | null; attempts: number; note: string | null } =>
  JSON.parse(d1(`SELECT status, tx, attempts, note FROM redemptions WHERE address = '${address}' ORDER BY id DESC LIMIT 1`))[0].results[0];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** Espera (hasta 25 s) a que el canje de esa wallet llegue a `status`: el reintento corre en segundo plano en el Worker. */
const waitFor = async (address: string, status: string): Promise<void> => {
  for (let i = 0; i < 25 && row(address).status !== status; i++) await sleep(1000);
};
const redeem = (id: Awaited<ReturnType<typeof newIdentity>>) => id.call('/api/redeem', { method: 'POST', body: '{}' });

try {
  // Hace falta un día "limpio" para el tope global.
  d1('DELETE FROM redemptions');

  // 1. Camino feliz: se paga solo, queda la firma y no queda nada pendiente.
  const a = await newIdentity();
  giveTokens(a.address, 200);
  const r1 = await redeem(a);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.payout, 'paid', JSON.stringify(r1.body));
  assert.equal(rpcState.sent.length, 1, 'se envió una sola transacción');
  assert.equal(r1.body.tx, rpcState.sent[0], 'la firma que devuelve es la de la transacción enviada');
  assert.equal(row(a.address).status, 'paid');
  assert.equal((await a.call('/api/me')).body.redeeming, null, 'nada pendiente');

  // 2. Sin confirmar: queda 'sending', no se manda otra vez, y cuando confirma pasa a paid sin duplicar.
  const b = await newIdentity();
  giveTokens(b.address, 300);
  rpcState.confirm = false;
  const r2 = await redeem(b);
  assert.equal(r2.body.payout, 'sending', JSON.stringify(r2.body));
  assert.equal(rpcState.sent.length, 2);
  assert.equal((await redeem(b)).status, 400, 'con un canje en curso no se pide otro');
  rpcState.confirm = true;
  await b.call('/api/me');
  await waitFor(b.address, 'paid');
  assert.equal(row(b.address).status, 'paid', 'al entrar se reconcilia con la cadena');
  assert.equal(rpcState.sent.length, 2, 'no se pagó dos veces');

  // 3. Vencida sin rastro: vuelve a pending y se manda otra transacción.
  const c = await newIdentity();
  giveTokens(c.address, 100);
  rpcState.confirm = false;
  const r3 = await redeem(c);
  assert.equal(r3.body.payout, 'sending');
  assert.equal(rpcState.sent.length, 3);
  rpcState.hidden.add(rpcState.sent[2]); // la primera nunca llegó a la cadena
  rpcState.height = 1000; // y su blockhash ya no puede entrar
  rpcState.confirm = true;
  await c.call('/api/me');
  await waitFor(c.address, 'paid');
  assert.equal(row(c.address).status, 'paid', 'vencida la primera, se rearmó y se pagó con otra transacción');
  assert.equal(rpcState.sent.length, 4, 'una sola transacción nueva tras vencer la primera');

  // 4. Pagadora sin saldo: queda en cola, no sale nada; al reponer, se paga sola.
  const d = await newIdentity();
  giveTokens(d.address, 100);
  rpcState.sol = 0.001;
  const r4 = await redeem(d);
  assert.equal(r4.body.payout, 'queued');
  assert.equal(row(d.address).note, 'payer_low_sol');
  assert.equal(rpcState.sent.length, 4, 'sin saldo no se envía');
  rpcState.sol = 1;
  await d.call('/api/me');
  await waitFor(d.address, 'paid');
  assert.equal(row(d.address).status, 'paid', 'repuesta la pagadora, el canje se completa');

  // 5. Tope global del día: se rechaza y las fichas no se descuentan.
  const e = await newIdentity();
  giveTokens(e.address, 29_500); // 295 MMRIA; con los 7 ya pedidos hoy suma 302 y pasa de 300
  const r5 = await redeem(e);
  assert.equal(r5.status, 400);
  assert.equal(r5.body.error, 'paused');
  assert.equal((await e.call('/api/me')).body.tokens, 29_500, 'las fichas siguen en el saldo');
  console.log('OK payout');
} finally {
  server.close();
}
