// Wallets de Solana por Wallet Standard. Cada usuario del juego es una wallet: se conecta,
// firma un mensaje (gratis, no mueve fondos) y esa dirección pasa a ser su cuenta.
//
// Phantom se registra solo en el registro de Wallet Standard. MetaMask necesita su cliente
// (`@metamask/connect-solana`), que se carga bajo demanda para no inflar el bundle inicial.
//
// El nonce lo emite el Worker y es él quien verifica la firma (ver src/server/auth.ts); devuelve un token de sesión.
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, StandardDisconnect, type StandardConnectFeature, type StandardDisconnectFeature } from '@wallet-standard/features';
import { SolanaSignMessage, type SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import { authenticate } from './api';
import { t } from '../i18n';

export interface Session {
  /** Dirección de la wallet en base58; null solo en el modo de pruebas sin wallet. */
  address: string | null;
  wallet: string;
  /** Mascota elegida en la landing (si la hubo); un héroe ya guardado para esa wallet manda sobre ella. */
  classId?: string;
  /** Paleta elegida en la landing (índice de SKINS). */
  skin?: number;
  /** Token de sesión firmado por el servidor al ingresar (vale 7 días). Sin él no se entra al mundo. */
  token?: string;
  /** Solo en desarrollo: modo de pruebas sin wallet. */
  guest?: boolean;
}

export interface KnownWallet {
  id: 'phantom' | 'metamask';
  name: string;
  match: RegExp;
  installUrl: string;
}

export const KNOWN_WALLETS: KnownWallet[] = [
  { id: 'phantom', name: 'Phantom', match: /phantom/i, installUrl: 'https://phantom.app/download' },
  { id: 'metamask', name: 'MetaMask', match: /metamask/i, installUrl: 'https://metamask.io/download' },
];

const SESSION_KEY = 'meme-rpg:session';
const PROFILE_PREFIX = 'meme-rpg:profile:';

export class WalletError extends Error {}

export const shortAddress = (a: string): string => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Wallets del registro que sirven para el juego: conectan y firman mensajes en Solana. */
export function listWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => StandardConnect in w.features && SolanaSignMessage in w.features && w.chains.some((c) => c.startsWith('solana:')));
}

/** Avisa cuando se registra o se va una wallet (las extensiones se registran con un pequeño retraso). */
export function onWalletsChange(cb: () => void): () => void {
  const { on } = getWallets();
  const offs = [on('register', cb), on('unregister', cb)];
  return () => offs.forEach((off) => off());
}

let metamaskReady: Promise<boolean> | null = null;

/** Crea el cliente de MetaMask para Solana, que registra la wallet en el registro. Devuelve false si falla. */
export function ensureMetaMask(): Promise<boolean> {
  metamaskReady ??= (async () => {
    try {
      const { createSolanaClient } = await import('@metamask/connect-solana');
      await createSolanaClient({
        dapp: { name: 'Meme RPG', url: location.origin },
        api: { supportedNetworks: { mainnet: 'https://api.mainnet-beta.solana.com', devnet: 'https://api.devnet.solana.com' } },
        analytics: { enabled: false },
      });
      return true;
    } catch (e) {
      console.warn('[wallet] MetaMask no disponible:', e);
      return false;
    }
  })();
  return metamaskReady;
}

function pickAccount(list: readonly WalletAccount[]): WalletAccount | undefined {
  return list.find((a) => a.chains.some((c) => c.startsWith('solana:')));
}

/** Pide a la wallet que conecte. Con `silent` solo devuelve la cuenta si ya había autorizado el sitio. */
export async function connect(wallet: Wallet, silent = false): Promise<WalletAccount> {
  const feature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
  const { accounts } = await feature.connect(silent ? { silent: true } : undefined);
  const account = pickAccount(accounts.length > 0 ? accounts : wallet.accounts);
  if (!account) throw new WalletError(`${wallet.name} has no Solana account. Switch it to a Solana account and try again.`);
  return account;
}

/** Firma el mensaje que arma el servidor y le pide un token de sesión. Lanza si la wallet firma otra cosa o el servidor no la acepta. */
export async function signIn(wallet: Wallet, account: WalletAccount): Promise<string> {
  const feature = wallet.features[SolanaSignMessage] as SolanaSignMessageFeature[typeof SolanaSignMessage];
  return authenticate(account.address, async (message) => {
    const [out] = await feature.signMessage({ account, message });
    const signed = out.signedMessage;
    if (signed.length !== message.length || signed.some((b, i) => b !== message[i])) {
      throw new WalletError(t('The wallet signed a different message than the one shown. Sign-in cancelled.'));
    }
    return out.signature;
  });
}

/** Un error legible para mostrar: el rechazo del usuario no es un fallo. */
export function describeError(e: unknown): string {
  if (e instanceof WalletError) return e.message;
  const text = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel|declin|closed/i.test(text)) return t('You cancelled the request in your wallet. Try again when you are ready.');
  return t('Could not connect: {text}', { text });
}

// La sesión se recuerda en este navegador (localStorage) mientras el token del servidor siga vigente (7 días):
// al volver a abrir el juego se entra sin firmar de nuevo, con cualquier wallet. Antes vivía en sessionStorage,
// así que cerrar la pestaña obligaba a repetir el ingreso, y las wallets que no permiten reconectar en silencio
// (casi todas menos Phantom) lo repetían en cada visita.
export function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: toca volver a firmar al recargar */
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return typeof s.address === 'string' && typeof s.wallet === 'string' ? s : null;
  } catch {
    return null;
  }
}

/** Cierra la sesión: olvida la dirección y le pide a la wallet que desconecte. */
export async function signOut(session: Session): Promise<void> {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignorar */
  }
  const wallet = listWallets().find((w) => w.name === session.wallet);
  const feature = wallet?.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect] | undefined;
  try {
    await feature?.disconnect();
  } catch {
    /* la sesión local ya está cerrada */
  }
}

/** Datos del héroe de esta wallet (por ahora, en este navegador; con servidor irán en la base). */
export interface Profile {
  classId: string;
  /** Paleta del héroe (índice de SKINS); sin valor, la clásica. */
  skin?: number;
  /** Nombre que eligió el jugador; sin valor, se muestra la wallet abreviada. */
  alias?: string;
}

export function loadProfile(addr: string): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_PREFIX + addr);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(addr: string, p: Profile): void {
  try {
    localStorage.setItem(PROFILE_PREFIX + addr, JSON.stringify(p));
  } catch {
    /* ignorar */
  }
}

// --- Wallet del juego -------------------------------------------------------------------
// Para quien no tiene Phantom ni MetaMask: se crea una wallet de Solana (Ed25519) dentro del
// navegador. La clave privada es NO extraíble: queda guardada en IndexedDB y ni el juego puede
// leerla, solo firmar. Consecuencia: vive solo en este navegador (si se borran los datos del
// sitio se pierde la cuenta) y no se puede importar a otra app. Sirve para probar la beta;
// para guardar fondos reales hay que usar una wallet de verdad.
export const GAME_WALLET = 'Game wallet';

const DB_NAME = 'meme-rpg-wallet';
const STORE = 'keys';
const KEY_ID = 'game-wallet';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export interface GameWallet {
  address: string;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

// Dos formas de guardar la clave: nativa (WebCrypto Ed25519, no extraíble) o, en navegadores sin Ed25519
// (iPhone con iOS < 17, Chrome/WebView viejos, navegadores embebidos), una semilla de 32 bytes firmada con @noble/curves.
type Stored = { privateKey: CryptoKey; publicKey: CryptoKey } | { seed: Uint8Array };
const SEED_LS = 'meme-rpg-wallet-seed';

async function addressOfBytes(pub: Uint8Array): Promise<string> {
  const { getAddressDecoder } = await import('@solana/kit');
  return getAddressDecoder().decode(pub);
}

async function fromSeed(seed: Uint8Array): Promise<GameWallet> {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  return {
    address: await addressOfBytes(ed25519.getPublicKey(seed)),
    sign: async (m) => ed25519.sign(m, seed),
  };
}

async function fromStored(st: Stored): Promise<GameWallet> {
  if ('seed' in st) return fromSeed(st.seed);
  const { getAddressFromPublicKey } = await import('@solana/kit');
  return {
    address: await getAddressFromPublicKey(st.publicKey),
    sign: async (m) => new Uint8Array(await crypto.subtle.sign('Ed25519', st.privateKey, new Uint8Array(m))),
  };
}

function readSeedLs(): Uint8Array | null {
  try {
    const raw = localStorage.getItem(SEED_LS);
    if (!raw) return null;
    const bin = atob(raw);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function writeSeedLs(seed: Uint8Array): boolean {
  try {
    localStorage.setItem(SEED_LS, btoa(String.fromCharCode(...seed)));
    return true;
  } catch {
    return false;
  }
}

/**
 * La wallet del juego de este navegador; null solo si de verdad no existe. Un error de lectura se lanza: antes
 * devolvía null, y eso hacía que el juego creara una wallet nueva (otra cuenta, sin el progreso) encima de la vieja.
 */
export async function loadGameWallet(): Promise<GameWallet | null> {
  let stored: Stored | undefined;
  let idbFailed = false;
  try {
    stored = await idb<Stored | undefined>('readonly', (s) => s.get(KEY_ID));
  } catch {
    idbFailed = true;
  }
  if (stored) return fromStored(stored);
  // La semilla también se copia a localStorage: en iOS/WebViews IndexedDB falla o se vacía más seguido.
  const seed = readSeedLs();
  if (seed) return fromSeed(seed);
  if (idbFailed) {
    throw new WalletError(t('Could not read the game wallet from this browser (private window or blocked storage?). Your hero is safe on the server: try again, or use another browser profile.'));
  }
  return null;
}

async function saveSeed(seed: Uint8Array): Promise<void> {
  let saved = writeSeedLs(seed);
  try {
    await idb('readwrite', (s) => s.put({ seed }, KEY_ID));
    saved = true;
  } catch {
    /* queda localStorage */
  }
  if (!saved) throw new WalletError(t('Could not save the game wallet in this browser (private window or blocked storage?). Open the game in Safari or Chrome directly.'));
}

const CODE_PREFIX = 'memeria1-';

/** Código de respaldo de la wallet del juego, o null si no hay o es una wallet vieja de clave nativa (no exportable). */
export async function exportGameWalletCode(): Promise<string | null> {
  let stored: Stored | undefined;
  try {
    stored = await idb<Stored | undefined>('readonly', (s) => s.get(KEY_ID));
  } catch {
    /* se prueba localStorage */
  }
  const seed = stored && 'seed' in stored ? stored.seed : stored ? null : readSeedLs();
  if (!seed) return null;
  return CODE_PREFIX + btoa(String.fromCharCode(...seed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Restaura una wallet del juego desde un código de respaldo; reemplaza la de este navegador. */
export async function importGameWalletCode(code: string): Promise<GameWallet> {
  const raw = code.trim();
  if (!raw.startsWith(CODE_PREFIX)) throw new WalletError(t('That is not a Memeria backup code. It starts with "memeria1-".'));
  let seed: Uint8Array;
  try {
    const b64 = raw.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    seed = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    throw new WalletError(t('The backup code is damaged. Copy it again, whole.'));
  }
  if (seed.length !== 32) throw new WalletError(t('The backup code is incomplete. Copy it again, whole.'));
  await saveSeed(seed);
  return fromSeed(seed);
}

/** Crea la wallet del juego (o devuelve la existente). */
export async function createGameWallet(): Promise<GameWallet> {
  const existing = await loadGameWallet();
  if (existing) return existing;
  // Siempre semilla y no clave nativa: así se puede exportar un código de respaldo (la clave nativa no se puede leer).
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const record: Stored = { seed };
  await saveSeed(seed);
  void navigator.storage?.persist?.().catch(() => {});
  return fromStored(record);
}

/** Ingresa con la wallet del juego: firma el mensaje del servidor y devuelve el token de sesión. */
export async function signInGameWallet(w: GameWallet): Promise<string> {
  return authenticate(w.address, async (message) => w.sign(new Uint8Array(message)));
}
