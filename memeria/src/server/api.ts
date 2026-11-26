// API del juego sobre D1: /api/auth/* (ingreso con wallet) y /api/me, /api/profile, /api/save, /api/alias/check
// (perfil y guardado de quien está logueado). Todo se reconoce por el token que sale de la firma de la wallet.
import { checkAlias } from '../shared/alias';
import { makeChallenge, verifyChallenge, verifyToken, addressBytes, guestToken, isGuest } from './auth';
import { balanceOf, pendingRedemption, requestRedeem } from './tokens';
import { settlePendingFor, settleRedemption, type PayoutEnv } from './payout';
import { confirmOrder, createOrder, ownedItems, paymentsEnabled, type PayEnv } from './payments';

export interface ApiEnv extends PayEnv, PayoutEnv {
  DB: D1Database;
  AUTH_SECRET: string;
}

const CLASSES = new Set(['pepe', 'shiba', 'doge', 'popcat', 'wif']);
const MAX_BODY = 64 * 1024;

const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const readJson = async (req: Request): Promise<Record<string, unknown> | null> => {
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Un guardado válido tiene la forma de SaveData; el contenido fino lo sigue validando el cliente al restaurar. */
function validSave(d: unknown): boolean {
  const s = d as Record<string, unknown> | null;
  return (
    !!s &&
    s.v === 1 &&
    isNum(s.level) &&
    isNum(s.xp) &&
    isNum(s.coins) &&
    isNum(s.kills) &&
    Array.isArray(s.inventory) &&
    s.inventory.length <= 200 &&
    Array.isArray(s.quests) &&
    s.quests.length <= 100
  );
}

export async function handleApi(req: Request, env: ApiEnv, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const url = new URL(req.url);
  if (!env.AUTH_SECRET) return json({ error: 'server_misconfigured' }, 503);
  // Solo desde el propio sitio.
  const origin = req.headers.get('Origin');
  if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);
  const path = url.pathname;

  if (path === '/api/auth/challenge' && req.method === 'POST') {
    const b = await readJson(req);
    const addr = typeof b?.address === 'string' ? b.address : '';
    if (!addressBytes(addr)) return json({ error: 'bad_address' }, 400);
    return json(await makeChallenge(env.AUTH_SECRET, url.host, addr));
  }
  if (path === '/api/auth/verify' && req.method === 'POST') {
    const b = await readJson(req);
    if (typeof b?.address !== 'string' || typeof b.message !== 'string' || typeof b.mac !== 'string' || typeof b.signature !== 'string') return json({ error: 'bad_request' }, 400);
    const token = await verifyChallenge(env.AUTH_SECRET, b.address, b.message, b.mac, b.signature);
    return token ? json({ token }) : json({ error: 'invalid_signature' }, 401);
  }

  // Early bird: entra sin wallet. El navegador manda un secreto al azar y recibe un token de invitado.
  if (path === '/api/auth/guest' && req.method === 'POST') {
    const b = await readJson(req);
    if (typeof b?.id !== 'string' || !/^[0-9a-f-]{16,64}$/.test(b.id)) return json({ error: 'bad_request' }, 400);
    return json({ token: await guestToken(env.AUTH_SECRET, b.id) });
  }

  const bearer = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  const address = await verifyToken(env.AUTH_SECRET, bearer);
  if (!address) return json({ error: 'unauthorized' }, 401);

  if (path === '/api/me' && req.method === 'GET') {
    // Canjes que quedaron a medias (red caída, pagadora sin saldo): se reintentan al entrar, sin hacer esperar la respuesta.
    if (!isGuest(address)) ctx?.waitUntil(settlePendingFor(env, address));
    const profile = await env.DB.prepare('SELECT class_id AS classId, skin, alias FROM players WHERE address = ?').bind(address).first<{ classId: string; skin: number; alias: string | null }>();
    const save = await env.DB.prepare('SELECT data FROM saves WHERE address = ?').bind(address).first<{ data: string }>();
    return json({
      address,
      profile: profile ? { classId: profile.classId, skin: profile.skin, alias: profile.alias ?? undefined } : null,
      save: save ? JSON.parse(save.data) : null,
      tokens: await balanceOf(env.DB, address),
      redeeming: await pendingRedemption(env.DB, address),
      // Compras con MMRIA: si están abiertas y qué ítems ya compró esta wallet (se le entregan al entrar).
      payments: paymentsEnabled(env) && !isGuest(address),
      owned: await ownedItems(env.DB, address),
    });
  }

  // Fichas canjeables y compras con MMRIA piden una wallet.
  if (isGuest(address) && (path.startsWith('/api/order') || path === '/api/redeem')) return json({ error: 'wallet_required', message: 'Connect a wallet to do this.' }, 403);

  if (path === '/api/order' && req.method === 'POST') {
    const b = await readJson(req);
    const r = await createOrder(env, address, typeof b?.itemId === 'string' ? b.itemId : '');
    return r.ok ? json(r.ticket) : json(r, r.status);
  }
  if (path === '/api/order/confirm' && req.method === 'POST') {
    const b = await readJson(req);
    if (typeof b?.orderId !== 'string' || typeof b.signature !== 'string') return json({ error: 'bad_request' }, 400);
    const r = await confirmOrder(env, address, b.orderId, b.signature);
    return r.ok ? json(r) : json(r, r.status);
  }

  if (path === '/api/redeem' && req.method === 'POST') {
    const r = await requestRedeem(env.DB, address);
    if (!r.ok) return json(r, r.error === 'busy' ? 409 : 400);
    // Con pagadora configurada se envía ya. Si no sale a la primera, queda anotado y se reintenta solo.
    const paid = await settleRedemption(env, r.id);
    return json({ ...r, payout: paid.status, tx: paid.tx });
  }

  if (path === '/api/alias/check' && req.method === 'GET') {
    const r = checkAlias(url.searchParams.get('name') ?? '');
    if (!r.ok) return json({ ok: false, error: r.error });
    const row = await env.DB.prepare('SELECT address FROM players WHERE alias_lower = ?').bind(r.alias.toLowerCase()).first<{ address: string }>();
    return json(row && row.address !== address ? { ok: false, error: 'That name is taken.' } : { ok: true, alias: r.alias });
  }

  if (path === '/api/profile' && req.method === 'PUT') {
    const b = await readJson(req);
    if (!b || typeof b.classId !== 'string' || !CLASSES.has(b.classId) || !Number.isInteger(b.skin) || (b.skin as number) < 0 || (b.skin as number) > 3) return json({ error: 'bad_request' }, 400);
    let alias: string | null = null;
    if (typeof b.alias === 'string' && b.alias.trim()) {
      const r = checkAlias(b.alias);
      if (!r.ok) return json({ error: 'bad_alias', message: r.error }, 400);
      alias = r.alias;
    }
    const now = Date.now();
    try {
      await env.DB.prepare(
        `INSERT INTO players (address, class_id, skin, alias, alias_lower, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(address) DO UPDATE SET class_id = excluded.class_id, skin = excluded.skin, alias = excluded.alias, alias_lower = excluded.alias_lower, updated_at = excluded.updated_at`,
      )
        .bind(address, b.classId, b.skin, alias, alias?.toLowerCase() ?? null, now)
        .run();
    } catch (e) {
      if (String(e).includes('UNIQUE')) return json({ error: 'alias_taken', message: 'That name is taken.' }, 409);
      throw e;
    }
    return json({ ok: true, alias: alias ?? undefined });
  }

  if (path === '/api/save' && req.method === 'PUT') {
    const b = await readJson(req);
    if (!b || !validSave(b.data)) return json({ error: 'bad_save' }, 400);
    await env.DB.prepare('INSERT INTO saves (address, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(address) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .bind(address, JSON.stringify(b.data), Date.now())
      .run();
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}
