// Compras con MMRIA real. Flujo (patrón de la skill cripto-cobro-directo-wallet, adaptado a Solana):
//  1. /api/order: el servidor abre una orden con un monto, la tesorería y una cuenta de referencia única.
//  2. El jugador firma en su wallet una transferencia de MMRIA a la tesorería que incluye esa referencia.
//  3. /api/order/confirm: el servidor lee la transacción por RPC y comprueba que salió de la wallet del jugador, que
//     la tesorería recibió al menos el monto y que lleva la referencia. Recién ahí marca la orden pagada y entrega,
//     en un solo lote, y la firma queda reclamada (una transferencia paga una sola orden).
// El cliente nunca decide si pagó: solo avisa la firma. Sin TREASURY_ADDRESS no se cobra nada.
import { ITEMS } from '../data/items';
import { MMRIA_MINT, toBase58, toBaseUnits, type OrderTicket } from '../shared/solana';
import { addressBytes } from './auth';

export interface PayEnv {
  DB: D1Database;
  /** Dirección pública de la tesorería (wallet o multisig). Sin ella, las compras quedan apagadas. */
  TREASURY_ADDRESS?: string;
  /** RPC de Solana; por defecto el público (sirve para poco volumen, conviene uno propio). */
  SOLANA_RPC?: string;
}

const ORDER_TTL_MS = 30 * 60 * 1000;
const MAX_OPEN_ORDERS = 5;
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

export const paymentsEnabled = (env: PayEnv): boolean => !!env.TREASURY_ADDRESS && !!addressBytes(env.TREASURY_ADDRESS);

async function rpc<T>(env: PayEnv, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(env.SOLANA_RPC || DEFAULT_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

export type PayResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): { ok: false; status: number; error: string; message: string } => ({ ok: false, status, error, message });

export async function ownedItems(db: D1Database, address: string): Promise<string[]> {
  const { results } = await db.prepare('SELECT item_id FROM entitlements WHERE address = ?').bind(address).all<{ item_id: string }>();
  return results.map((r) => r.item_id);
}

export async function createOrder(env: PayEnv, address: string, itemId: string): Promise<PayResult<{ ticket: OrderTicket }>> {
  if (!paymentsEnabled(env)) return fail(503, 'payments_off', 'Payments with MMRIA are not open yet.');
  const def = ITEMS[itemId];
  if (!def || def.mmria === undefined) return fail(400, 'not_for_sale', 'That item is not sold for MMRIA.');
  if ((await ownedItems(env.DB, address)).includes(itemId)) return fail(409, 'owned', `You already own ${def.name}.`);
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE address = ? AND status = 'pending' AND created_at > ?").bind(address, Date.now() - ORDER_TTL_MS).first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_ORDERS) return fail(429, 'too_many', 'You have several unpaid orders open. Pay one or wait a few minutes.');

  let bh: { value: { blockhash: string; lastValidBlockHeight: number } };
  try {
    bh = await rpc(env, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  } catch {
    return fail(502, 'rpc', 'Could not reach Solana. Try again in a moment.');
  }
  const id = crypto.randomUUID();
  const reference = toBase58(crypto.getRandomValues(new Uint8Array(32)));
  const amount = toBaseUnits(def.mmria);
  await env.DB.prepare('INSERT INTO orders (id, address, item_id, amount, reference, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)').bind(id, address, itemId, amount, reference, 'pending', Date.now()).run();
  return { ok: true, ticket: { orderId: id, itemId, treasury: env.TREASURY_ADDRESS!, amount, reference, blockhash: bh.value.blockhash, lastValidBlockHeight: bh.value.lastValidBlockHeight } };
}

interface ParsedTx {
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  blockTime?: number | null;
  transaction: { message: { accountKeys: Array<{ pubkey: string; signer: boolean }> } };
}
interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

/** Cuánto cambió el saldo de MMRIA de `owner` en la transacción (positivo = recibió). */
function mmriaDelta(tx: ParsedTx, owner: string): bigint {
  const sum = (list: TokenBalance[] | undefined): bigint => (list ?? []).filter((b) => b.mint === MMRIA_MINT && b.owner === owner).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

export async function confirmOrder(env: PayEnv, address: string, orderId: string, signature: string): Promise<PayResult<{ status: 'paid' | 'waiting'; itemId: string }>> {
  if (!paymentsEnabled(env)) return fail(503, 'payments_off', 'Payments with MMRIA are not open yet.');
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return fail(400, 'bad_signature', 'That is not a transaction signature.');
  const order = await env.DB.prepare('SELECT id, address, item_id, amount, reference, status, created_at FROM orders WHERE id = ?').bind(orderId).first<{ id: string; address: string; item_id: string; amount: string; reference: string; status: string; created_at: number }>();
  if (!order || order.address !== address) return fail(404, 'no_order', 'Order not found.');
  if (order.status === 'paid') return { ok: true, status: 'paid', itemId: order.item_id };
  const used = await env.DB.prepare('SELECT id FROM orders WHERE signature = ?').bind(signature).first();
  if (used) return fail(409, 'used', 'That payment was already used for another order.');

  let tx: ParsedTx | null;
  try {
    tx = await rpc<ParsedTx | null>(env, 'getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  } catch {
    return fail(502, 'rpc', 'Could not reach Solana. Try again in a moment.');
  }
  // Todavía no llegó a "confirmed": el cliente vuelve a preguntar.
  if (!tx) return { ok: true, status: 'waiting', itemId: order.item_id };
  if (tx.meta?.err) return fail(400, 'tx_failed', 'The transaction failed on Solana, so nothing was charged. Try again.');

  const keys = tx.transaction.message.accountKeys;
  const treasury = env.TREASURY_ADDRESS!;
  const need = BigInt(order.amount);
  const signedByBuyer = keys.some((k) => k.pubkey === address && k.signer);
  const hasReference = keys.some((k) => k.pubkey === order.reference);
  const received = mmriaDelta(tx, treasury);
  const sent = -mmriaDelta(tx, address);
  if (!signedByBuyer || !hasReference || received < need || sent < need) {
    return fail(400, 'mismatch', 'That transaction does not match this order (wrong sender, amount or reference).');
  }

  // Entrega atómica: la orden pasa a pagada y se otorga el ítem en el mismo lote; si otro pedido ganó la carrera, no se entrega dos veces.
  const now = Date.now();
  const [paid] = await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'paid', signature = ?2, paid_at = ?3 WHERE id = ?1 AND status = 'pending'").bind(order.id, signature, now),
    env.DB.prepare('INSERT OR IGNORE INTO entitlements (address, item_id, order_id, created_at) SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1').bind(address, order.item_id, order.id, now),
  ]);
  if (paid.meta.changes !== 1) {
    const again = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(order.id).first<{ status: string }>();
    if (again?.status === 'paid') return { ok: true, status: 'paid', itemId: order.item_id };
    return fail(409, 'busy', 'Could not record the payment. Try again.');
  }
  return { ok: true, status: 'paid', itemId: order.item_id };
}
