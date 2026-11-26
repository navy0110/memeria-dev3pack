// Prueba de las compras con MMRIA contra `wrangler dev --port 8799` con un RPC falso:
//   pnpm exec tsx scripts/test-pay.ts   (arranca solo el RPC falso en :8801; wrangler debe llevar
//   --var TREASURY_ADDRESS:<tesorería de prueba> --var SOLANA_RPC:http://127.0.0.1:8801)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { getTransactionDecoder } from '@solana/kit';
import { newIdentity, b58 } from './auth-client';
import { buildPayment } from '../src/client/pay';
import { MMRIA_MINT } from '../src/shared/solana';

const TREASURY = b58(new Uint8Array(32).fill(9));
const txs = new Map<string, unknown>();
const rpc = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { method, params } = JSON.parse(body);
    const result = method === 'getLatestBlockhash' ? { value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100 } } : (txs.get(params[0]) ?? null);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  });
}).listen(8801);

const sig = (n: number): string => b58(new Uint8Array(64).fill(n));
const fakeTx = (o: { buyer: string; reference: string; amount: bigint; signer?: boolean; err?: unknown }) => ({
  meta: {
    err: o.err ?? null,
    preTokenBalances: [{ accountIndex: 1, mint: MMRIA_MINT, owner: o.buyer, uiTokenAmount: { amount: '99999999999' } }],
    postTokenBalances: [
      { accountIndex: 1, mint: MMRIA_MINT, owner: o.buyer, uiTokenAmount: { amount: String(99999999999n - o.amount) } },
      { accountIndex: 2, mint: MMRIA_MINT, owner: TREASURY, uiTokenAmount: { amount: String(o.amount) } },
    ],
  },
  transaction: { message: { accountKeys: [{ pubkey: o.buyer, signer: o.signer ?? true }, { pubkey: o.reference, signer: false }] } },
});

try {
  const a = await newIdentity();
  const b = await newIdentity();
  const order = async (id: typeof a, item = 'candle-cutter') => id.call('/api/order', { method: 'POST', body: JSON.stringify({ itemId: item }) });
  const confirm = (id: typeof a, orderId: string, signature: string) => id.call('/api/order/confirm', { method: 'POST', body: JSON.stringify({ orderId, signature }) });

  assert.equal((await order(a, 'health-potion')).status, 400, 'lo que no se vende por MMRIA no se ordena');
  const o = await order(a);
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.equal(o.body.amount, '2500000000', '2500 MMRIA en unidades mínimas');
  assert.equal(o.body.treasury, TREASURY);

  // La transacción que arma el cliente: dos instrucciones, la referencia dentro de la transferencia y el monto en los bytes.
  const bytes = await buildPayment(a.address, o.body);
  const decoded = getTransactionDecoder().decode(bytes);
  assert.ok(decoded.messageBytes.length > 100, 'transacción armada');

  const good = sig(1);
  assert.equal((await confirm(a, o.body.orderId, good)).body.status, 'waiting', 'sin transacción en la cadena: espera');
  txs.set(good, fakeTx({ buyer: a.address, reference: o.body.reference, amount: 2_500_000_000n }));
  assert.equal((await confirm(b, o.body.orderId, good)).status, 404, 'la orden de otro no se toca');
  const paid = await confirm(a, o.body.orderId, good);
  assert.equal(paid.body.status, 'paid', JSON.stringify(paid.body));
  assert.deepEqual((await a.call('/api/me')).body.owned, ['candle-cutter'], 'el ítem queda entregado');
  assert.equal((await confirm(a, o.body.orderId, good)).body.status, 'paid', 'confirmar de nuevo no duplica');
  assert.equal((await order(a)).status, 409, 'no se vende dos veces el mismo ítem');

  // Rechazos: la misma firma en otra orden, monto corto, otro pagador, sin referencia y transacción fallida.
  const o2 = await order(a, 'moonbreaker');
  assert.equal((await confirm(a, o2.body.orderId, good)).status, 409, 'una transferencia paga una sola orden');
  const cases: Array<[string, Parameters<typeof fakeTx>[0]]> = [
    ['monto corto', { buyer: a.address, reference: o2.body.reference, amount: 2_499_999_999n }],
    ['otro pagador', { buyer: b.address, reference: o2.body.reference, amount: 2_500_000_000n }],
    ['sin referencia', { buyer: a.address, reference: b58(new Uint8Array(32).fill(3)), amount: 2_500_000_000n }],
    ['sin firma del comprador', { buyer: a.address, reference: o2.body.reference, amount: 2_500_000_000n, signer: false }],
  ];
  let n = 10;
  for (const [name, c] of cases) {
    const s = sig(++n);
    txs.set(s, fakeTx(c));
    assert.equal((await confirm(a, o2.body.orderId, s)).status, 400, name);
  }
  const s = sig(++n);
  txs.set(s, fakeTx({ buyer: a.address, reference: o2.body.reference, amount: 2_500_000_000n, err: { InstructionError: [0, 'x'] } }));
  assert.equal((await confirm(a, o2.body.orderId, s)).status, 400, 'transacción fallida');
  assert.deepEqual((await a.call('/api/me')).body.owned, ['candle-cutter'], 'nada de lo rechazado entregó algo');
  console.log('OK pay');
} finally {
  rpc.close();
}
