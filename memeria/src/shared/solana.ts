// Constantes de Solana compartidas entre el Worker (verifica pagos) y el cliente (arma la transferencia).
// Verificadas contra mainnet el 2026-10-29: el mint es Token-2022, 6 decimales, supply fijo de 1.000.000.000.

/** MMRIA, el token de Memeria. */
export const MMRIA_MINT = '6384VsyfFRmhq5XLftMpUGQfmPz76xWnVDrkUq3ypump';
export const MMRIA_DECIMALS = 6;
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Bytes a base58 (el formato de las direcciones de Solana). */
export function toBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** MMRIA enteros a unidades mínimas (6 decimales), como texto para no perder precisión. */
export const toBaseUnits = (mmria: number): string => (BigInt(Math.round(mmria * 1e6))).toString();

/** Lo que el servidor le da al cliente para armar el pago de una orden. */
export interface OrderTicket {
  orderId: string;
  itemId: string;
  treasury: string;
  /** Unidades mínimas de MMRIA (texto). */
  amount: string;
  /** Cuenta de referencia única de la orden: va en la transferencia para que el servidor la reconozca. */
  reference: string;
  blockhash: string;
  lastValidBlockHeight: number;
}
