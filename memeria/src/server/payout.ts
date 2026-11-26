// Pago automático de premios: al canjear fichas, la wallet PAGADORA (hot wallet con poco saldo, clave en el secret
// PAYER_KEY) envía el MMRIA al jugador. Estados de un canje: pending -> sending -> paid.
//
// Lo delicado es no pagar dos veces. Por eso:
//  - el canje se "reclama" con un UPDATE condicional (pending -> sending): dos pedidos a la vez no lo envían dos veces;
//  - antes de mandar la transacción se anota su firma y hasta qué altura de bloque vale (last_valid);
//  - si algo se corta, el canje queda 'sending' y se reconcilia mirando la cadena: confirmada -> paid; fallida, o
//    vencida sin rastro -> vuelve a pending y recién ahí se arma otra transacción.
// Sin PAYER_KEY nada de esto corre y los canjes quedan pendientes para pagarlos a mano, como antes.
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type KeyPairSigner,
} from '@solana/kit';
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync, getTransferCheckedInstruction } from '@solana-program/token';
import { TOKEN } from '../shared/rules';
import { MMRIA_DECIMALS, MMRIA_MINT, TOKEN_2022_PROGRAM } from '../shared/solana';
import type { PayEnv } from './payments';

export interface PayoutEnv extends PayEnv {
  /** Clave de la pagadora: arreglo JSON de 64 bytes (formato de la CLI de Solana). `wrangler secret put PAYER_KEY`. */
  PAYER_KEY?: string;
}

export type SettleStatus = 'paid' | 'sending' | 'queued';
export interface Settled {
  status: SettleStatus;
  tx?: string;
}

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
const MAX_ATTEMPTS = 8;
const POLL_TRIES = 10;
const POLL_MS = 1500;

export const payoutsEnabled = (env: PayoutEnv): boolean => !!env.PAYER_KEY;

/** El RPC respondió con un error (la transacción no se aceptó), a diferencia de no poder hablar con él. */
class RpcError extends Error {}

async function rpc<T>(env: PayoutEnv, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(env.SOLANA_RPC || DEFAULT_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new RpcError(body.error.message);
  return body.result as T;
}

let cachedSigner: { key: string; signer: KeyPairSigner } | null = null;
async function payerSigner(env: PayoutEnv): Promise<KeyPairSigner> {
  const hit = cachedSigner;
  if (hit && hit.key === env.PAYER_KEY) return hit.signer;
  const bytes = new Uint8Array(JSON.parse(env.PAYER_KEY!) as number[]);
  const signer = await createKeyPairSignerFromBytes(bytes);
  cachedSigner = { key: env.PAYER_KEY!, signer };
  return signer;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Row {
  id: number;
  address: string;
  mmria: number;
  status: string;
  tx: string | null;
  last_valid: number | null;
  attempts: number;
}

interface SigStatus {
  confirmationStatus?: string;
  err: unknown;
}

async function sigStatus(env: PayoutEnv, sig: string): Promise<SigStatus | null> {
  const r = await rpc<{ value: Array<SigStatus | null> }>(env, 'getSignatureStatuses', [[sig], { searchTransactionHistory: true }]);
  return r.value[0] ?? null;
}

const isDone = (s: SigStatus): boolean => s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized';

async function markPaid(db: D1Database, id: number, tx: string): Promise<void> {
  await db.prepare("UPDATE redemptions SET status = 'paid', tx = ?2, paid_at = ?3, note = NULL WHERE id = ?1 AND status = 'sending'").bind(id, tx, Date.now()).run();
}

async function backToPending(db: D1Database, id: number, note: string): Promise<void> {
  await db.prepare("UPDATE redemptions SET status = 'pending', tx = NULL, last_valid = NULL, note = ?2 WHERE id = ?1 AND status = 'sending'").bind(id, note).run();
}

/** Mira en la cadena un canje que quedó 'sending'. */
async function reconcile(env: PayoutEnv, row: Row): Promise<Settled> {
  if (!row.tx) {
    await backToPending(env.DB, row.id, 'no_tx');
    return { status: 'queued' };
  }
  const s = await sigStatus(env, row.tx);
  if (s) {
    if (s.err) {
      await backToPending(env.DB, row.id, 'tx_failed');
      return { status: 'queued' };
    }
    if (isDone(s)) {
      await markPaid(env.DB, row.id, row.tx);
      return { status: 'paid', tx: row.tx };
    }
    return { status: 'sending', tx: row.tx };
  }
  // Sin rastro: si el blockhash ya venció la transacción no puede entrar nunca más y es seguro rearmar otra.
  const height = await rpc<number>(env, 'getBlockHeight', [{ commitment: 'confirmed' }]);
  if (row.last_valid !== null && height > row.last_valid) {
    await backToPending(env.DB, row.id, 'expired');
    return { status: 'queued' };
  }
  return { status: 'sending', tx: row.tx };
}

/** ¿Tiene la pagadora con qué pagar? SOL para comisiones y cuentas nuevas, y el MMRIA del canje. */
async function payerCanPay(env: PayoutEnv, payer: Address, ata: Address, baseUnits: bigint): Promise<string | null> {
  const sol = (await rpc<{ value: number }>(env, 'getBalance', [payer, { commitment: 'confirmed' }])).value / 1e9;
  if (sol < TOKEN.payerMinSol) return 'payer_low_sol';
  let have = 0n;
  try {
    have = BigInt((await rpc<{ value: { amount: string } }>(env, 'getTokenAccountBalance', [ata, { commitment: 'confirmed' }])).value.amount);
  } catch (e) {
    if (!(e instanceof RpcError)) throw e; // la cuenta no existe: saldo 0
  }
  return have < baseUnits ? 'payer_low_mmria' : null;
}

/** Arma, firma y envía el pago de un canje 'pending'. Devuelve en qué quedó. */
async function send(env: PayoutEnv, row: Row): Promise<Settled> {
  const payer = await payerSigner(env);
  const mint = address(MMRIA_MINT);
  const tokenProgram = address(TOKEN_2022_PROGRAM);
  const base = BigInt(Math.round(row.mmria * 10 ** MMRIA_DECIMALS));
  const [source] = await findAssociatedTokenPda({ owner: payer.address, mint, tokenProgram });
  const [dest] = await findAssociatedTokenPda({ owner: address(row.address), mint, tokenProgram });

  const lack = await payerCanPay(env, payer.address, source, base);
  if (lack) {
    await backToPending(env.DB, row.id, lack);
    return { status: 'queued' };
  }

  const bh = (await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>(env, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const createAta = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer, owner: address(row.address), mint, tokenProgram });
  const transfer = getTransferCheckedInstruction({ source, mint, destination: dest, authority: payer, amount: base, decimals: MMRIA_DECIMALS }, { programAddress: tokenProgram });
  const signed = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: bh.blockhash as never, lastValidBlockHeight: BigInt(bh.lastValidBlockHeight) }, m),
      (m) => appendTransactionMessageInstructions([getSetComputeUnitLimitInstruction({ units: 100_000 }), getSetComputeUnitPriceInstruction({ microLamports: 20_000 }), createAta, transfer], m),
    ),
  );
  const sig = getSignatureFromTransaction(signed);
  // La firma se anota ANTES de enviar: si el Worker se corta a mitad, se sabe qué buscar en la cadena.
  await env.DB.prepare("UPDATE redemptions SET tx = ?2, last_valid = ?3 WHERE id = ?1 AND status = 'sending'").bind(row.id, sig, bh.lastValidBlockHeight).run();
  try {
    await rpc<string>(env, 'sendTransaction', [getBase64EncodedWireTransaction(signed), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 }]);
  } catch (e) {
    // El RPC la rechazó (la simulación falló): no salió nada, se puede reintentar. Si fue un corte de red no se sabe:
    // queda 'sending' y la reconciliación lo resuelve.
    if (e instanceof RpcError) {
      await backToPending(env.DB, row.id, `rejected: ${e.message}`.slice(0, 200));
      return { status: 'queued' };
    }
    return { status: 'sending', tx: sig };
  }
  for (let i = 0; i < POLL_TRIES; i++) {
    await sleep(POLL_MS);
    let s: SigStatus | null = null;
    try {
      s = await sigStatus(env, sig);
    } catch {
      continue;
    }
    if (s?.err) {
      await backToPending(env.DB, row.id, 'tx_failed');
      return { status: 'queued' };
    }
    if (s && isDone(s)) {
      await markPaid(env.DB, row.id, sig);
      return { status: 'paid', tx: sig };
    }
  }
  return { status: 'sending', tx: sig };
}

/** Lleva un canje lo más lejos posible: reconcilia si quedó a medias, o lo paga si está pendiente. Nunca lanza. */
export async function settleRedemption(env: PayoutEnv, id: number): Promise<Settled> {
  if (!payoutsEnabled(env)) return { status: 'queued' };
  try {
    const row = await env.DB.prepare('SELECT id, address, mmria, status, tx, last_valid, attempts FROM redemptions WHERE id = ?').bind(id).first<Row>();
    if (!row) return { status: 'queued' };
    if (row.status === 'paid') return { status: 'paid', tx: row.tx ?? undefined };
    if (row.status === 'sending') {
      const r = await reconcile(env, row);
      // Si la transacción venció o falló, el canje volvió a pending: se rearma y se paga en esta misma pasada.
      if (r.status !== 'queued') return r;
      const again = await env.DB.prepare('SELECT id, address, mmria, status, tx, last_valid, attempts FROM redemptions WHERE id = ?').bind(id).first<Row>();
      if (!again) return r;
      return await payPending(env, again);
    }
    return await payPending(env, row);
  } catch {
    return { status: 'queued' };
  }
}

async function payPending(env: PayoutEnv, row: Row): Promise<Settled> {
  const id = row.id;
  try {
    if (row.status !== 'pending' || row.attempts >= MAX_ATTEMPTS) return { status: 'queued' };
    // Reclamo: solo un proceso a la vez puede pasar un canje de pending a sending.
    const claim = await env.DB.prepare("UPDATE redemptions SET status = 'sending', attempts = attempts + 1 WHERE id = ?1 AND status = 'pending'").bind(id).run();
    if (claim.meta.changes !== 1) return { status: 'sending' };
    try {
      return await send(env, { ...row, status: 'sending' });
    } catch (e) {
      console.error('payout send failed', e);
      // Falla antes de tener firma: nada salió. Si ya había firma, queda 'sending' para reconciliar.
      const cur = await env.DB.prepare('SELECT tx FROM redemptions WHERE id = ?').bind(id).first<{ tx: string | null }>();
      if (!cur?.tx) {
        await backToPending(env.DB, id, 'error');
        return { status: 'queued' };
      }
      return { status: 'sending', tx: cur.tx };
    }
  } catch {
    return { status: 'queued' };
  }
}

/** Reintenta los canjes de una wallet que quedaron colgados (se llama al entrar al juego). */
export async function settlePendingFor(env: PayoutEnv, addr: string): Promise<void> {
  if (!payoutsEnabled(env)) return;
  const { results } = await env.DB.prepare("SELECT id FROM redemptions WHERE address = ? AND status IN ('pending', 'sending') ORDER BY id LIMIT 3").bind(addr).all<{ id: number }>();
  for (const r of results) await settleRedemption(env, r.id);
}
