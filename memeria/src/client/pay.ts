// Compra de un ítem con MMRIA real. El servidor abre una orden (monto, tesorería, referencia única); acá se arma la
// transferencia de MMRIA (Token-2022) a la tesorería con esa referencia, la firma y envía la wallet del jugador, y se le
// pasa la firma al servidor, que la verifica en la cadena antes de entregar (ver src/server/payments.ts).
// El MMRIA sale de la wallet del jugador; el juego nunca ve su clave. La wallet del juego (la del navegador) no se usa
// para pagar: no guarda fondos.
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getAddressEncoder,
  getProgramDerivedAddress,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from '@solana/kit';
import { SolanaSignAndSendTransaction, type SolanaSignAndSendTransactionFeature } from '@solana/wallet-standard-features';
import { ATA_PROGRAM, MMRIA_DECIMALS, MMRIA_MINT, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, toBase58, type OrderTicket } from '../shared/solana';
import { call } from './api';
import { GAME_WALLET, connect, listWallets, type Session } from './wallet';
import { t } from '../i18n';

export type PayOutcome = { ok: true; itemId: string } | { ok: false; message: string };

const enc = getAddressEncoder();

async function ataOf(owner: string): Promise<Address> {
  const [ata] = await getProgramDerivedAddress({
    programAddress: address(ATA_PROGRAM),
    seeds: [enc.encode(address(owner)), enc.encode(address(TOKEN_2022_PROGRAM)), enc.encode(address(MMRIA_MINT))],
  });
  return ata;
}

/** Transacción sin firmar: crea la cuenta de MMRIA de la tesorería si falta y transfiere el monto, con la referencia de la orden. */
export async function buildPayment(buyer: string, t: OrderTicket): Promise<Uint8Array> {
  const [from, to] = await Promise.all([ataOf(buyer), ataOf(t.treasury)]);
  const amount = new Uint8Array(8);
  new DataView(amount.buffer).setBigUint64(0, BigInt(t.amount), true);
  const createTreasuryAta: Instruction = {
    programAddress: address(ATA_PROGRAM),
    accounts: [
      { address: address(buyer), role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
      { address: address(t.treasury), role: AccountRole.READONLY },
      { address: address(MMRIA_MINT), role: AccountRole.READONLY },
      { address: address(SYSTEM_PROGRAM), role: AccountRole.READONLY },
      { address: address(TOKEN_2022_PROGRAM), role: AccountRole.READONLY },
    ],
    data: new Uint8Array([1]), // CreateIdempotent: no falla si ya existe
  };
  const transfer: Instruction = {
    programAddress: address(TOKEN_2022_PROGRAM),
    accounts: [
      { address: from, role: AccountRole.WRITABLE },
      { address: address(MMRIA_MINT), role: AccountRole.READONLY },
      { address: to, role: AccountRole.WRITABLE },
      { address: address(buyer), role: AccountRole.READONLY_SIGNER },
      // Referencia de la orden: una cuenta más, solo lectura, que el servidor busca en la transacción.
      { address: address(t.reference), role: AccountRole.READONLY },
    ],
    data: new Uint8Array([12, ...amount, MMRIA_DECIMALS]), // TransferChecked
  };
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(buyer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: t.blockhash as never, lastValidBlockHeight: BigInt(t.lastValidBlockHeight) }, m),
    (m) => appendTransactionMessageInstructions([createTreasuryAta, transfer], m),
  );
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Compra `itemId` con MMRIA. `progress` recibe el paso en curso para mostrarlo. */
export async function buyWithMmria(session: Session, token: string, itemId: string, progress: (text: string) => void): Promise<PayOutcome> {
  if (!session.address) return { ok: false, message: t('Sign in with a wallet first.') };
  if (session.wallet === GAME_WALLET) {
    return { ok: false, message: t('The game wallet holds no funds. Sign in with Phantom, MetaMask or another Solana wallet that has MMRIA to buy this.') };
  }
  const wallet = listWallets().find((w) => w.name === session.wallet);
  const feature = wallet?.features[SolanaSignAndSendTransaction] as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction] | undefined;
  if (!wallet || !feature) return { ok: false, message: t('{wallet} is not connected or cannot send transactions from here. Reconnect it and try again.', { wallet: session.wallet }) };

  try {
    progress(t('Opening your order...'));
    const ticket = await call<OrderTicket>('/api/order', { method: 'POST', body: JSON.stringify({ itemId }) }, token);
    // La cuenta que firma tiene que ser la misma que ingresó al juego.
    const account = await connect(wallet);
    if (account.address !== session.address) return { ok: false, message: t('Your wallet switched to another account. Switch back to the one you signed in with.') };

    progress(t('Approve the payment in {wallet}...', { wallet: wallet.name }));
    const [sent] = await feature.signAndSendTransaction({ account, chain: 'solana:mainnet', transaction: await buildPayment(session.address, ticket), options: { commitment: 'confirmed' } });
    const signature = toBase58(sent.signature);

    // El servidor mira la transacción en la cadena; puede tardar unos segundos en verse como confirmada.
    for (let i = 0; i < 30; i++) {
      progress(t('Waiting for Solana to confirm...'));
      const r = await call<{ status: 'paid' | 'waiting'; itemId: string }>('/api/order/confirm', { method: 'POST', body: JSON.stringify({ orderId: ticket.orderId, signature }) }, token);
      if (r.status === 'paid') return { ok: true, itemId: r.itemId };
      await sleep(2000);
    }
    return { ok: false, message: t('The payment was sent but is not confirmed yet. Your signature is {sig}. Reopen the game in a minute: if it went through, the item will be delivered.', { sig: signature }) };
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (/reject|denied|cancel|declin|closed/i.test(text)) return { ok: false, message: t('You cancelled the payment. Nothing was charged.') };
    return { ok: false, message: text };
  }
}
