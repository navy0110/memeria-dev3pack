// Cliente de prueba del ingreso con wallet: una identidad Ed25519 de usar y tirar que firma el mensaje del Worker.
import { webcrypto } from 'node:crypto';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (bytes: Uint8Array): string => {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
};

export const HTTP = process.env.HTTP ?? 'http://127.0.0.1:8799';

export interface Identity {
  address: string;
  token: string;
  call(path: string, init?: RequestInit): Promise<{ status: number; body: any }>;
}

/** Una wallet nueva que ingresa: pide el desafío, lo firma y guarda el token. */
export async function newIdentity(): Promise<Identity> {
  const pair = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  const address = b58(new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey)));
  const post = async (path: string, body: unknown) => {
    const r = await fetch(HTTP + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as any };
  };
  const ch = await post('/api/auth/challenge', { address });
  if (ch.status !== 200) throw new Error('challenge: ' + JSON.stringify(ch));
  const sig = new Uint8Array(await webcrypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(ch.body.message)));
  const v = await post('/api/auth/verify', { address, message: ch.body.message, mac: ch.body.mac, signature: Buffer.from(sig).toString('base64') });
  if (v.status !== 200) throw new Error('verify: ' + JSON.stringify(v));
  const token: string = v.body.token;
  const call = async (path: string, init: RequestInit = {}) => {
    const go = () => fetch(HTTP + path, { ...init, headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` } });
    // wrangler dev cierra los sockets inactivos (tras una llamada larga); un reintento alcanza.
    const r = await go().catch(() => go());
    return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
  };
  return { address, token, call };
}

export { b58 };
export const rawPost = async (path: string, body: unknown) => {
  const r = await fetch(HTTP + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
};
