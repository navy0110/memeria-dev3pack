// Tesorería del juego por terminal, sin Phantom ni contraseñas.
//
//   pnpm treasury init     crea las dos wallets en .keys/ (si ya existen no las toca) y muestra las direcciones
//   pnpm treasury status   saldos de SOL y MMRIA de cada una (RPC de mainnet, o SOLANA_RPC si está definido)
//   pnpm treasury wire     escribe TREASURY_ADDRESS en wrangler.jsonc y sube la clave pagadora como secret PAYER_KEY
//
// TESORERÍA: recibe las compras de los jugadores. Su clave casi no se usa.
// PAGADORA: hot wallet con poco saldo; el Worker la usa para pagar premios. Si se filtra, se pierde solo su saldo.
// Las claves se guardan en .keys/ (fuera de git, permisos 600) en el formato de la CLI de Solana: un arreglo JSON de
// 64 bytes. Hacé una copia offline de .keys/*.json: sin ella los fondos no se recuperan.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { MMRIA_MINT, MMRIA_DECIMALS } from '../src/shared/solana';

const ROOT = join(import.meta.dirname, '..');
const KEYS = join(ROOT, '.keys');
const FILES = { treasury: join(KEYS, 'treasury.json'), payer: join(KEYS, 'payer-game.json') } as const;
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

async function generate(path: string): Promise<void> {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).slice(-32);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  writeFileSync(path, JSON.stringify(Array.from(new Uint8Array([...priv, ...pub]))), { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function address(path: string): Promise<string> {
  const bytes = new Uint8Array(JSON.parse(readFileSync(path, 'utf8')) as number[]);
  return (await createKeyPairSignerFromBytes(bytes)).address;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error || j.result === undefined) throw new Error(j.error?.message ?? `RPC ${res.status}`);
  return j.result;
}

async function init(): Promise<void> {
  mkdirSync(KEYS, { recursive: true, mode: 0o700 });
  for (const [name, path] of Object.entries(FILES)) {
    const fresh = !existsSync(path);
    if (fresh) await generate(path);
    console.log(`${name === 'treasury' ? 'TESORERÍA' : 'PAGADORA '}  ${await address(path)}  ${fresh ? '(nueva)' : '(ya existía, no se tocó)'}`);
  }
  console.log(`
Claves en ${KEYS} (permisos 600, fuera de git).
Hacé ahora una copia OFFLINE de treasury.json y payer-game.json (pendrive o papel); si se pierden, se pierden los fondos.

Siguiente:
  1. Desde tu wallet de dev, mandá a la PAGADORA un lote chico: ~0,1 SOL y ~5.000 MMRIA. A la TESORERÍA no hace falta mandar nada.
  2. pnpm treasury status    (para ver que llegó)
  3. pnpm treasury wire      (carga la dirección y la clave en Cloudflare)`);
}

async function status(): Promise<void> {
  for (const [name, path] of Object.entries(FILES)) {
    if (!existsSync(path)) { console.log(`${name}: falta, corré "pnpm treasury init"`); continue; }
    const addr = await address(path);
    const sol = (await rpc<{ value: number }>('getBalance', [addr])).value / 1e9;
    const accts = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmountString: string } } } } } }[] }>(
      'getTokenAccountsByOwner', [addr, { mint: MMRIA_MINT }, { encoding: 'jsonParsed' }]);
    const mmria = accts.value.reduce((n, a) => n + Number(a.account.data.parsed.info.tokenAmount.uiAmountString), 0);
    console.log(`${name === 'treasury' ? 'TESORERÍA' : 'PAGADORA '}  ${addr}\n           ${sol.toFixed(4)} SOL   ${mmria.toLocaleString('en-US', { maximumFractionDigits: MMRIA_DECIMALS })} MMRIA`);
  }
}

async function wire(): Promise<void> {
  if (!existsSync(FILES.treasury) || !existsSync(FILES.payer)) throw new Error('Faltan las claves: corré "pnpm treasury init" primero.');
  const treasury = await address(FILES.treasury);
  const cfgPath = join(ROOT, 'wrangler.jsonc');
  let cfg = readFileSync(cfgPath, 'utf8');
  if (/"TREASURY_ADDRESS"\s*:/.test(cfg)) {
    cfg = cfg.replace(/("TREASURY_ADDRESS"\s*:\s*)"[^"]*"/, `$1"${treasury}"`);
  } else if (/"vars"\s*:\s*\{/.test(cfg)) {
    cfg = cfg.replace(/("vars"\s*:\s*\{)/, `$1 "TREASURY_ADDRESS": "${treasury}",`);
  } else {
    cfg = cfg.replace(/("compatibility_date"[^\n]*\n)/, `$1  "vars": { "TREASURY_ADDRESS": "${treasury}" },\n`);
  }
  writeFileSync(cfgPath, cfg);
  console.log(`wrangler.jsonc: TREASURY_ADDRESS = ${treasury}`);
  // La clave pagadora entra por stdin: no queda en el historial de la terminal ni en la lista de procesos.
  const r = spawnSync('pnpm', ['exec', 'wrangler', 'secret', 'put', 'PAYER_KEY'], { cwd: ROOT, input: readFileSync(FILES.payer, 'utf8'), stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error('No se pudo subir PAYER_KEY (¿wrangler login?).');
  console.log('PAYER_KEY subida como secret. Falta desplegar (pnpm run deploy) para que tome TREASURY_ADDRESS.');
}

const cmd = process.argv[2];
const run = { init, status, wire }[cmd as 'init'];
if (!run) { console.log('Uso: pnpm treasury init | status | wire'); process.exit(1); }
run().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
