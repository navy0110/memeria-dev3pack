// Ingreso con wallet, sin estado en el servidor: el Worker arma un mensaje con nonce y vencimiento, lo firma con
// HMAC (para no tener que recordarlo), el jugador lo firma con su wallet y acá se verifica la firma Ed25519 contra
// la dirección. Si coincide, se entrega un token de sesión (también HMAC) que viaja en /api y en /ws.
// El secreto es AUTH_SECRET (`wrangler secret put AUTH_SECRET`; en local, `.dev.vars`).
const enc = new TextEncoder();
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CHALLENGE_MS = 5 * 60 * 1000;
const SESSION_S = 7 * 24 * 3600;

/** Dirección de Solana (base58) a sus 32 bytes; null si no es una dirección válida. */
export function addressBytes(addr: string): Uint8Array | null {
  if (addr.length < 32 || addr.length > 44) return null;
  let n = 0n;
  for (const c of addr) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return n === 0n ? out : null;
}

const b64u = (b: ArrayBuffer | Uint8Array): string => {
  let s = '';
  for (const x of new Uint8Array(b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string): Uint8Array | null => {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const mac = async (secret: string, data: string): Promise<string> => b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
async function macOk(secret: string, data: string, given: string): Promise<boolean> {
  const sig = fromB64(given);
  return !!sig && crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(data));
}

/** Mensaje de ingreso (formato tipo «Sign in with Solana») con nonce y vencimiento, y su sello. */
export async function makeChallenge(secret: string, host: string, addr: string): Promise<{ message: string; mac: string }> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const message = [
    `${host} wants you to sign in with your Solana account:`,
    addr,
    '',
    'Sign in to Memeria. This only proves you own this wallet. It costs nothing and moves no funds.',
    '',
    `URI: https://${host}`,
    'Version: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(now + CHALLENGE_MS).toISOString()}`,
  ].join('\n');
  return { message, mac: await mac(secret, `c1|${message}`) };
}

/** Verifica el sello, el vencimiento y la firma Ed25519; si todo cuadra, devuelve un token de sesión. */
export async function verifyChallenge(secret: string, addr: string, message: string, sealed: string, signature: string): Promise<string | null> {
  if (!(await macOk(secret, `c1|${message}`, sealed))) return null;
  const lines = message.split('\n');
  if (lines[1] !== addr) return null;
  const exp = Date.parse(lines.find((l) => l.startsWith('Expiration Time: '))?.slice(17) ?? '');
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const pub = addressBytes(addr);
  const sig = fromB64(signature);
  if (!pub || !sig || sig.length !== 64) return null;
  const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
  if (!(await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, enc.encode(message)))) return null;
  const payload = `${addr}.${Math.floor(Date.now() / 1000) + SESSION_S}`;
  return `${payload}.${await mac(secret, `s1|${payload}`)}`;
}

/** Los invitados (early bird) no tienen wallet: su «dirección» es `guest:` + 24 hex, derivada del secreto que guarda su navegador. */
export const isGuest = (addr: string): boolean => /^guest:[0-9a-f]{24}$/.test(addr);

/** Token de invitado. El secreto del navegador no se guarda ni se reparte: solo se usa para derivar el id estable. */
export async function guestToken(secret: string, browserId: string): Promise<string> {
  const digest = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`g1|${browserId}`));
  const addr = `guest:${Array.from(new Uint8Array(digest).slice(0, 12), (x) => x.toString(16).padStart(2, '0')).join('')}`;
  const payload = `${addr}.${Math.floor(Date.now() / 1000) + SESSION_S}`;
  return `${payload}.${await mac(secret, `s1|${payload}`)}`;
}

/** La dirección de un token de sesión vigente, o null. */
export async function verifyToken(secret: string, token: string | null | undefined): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const [addr, exp, sig, ...rest] = token.split('.');
  if (!addr || !exp || !sig || rest.length) return null;
  if (!(Number(exp) > Date.now() / 1000)) return null;
  return (await macOk(secret, `s1|${addr}.${exp}`, sig)) && (isGuest(addr) || addressBytes(addr)) ? addr : null;
}
