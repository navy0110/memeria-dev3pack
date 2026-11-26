// Enlace con el servidor de la zona: un WebSocket al Worker (/ws) que lleva el chat global, la presencia,
// los mobs y el botín compartidos y el ranking. Si no hay servidor (dev sin wrangler) o se corta, reintenta
// con espera creciente y el juego sigue andando en modo local.
import type { LootDrop } from '../shared/types';
import type { WireMob, WorldLink } from '../shared/game';
import type { PartyMember, PartyNote, PartyView } from '../shared/party';

export interface ChatLine {
  /** Quién habló (id de conexión); sin valor en el historial y en los avisos. */
  id?: string;
  name: string;
  text: string;
  /** say: charla; emote: acción con emoji opcional; announce: aviso del mundo. */
  kind?: 'say' | 'emote' | 'announce' | 'party';
  emoji?: string;
  tone?: 'boss' | 'level' | 'join';
  cls?: string;
  lvl?: number;
}

/** Otro jugador conectado, tal como lo reenvía el servidor. */
export interface Peer {
  id: string;
  name: string;
  cls: string;
  skin: number;
  x: number;
  z: number;
  r: number;
  lvl?: number;
}

/** Quién soy para el servidor: identidad del ranking y nivel (el nivel es informativo). */
export interface Identity {
  key: string;
  lvl: number;
}

/** Respuesta del ranking semanal. */
export interface BoardData {
  week: string;
  top: Array<{ n: string; c: string; k: number; l: number }>;
  factions: Record<string, number>;
  me: { rank: number; k: number } | null;
}

export class ChatLink implements WorldLink {
  onLine: (l: ChatLine) => void = () => {};
  /** Alguien está escribiendo (id de conexión). */
  onTyping: (id: string) => void = () => {};
  /** Mi id de conexión, para saber cuál burbuja es mía. */
  myId = '';
  onOnline: (n: number) => void = () => {};
  onStatus: (up: boolean) => void = () => {};
  onPeer: (p: Peer) => void = () => {};
  onLeft: (id: string) => void = () => {};
  onWorld: (mobs: WireMob[], drops: LootDrop[]) => void = () => {};
  onMobs: (mobs: WireMob[]) => void = () => {};
  onMobStrike: (mobId: string, damage: number) => void = () => {};
  onRemoteHit: (mobId: string, amount: number) => void = () => {};
  onKill: (templateId: string) => void = () => {};
  onDrop: (d: LootDrop) => void = () => {};
  onDropGone: (id: string) => void = () => {};
  onLoot: (coins: number, items: string[], tokens: number, balance?: number) => void = () => {};
  onBoard: (b: BoardData) => void = () => {};
  /** Alguien me invita a su party. */
  onPartyInvite: (from: string, name: string) => void = () => {};
  /** Cambió la party (integrantes, vida, líder); `null` si ya no estoy en ninguna. */
  onParty: (p: PartyView | null) => void = () => {};
  onPartyNote: (n: PartyNote) => void = () => {};
  /** Mend en la party: `to` recibe `amt` de vida de parte de `from`. */
  onHeal: (h: { from: string; name: string; to: string; amt: number }) => void = () => {};
  /** El servidor rechazó mi Mend. */
  onMendRefused: () => void = () => {};
  /** El servidor ya mandó el estado del mundo: desde ahí los mobs son suyos. */
  private ready = false;
  private ws: WebSocket | null = null;
  private retry = 1000;
  private timer = 0;
  private closed = false;

  constructor(
    private readonly name: () => string,
    private readonly token: string | undefined,
  ) {}

  connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${this.token ? `?t=${encodeURIComponent(this.token)}` : ''}`);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.retry = 1000;
      this.onStatus(true);
    });
    ws.addEventListener('message', (e) => {
      let m: {
        t?: string;
        id?: string;
        kind?: ChatLine['kind'];
        emoji?: string;
        tone?: ChatLine['tone'];
        lvl?: number;
        online?: number;
        name?: string;
        text?: string;
        history?: ChatLine[];
        players?: Peer[];
        mobs?: WireMob[];
        drops?: LootDrop[];
        drop?: LootDrop;
        m?: WireMob[] | string;
        d?: number;
        a?: number;
        tpl?: string;
        coins?: number;
        items?: string[];
        tokens?: number;
        bal?: number;
        leader?: string;
        members?: PartyMember[];
        s?: string;
        v?: PartyNote['v'];
        err?: boolean;
        from?: string;
        to?: string;
        amt?: number;
      } & Partial<Peer> &
        Partial<BoardData>;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'hello') {
        if (typeof m.id === 'string') this.myId = m.id;
        if (typeof m.online === 'number') this.onOnline(m.online);
        for (const l of m.history ?? []) this.onLine(l);
        for (const p of m.players ?? []) this.onPeer(p);
        this.ready = true;
        this.onWorld(m.mobs ?? [], m.drops ?? []);
      } else if (m.t === 'online' && typeof m.online === 'number') this.onOnline(m.online);
      else if (m.t === 'say' && typeof m.text === 'string' && typeof m.name === 'string') {
        this.onLine({ id: m.id, name: m.name, text: m.text, kind: m.kind, emoji: m.emoji, tone: m.tone, cls: m.cls, lvl: m.lvl });
      } else if (m.t === 'typing' && typeof m.id === 'string') this.onTyping(m.id);
      else if (m.t === 'ps') for (const p of m.players ?? []) this.onPeer(p);
      else if (m.t === 'left' && typeof m.id === 'string') this.onLeft(m.id);
      else if (m.t === 'mobs' && Array.isArray(m.m)) this.onMobs(m.m);
      else if (m.t === 'mhit' && typeof m.m === 'string' && typeof m.d === 'number') this.onMobStrike(m.m, m.d);
      else if (m.t === 'hit' && typeof m.id === 'string' && typeof m.a === 'number') this.onRemoteHit(m.id, m.a);
      else if (m.t === 'kill' && typeof m.tpl === 'string') this.onKill(m.tpl);
      else if (m.t === 'drop' && m.drop) this.onDrop(m.drop);
      else if (m.t === 'dropgone' && typeof m.id === 'string') this.onDropGone(m.id);
      else if (m.t === 'loot') this.onLoot(m.coins ?? 0, m.items ?? [], m.tokens ?? 0, typeof m.bal === 'number' ? m.bal : undefined);
      else if (m.t === 'pinv' && typeof m.from === 'string' && typeof m.name === 'string') this.onPartyInvite(m.from, m.name);
      else if (m.t === 'party' && Array.isArray(m.members)) this.onParty(m.members.length ? { leader: m.leader ?? '', members: m.members } : null);
      else if (m.t === 'pnote' && typeof m.s === 'string') this.onPartyNote({ s: m.s, v: m.v, err: m.err });
      else if (m.t === 'heal' && typeof m.from === 'string' && typeof m.to === 'string' && typeof m.amt === 'number') this.onHeal({ from: m.from, name: m.name ?? '', to: m.to, amt: m.amt });
      else if (m.t === 'mendno') this.onMendRefused();
      else if (m.t === 'lb' && m.top && m.factions && m.week) this.onBoard({ week: m.week, top: m.top, factions: m.factions, me: m.me ?? null });
    });
    ws.addEventListener('close', () => {
      this.ready = false;
      this.onStatus(false);
      if (this.closed) return;
      this.timer = window.setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 30000);
    });
  }

  get up(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get live(): boolean {
    return this.up && this.ready;
  }

  hit(mobId: string, amount: number): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'hit', id: mobId, dmg: amount }));
  }

  heal(targetId: string): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'heal', to: targetId }));
  }

  /** Acciones de la party: invitar a un jugador, aceptar o rechazar una invitación, salir o (el líder) echar a alguien. */
  party(a: 'invite' | 'accept' | 'decline' | 'leave' | 'kick', to?: string): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'party', a, to }));
  }

  pickup(dropId: string): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'pickup', id: dropId }));
  }

  /** Avisa que cambié de nombre: el servidor lo vuelve a leer de la base. */
  renamed(): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'name' }));
  }

  /** Avisa que estoy por hablar (el servidor lo reenvía como puntos sobre mi cabeza). */
  typing(): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'typing' }));
  }

  requestBoard(key: string): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'lb', key }));
  }

  send(text: string): boolean {
    if (!this.up) return false;
    this.ws!.send(JSON.stringify({ t: 'say', name: this.name(), text }));
    return true;
  }

  /** Dónde estoy y quién soy, para que los demás me dibujen. */
  sendPos(p: Omit<Peer, 'id' | 'lvl'> & Identity & { hp?: number; maxHp?: number }): void {
    if (this.up) this.ws!.send(JSON.stringify({ t: 'pos', ...p }));
  }

  close(): void {
    this.closed = true;
    window.clearTimeout(this.timer);
    this.ws?.close();
  }
}
