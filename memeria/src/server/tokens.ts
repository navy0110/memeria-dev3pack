// Fichas MMRIA en D1. El cliente no puede darse fichas: las tira el servidor al morir un mob (world.ts), se
// acreditan acá al recoger la bolsa y solo se descuentan con un pedido de canje (que queda 'pending' hasta pagarse).
import { TOKEN } from '../shared/rules';

const today = (): string => new Date().toISOString().slice(0, 10);

export async function balanceOf(db: D1Database, address: string): Promise<number> {
  const row = await db.prepare('SELECT tokens FROM balances WHERE address = ?').bind(address).first<{ tokens: number }>();
  return row?.tokens ?? 0;
}

/** Suma fichas respetando el tope diario. Devuelve cuántas entraron de verdad y el saldo resultante. */
export async function creditTokens(db: D1Database, address: string, n: number): Promise<{ credited: number; balance: number }> {
  const want = Math.max(0, Math.floor(n));
  if (want === 0) return { credited: 0, balance: await balanceOf(db, address) };
  const day = today();
  const before = await db.prepare('SELECT earned_day, earned_today FROM balances WHERE address = ?').bind(address).first<{ earned_day: string | null; earned_today: number }>();
  const earned = before?.earned_day === day ? before.earned_today : 0;
  const credited = Math.max(0, Math.min(want, TOKEN.dailyCap - earned));
  if (credited === 0) return { credited: 0, balance: await balanceOf(db, address) };
  await db
    .prepare(
      `INSERT INTO balances (address, tokens, earned_day, earned_today, updated_at) VALUES (?1, ?2, ?3, ?2, ?4)
       ON CONFLICT(address) DO UPDATE SET tokens = tokens + ?2,
         earned_today = (CASE WHEN earned_day = ?3 THEN earned_today ELSE 0 END) + ?2, earned_day = ?3, updated_at = ?4`,
    )
    .bind(address, credited, day, Date.now())
    .run();
  return { credited, balance: await balanceOf(db, address) };
}

export type RedeemResult = { ok: true; id: number; tokens: number; mmria: number; balance: number } | { ok: false; error: string; message: string };

/** Pide canjear todo el saldo. Las fichas se descuentan ya; el MMRIA se envía aparte (queda anotado como pendiente). */
/** MMRIA ya pedidos hoy (UTC) entre todas las wallets, en cualquier estado. */
async function mmriaRequestedToday(db: D1Database): Promise<number> {
  const start = new Date(today() + 'T00:00:00Z').getTime();
  const row = await db.prepare('SELECT COALESCE(SUM(mmria), 0) AS n FROM redemptions WHERE created_at >= ?').bind(start).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function requestRedeem(db: D1Database, address: string): Promise<RedeemResult> {
  const pending = await db.prepare("SELECT COUNT(*) AS n FROM redemptions WHERE address = ? AND status IN ('pending', 'sending')").bind(address).first<{ n: number }>();
  if ((pending?.n ?? 0) > 0) return { ok: false, error: 'pending', message: 'You already have a redemption waiting to be paid. Wait for it to arrive before asking for another.' };
  const have = await balanceOf(db, address);
  if (have < TOKEN.redeemMin) return { ok: false, error: 'too_few', message: `You need at least ${TOKEN.redeemMin} MMRIA tokens to redeem (you have ${have}).` };
  const mmria = have / TOKEN.perMmria;
  // Tope global: si hoy ya se pidió demasiado, no se descuentan las fichas (siguen en el saldo para mañana).
  if ((await mmriaRequestedToday(db)) + mmria > TOKEN.globalDailyMmria) return { ok: false, error: 'paused', message: 'Rewards are paused for today: the daily pool ran out. Your tokens are safe, try again tomorrow.' };
  const now = Date.now();
  // El descuento y el pedido van juntos; si otro pedido ganó la carrera, el UPDATE no toca ninguna fila y no se registra nada.
  const [spent, logged] = await db.batch([
    db.prepare('UPDATE balances SET tokens = tokens - ?2, updated_at = ?3 WHERE address = ?1 AND tokens >= ?2').bind(address, have, now),
    db.prepare("INSERT INTO redemptions (address, tokens, mmria, status, created_at) SELECT ?1, ?2, ?3, 'pending', ?4 WHERE changes() = 1").bind(address, have, mmria, now),
  ]);
  if (spent.meta.changes !== 1 || logged.meta.changes !== 1) return { ok: false, error: 'busy', message: 'Your balance changed while redeeming. Try again.' };
  return { ok: true, id: logged.meta.last_row_id, tokens: have, mmria, balance: await balanceOf(db, address) };
}

export async function pendingRedemption(db: D1Database, address: string): Promise<{ tokens: number; mmria: number } | null> {
  return db.prepare("SELECT tokens, mmria FROM redemptions WHERE address = ? AND status IN ('pending', 'sending') ORDER BY id DESC LIMIT 1").bind(address).first<{ tokens: number; mmria: number }>();
}
