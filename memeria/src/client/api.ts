// Cliente de la API del Worker (/api): ingreso con firma de wallet, perfil y guardado en D1.
// Todo lo que sale de acá es del servidor; localStorage queda como copia de respaldo (ver save.ts).
import type { SaveData } from '../shared/types';
import type { Profile } from './wallet';
import { t } from '../i18n';

export interface Me {
  profile: Profile | null;
  save: SaveData | null;
  /** Fichas MMRIA que lleva el servidor. */
  tokens?: number;
  /** Canje pedido y todavía sin pagar. */
  redeeming?: { tokens: number; mmria: number } | null;
  /** ¿Están abiertas las compras con MMRIA? */
  payments?: boolean;
  /** Ítems que esta wallet compró con MMRIA. */
  owned?: string[];
}

export type Redeemed = { ok: true; tokens: number; mmria: number; balance: number; payout?: 'paid' | 'sending' | 'queued'; tx?: string } | { ok: false; message: string };

/** Pide canjear todas las fichas por MMRIA real. El servidor las descuenta y deja el pago anotado como pendiente. */
export async function redeemTokens(token: string): Promise<Redeemed> {
  try {
    return { ok: true, ...(await call<{ tokens: number; mmria: number; balance: number; payout?: 'paid' | 'sending' | 'queued'; tx?: string }>('/api/redeem', { method: 'POST', body: '{}' }, token)) };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError && e.status !== 0 ? e.message : t('Could not reach the server.') };
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));

export async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(t(body.message ?? body.error ?? `HTTP ${res.status}`), res.status);
  return body as T;
}

/** Ingreso: el servidor da el mensaje, la wallet lo firma y el servidor devuelve un token de sesión. */
export async function authenticate(address: string, sign: (message: Uint8Array) => Promise<Uint8Array>): Promise<string> {
  let ch: { message: string; mac: string };
  try {
    ch = await call('/api/auth/challenge', { method: 'POST', body: JSON.stringify({ address }) });
  } catch {
    throw new ApiError(t('Could not reach the Memeria server. Try again in a moment.'), 0);
  }
  const signature = await sign(new TextEncoder().encode(ch.message));
  const out = await call<{ token: string }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ address, message: ch.message, mac: ch.mac, signature: b64(signature) }),
  });
  return out.token;
}

/** Early bird: sin wallet ni firma. El secreto queda en este navegador y el servidor responde con un token de invitado. */
export async function guestSignIn(id: string): Promise<string> {
  return (await call<{ token: string }>('/api/auth/guest', { method: 'POST', body: JSON.stringify({ id }), signal: AbortSignal.timeout(6000) })).token;
}

/** ¿El token sigue vigente? (solo mira el vencimiento que trae; el servidor lo vuelve a comprobar). */
export function tokenAlive(token: string | undefined): token is string {
  if (!token) return false;
  const exp = Number(token.split('.')[1]);
  return Number.isFinite(exp) && exp > Date.now() / 1000 + 60;
}

/** Perfil y guardado del jugador; null si el servidor no responde (se juega con la copia local). */
export async function fetchMe(token: string): Promise<Me | null> {
  try {
    return await call<Me>('/api/me', {}, token);
  } catch {
    return null;
  }
}

/** Devuelve el motivo si el nombre no sirve o está tomado, o null si está libre. */
export async function checkAliasFree(token: string, name: string): Promise<string | null> {
  try {
    const r = await call<{ ok: boolean; error?: string }>(`/api/alias/check?name=${encodeURIComponent(name)}`, {}, token);
    return r.ok ? null : t(r.error ?? 'That name is not available.');
  } catch {
    return t('Could not check the name. Try again.');
  }
}

/** Guarda el perfil. Devuelve el motivo del rechazo (nombre tomado, etc.) o null. */
export async function putProfile(token: string, p: Profile): Promise<string | null> {
  try {
    await call('/api/profile', { method: 'PUT', body: JSON.stringify({ classId: p.classId, skin: p.skin ?? 0, alias: p.alias ?? null }) }, token);
    return null;
  } catch (e) {
    return e instanceof ApiError && e.status !== 0 ? e.message : t('Could not reach the server.');
  }
}

/** Sube el guardado como mucho cada 15 s (y de inmediato con `force`, al cerrar la pestaña). */
export function savePusher(token: string): (data: SaveData, force?: boolean) => void {
  let last = 0;
  let timer = 0;
  let pending: SaveData | null = null;
  const send = (keepalive: boolean): void => {
    if (!pending) return;
    const data = pending;
    pending = null;
    last = Date.now();
    void fetch('/api/save', { method: 'PUT', keepalive, headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) }).catch(() => {});
  };
  return (data, force = false) => {
    pending = data;
    window.clearTimeout(timer);
    if (force || Date.now() - last > 15000) send(force);
    else timer = window.setTimeout(() => send(false), 15000 - (Date.now() - last));
  };
}
