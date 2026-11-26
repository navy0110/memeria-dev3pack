// Worker de Memeria. Los estáticos los sirve Workers Static Assets; acá solo vive /ws, que lleva a un único
// Durable Object (`ChatRoom`) con WebSockets hibernables. Ese objeto es el servidor de la zona:
//  - chat global y presencia (ver a los demás caminar);
//  - los mobs y el botín, compartidos (ver world.ts): el servidor los mueve, arbitra los golpes y reparte el botín;
//  - el ranking semanal (ver ranking.ts).
// El héroe (vida, XP, inventario) sigue siendo del cliente; ver PLAN.md para lo que falta (firma de wallet, D1).
import { DurableObject } from 'cloudflare:workers';
import { Ranking } from './ranking';
import { MobWorld, type WorldPlayer } from './world';
import { handleApi, type ApiEnv } from './api';
import { isGuest, verifyToken } from './auth';
import { creditTokens } from './tokens';
import { BOSS_IDS, EMOTES, LEVEL_MILESTONE } from '../shared/emotes';
import { MOB_TEMPLATES } from '../data';
import { RULES } from '../shared/rules';
import { PARTY, mendAmount, type PartyNote, type PartyView } from '../shared/party';

interface Env extends ApiEnv {
  CHAT: DurableObjectNamespace<ChatRoom>;
}

/** Cabecera interna con la dirección ya verificada: el Worker la pisa siempre, un cliente no puede mandarla. */
const ADDR_HEADER = 'x-memeria-addr';
const shortAddr = (a: string): string => (isGuest(a) ? `Early bird ${a.slice(-4)}` : `${a.slice(0, 4)}…${a.slice(-4)}`);

const MAX_TEXT = 200;
const MIN_GAP_MS = 800;
const HISTORY = 30;
const MAX_CONNECTIONS = 400;
const MIN_POS_GAP_MS = 50;
/** Paso del mundo: mueve los mobs, reparte las posiciones juntas y avisa lo que cambió (10 veces por segundo). */
const TICK_MS = 100;
const WORLD_LIMIT = 1000;
/** Un jugador que no avisó su posición en este tiempo deja de contar para los mobs (el cliente manda un latido cada 2 s). */
const STALE_MS = 15000;
const RANK_FLUSH_MS = 10000;
const MIN_LB_GAP_MS = 2000;
const CLASSES = new Set(['pepe', 'shiba', 'doge', 'popcat', 'wif']);

/** Lo que el servidor recuerda de cada conexión (vive en el attachment del socket, sobrevive a la hibernación). */
interface Peer {
  id: string;
  name: string;
  cls: string;
  skin: number;
  x: number;
  z: number;
  r: number;
  placed: boolean;
  /** Identidad para el ranking: la dirección de la wallet, verificada por firma al ingresar (la fija el servidor). */
  key: string;
  lvl: number;
  seen: number;
  /** Party a la que pertenece ('' = ninguna) y si la lidera. Vive en el attachment: sobrevive a la hibernación. */
  party?: string;
  pl?: boolean;
  /** Vida que informa el cliente (solo se usa para el cuadro de la party y para no gastar curaciones de más). */
  hp?: number;
  maxHp?: number;
}

/** Lo que ven los demás de un jugador (sin su identidad). */
const publicPeer = (p: Peer): Omit<Peer, 'key' | 'placed' | 'seen' | 'party' | 'pl' | 'hp' | 'maxHp'> => ({ id: p.id, name: p.name, cls: p.cls, skin: p.skin, x: p.x, z: p.z, r: p.r, lvl: p.lvl });

const peerOf = (ws: WebSocket): Peer | null => ws.deserializeAttachment() as Peer | null;

// Sin caracteres de control ni de dirección de texto (que sirven para disfrazar mensajes).
const clean = (s: unknown, max: number): string =>
  typeof s === 'string'
    ? s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, max)
    : '';

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a websocket', { status: 426 });
    // Solo desde el propio sitio: otro origen no puede colgarse del chat.
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return new Response('Forbidden', { status: 403 });
    // Sin una sesión firmada con wallet no se entra al mundo.
    const addr = await verifyToken(env.AUTH_SECRET, url.searchParams.get('t'));
    if (!addr) return new Response('Unauthorized', { status: 401 });
    const fwd = new Request(request);
    fwd.headers.set(ADDR_HEADER, addr);
    return env.CHAT.get(env.CHAT.idFromName('global')).fetch(fwd);
  },
};

interface Msg {
  t?: string;
  name?: unknown;
  text?: unknown;
  x?: unknown;
  z?: unknown;
  r?: unknown;
  cls?: unknown;
  skin?: unknown;
  key?: unknown;
  lvl?: unknown;
  id?: unknown;
  dmg?: unknown;
  a?: unknown;
  to?: unknown;
  hp?: unknown;
  maxHp?: unknown;
}

export class ChatRoom extends DurableObject<Env> {
  private history: { name: string; text: string; at: number; cls?: string; lvl?: number }[] = [];
  private lastTyping = new Map<WebSocket, number>();
  private lastSent = new Map<WebSocket, number>();
  private lastPos = new Map<WebSocket, number>();
  private lastLb = new Map<WebSocket, number>();
  /** Quiénes se movieron desde el último envío. */
  private dirty = new Set<string>();
  /** Invitaciones pendientes, por quien las recibe. Se pierden si el objeto hiberna: expiran igual a los 30 s. */
  private invites = new Map<string, { from: string; at: number }>();
  private lastInvite = new Map<WebSocket, number>();
  private lastHeal = new Map<WebSocket, number>();
  /** Parties cuyo cuadro hay que reenviar (cambió la vida, el nivel o el nombre de alguien). */
  private partyDirty = new Set<string>();
  private readonly world = new MobWorld();
  private readonly rank = new Ranking(this.ctx.storage);
  private lastTick = 0;
  private lastFlush = 0;

  async fetch(request: Request): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) return new Response('Room is full', { status: 503 });
    const addr = request.headers.get(ADDR_HEADER) ?? '';
    if (!addr) return new Response('Unauthorized', { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const me: Peer = { id: crypto.randomUUID().slice(0, 8), name: await this.nameOf(addr), cls: 'pepe', skin: 0, x: 0, z: 0, r: 0, placed: false, key: addr, lvl: 1, seen: 0 };
    server.serializeAttachment(me);
    const players = this.ctx
      .getWebSockets()
      .map((w) => w.deserializeAttachment() as Peer | null)
      .filter((p): p is Peer => !!p && p.placed && p.id !== me.id)
      .map(publicPeer);
    server.send(
      JSON.stringify({
        t: 'hello',
        id: me.id,
        online: this.ctx.getWebSockets().length,
        history: await this.load(),
        players,
        mobs: this.world.snapshot(),
        drops: this.world.drops,
      }),
    );
    this.broadcast({ t: 'online', online: this.ctx.getWebSockets().length });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** El nombre que ve el resto: el que eligió el jugador (D1) o su wallet abreviada. */
  private async nameOf(addr: string): Promise<string> {
    try {
      const row = await this.env.DB.prepare('SELECT alias FROM players WHERE address = ?').bind(addr).first<{ alias: string | null }>();
      return row?.alias || shortAddr(addr);
    } catch {
      return shortAddr(addr);
    }
  }

  private async load(): Promise<typeof this.history> {
    if (!this.history.length) this.history = (await this.ctx.storage.get<typeof this.history>('history')) ?? [];
    return this.history;
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 1024) return;
    let msg: Msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'pos':
        return this.onPos(ws, msg);
      case 'hit':
        return this.onHit(ws, msg);
      case 'pickup':
        return this.onPickup(ws, msg);
      case 'lb':
        return this.onLeaderboard(ws);
      case 'say':
        return this.onSay(ws, msg);
      case 'typing':
        return this.onTyping(ws);
      case 'name':
        return this.onName(ws);
      case 'party':
        return this.onParty(ws, msg);
      case 'heal':
        return this.onHeal(ws, msg);
    }
  }

  // ---- Party ----

  private sockOf(id: string): WebSocket | undefined {
    return this.ctx.getWebSockets().find((w) => peerOf(w)?.id === id);
  }

  /** Quiénes están en la party, en el orden en que se conectaron. */
  private membersOf(partyId: string): Array<{ ws: WebSocket; p: Peer }> {
    const out: Array<{ ws: WebSocket; p: Peer }> = [];
    for (const ws of this.ctx.getWebSockets()) {
      const p = peerOf(ws);
      if (p && p.party === partyId) out.push({ ws, p });
    }
    return out;
  }

  private save(ws: WebSocket, p: Peer): void {
    try {
      ws.serializeAttachment(p);
    } catch {
      /* conexión que se está cerrando */
    }
  }

  /** Aviso corto para el chat de un jugador (el texto va en inglés y el cliente lo traduce). */
  private note(ws: WebSocket, s: string, v?: PartyNote['v'], err = false): void {
    this.send(ws, { t: 'pnote', s, v, err });
  }

  private noteParty(partyId: string, s: string, v?: PartyNote['v']): void {
    for (const m of this.membersOf(partyId)) this.note(m.ws, s, v);
  }

  /** Le cuenta a cada integrante cómo está la party. */
  private sendParty(partyId: string): void {
    const mem = this.membersOf(partyId);
    const view: PartyView = {
      leader: mem.find((m) => m.p.pl)?.p.id ?? mem[0]?.p.id ?? '',
      members: mem.map(({ p }) => ({ id: p.id, name: p.name, cls: p.cls, lvl: p.lvl, hp: p.hp ?? 0, maxHp: p.maxHp ?? 0 })),
    };
    for (const m of mem) this.send(m.ws, { t: 'party', ...view });
  }

  private onParty(ws: WebSocket, m: Msg): void {
    const me = peerOf(ws);
    if (!me?.placed) return;
    const now = Date.now();
    switch (m.a) {
      case 'invite': {
        if (now - (this.lastInvite.get(ws) ?? 0) < 1000) return;
        this.lastInvite.set(ws, now);
        const tws = typeof m.to === 'string' ? this.sockOf(m.to) : undefined;
        const target = tws ? peerOf(tws) : null;
        if (!tws || !target?.placed || target.id === me.id) return this.note(ws, 'That player is not online.', undefined, true);
        if (target.party && target.party === me.party) return this.note(ws, '{name} is already in your party.', { name: target.name }, true);
        if (target.party) return this.note(ws, '{name} is already in a party.', { name: target.name }, true);
        if (me.party && this.membersOf(me.party).length >= PARTY.maxSize) return this.note(ws, 'Your party is full ({n} heroes).', { n: PARTY.maxSize }, true);
        this.invites.set(target.id, { from: me.id, at: now });
        this.send(tws, { t: 'pinv', from: me.id, name: me.name });
        this.note(ws, 'Party invite sent to {name}.', { name: target.name });
        return;
      }
      case 'accept': {
        const inv = this.invites.get(me.id);
        this.invites.delete(me.id);
        if (!inv || now - inv.at > PARTY.inviteTtlMs) return this.note(ws, 'That invite has expired.', undefined, true);
        if (me.party) return this.note(ws, 'Leave your current party first (/leave).', undefined, true);
        const fws = this.sockOf(inv.from);
        const from = fws ? peerOf(fws) : null;
        if (!fws || !from?.placed) return this.note(ws, 'The player who invited you is gone.', undefined, true);
        if (!from.party) {
          from.party = crypto.randomUUID().slice(0, 8);
          from.pl = true;
          this.save(fws, from);
        }
        if (this.membersOf(from.party).length >= PARTY.maxSize) return this.note(ws, 'That party is full.', undefined, true);
        me.party = from.party;
        me.pl = false;
        this.save(ws, me);
        this.noteParty(from.party, '{name} joined the party.', { name: me.name });
        this.sendParty(from.party);
        return;
      }
      case 'decline': {
        const inv = this.invites.get(me.id);
        this.invites.delete(me.id);
        const fws = inv ? this.sockOf(inv.from) : undefined;
        if (fws) this.note(fws, '{name} declined your invite.', { name: me.name });
        return;
      }
      case 'leave':
        return this.leaveParty(ws, false);
      case 'kick': {
        if (!me.party || !me.pl || typeof m.to !== 'string') return;
        const tws = this.sockOf(m.to);
        const target = tws ? peerOf(tws) : null;
        if (!tws || !target || target.party !== me.party || target.id === me.id) return;
        return this.leaveParty(tws, true);
      }
    }
  }

  /** Saca a alguien de su party. Con uno solo, la party se disuelve; si se va quien la lidera, pasa al siguiente. */
  private leaveParty(ws: WebSocket, kicked: boolean): void {
    const me = peerOf(ws);
    if (!me?.party) return;
    const pid = me.party;
    me.party = '';
    me.pl = false;
    this.save(ws, me);
    this.send(ws, { t: 'party', leader: '', members: [] });
    const rest = this.membersOf(pid).filter((r) => r.ws !== ws);
    if (rest.length <= 1) {
      for (const r of rest) {
        r.p.party = '';
        r.p.pl = false;
        this.save(r.ws, r.p);
        this.send(r.ws, { t: 'party', leader: '', members: [] });
        this.note(r.ws, 'The party disbanded.');
      }
      return;
    }
    if (!rest.some((r) => r.p.pl)) {
      rest[0].p.pl = true;
      this.save(rest[0].ws, rest[0].p);
    }
    this.noteParty(pid, kicked ? '{name} was removed from the party.' : '{name} left the party.', { name: me.name });
    if (kicked) this.note(ws, 'You were removed from the party.');
    this.sendParty(pid);
  }

  /** Mend: un integrante cura a otro de su party. El servidor decide el monto, el alcance y el ritmo. */
  private onHeal(ws: WebSocket, m: Msg): void {
    const me = peerOf(ws);
    if (!me?.placed || !me.party || typeof m.to !== 'string') return;
    const refuse = (s: string, v?: PartyNote['v']): void => {
      this.note(ws, s, v, true);
      this.send(ws, { t: 'mendno' });
    };
    const now = Date.now();
    if (now - (this.lastHeal.get(ws) ?? 0) < PARTY.mend.cooldown * 800) return refuse('Mend is not ready yet.');
    const tws = this.sockOf(m.to);
    const target = tws ? peerOf(tws) : null;
    if (!tws || !target?.placed || target.party !== me.party || target.id === me.id) return refuse('That friend is not in your party.');
    if (Math.hypot(target.x - me.x, target.z - me.z) > PARTY.mend.range + PARTY.mend.slack) return refuse('{name} is too far away.', { name: target.name });
    const missing = target.maxHp ? target.maxHp - (target.hp ?? 0) : Infinity;
    if (missing <= 0) return refuse('{name} is already at full health.', { name: target.name });
    const amt = Math.min(mendAmount(me.lvl), Math.ceil(missing));
    this.lastHeal.set(ws, now);
    const out = { t: 'heal', from: me.id, name: me.name, to: target.id, amt };
    for (const mem of this.membersOf(me.party)) this.send(mem.ws, out);
  }

  /** El jugador cambió su nombre: se vuelve a leer de D1 (la fuente de verdad) y los demás lo ven en el próximo paso. */
  private async onName(ws: WebSocket): Promise<void> {
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me?.key) return;
    me.name = await this.nameOf(me.key);
    ws.serializeAttachment(me);
    this.dirty.add(me.id);
    this.arm();
  }

  private async onSay(ws: WebSocket, msg: Msg): Promise<void> {
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me?.key) return;
    const text = clean(msg.text, MAX_TEXT);
    if (!text) return;

    const now = Date.now();
    if (now - (this.lastSent.get(ws) ?? 0) < MIN_GAP_MS) return;
    this.lastSent.set(ws, now);

    // Comandos: /me <acción> y los emotes de la lista. Lo desconocido se descarta (no se filtra como chat).
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/);
      const c = cmd.toLowerCase();
      // /p <texto>: chat de la party, solo lo ven sus integrantes (no queda en el historial).
      if (c === 'p' || c === 'party') {
        const said = clean(rest.join(' '), MAX_TEXT);
        if (!said) return;
        if (!me.party) return this.note(ws, 'You are not in a party. Open the Party panel (P) to invite a friend.', undefined, true);
        const out = { t: 'say', kind: 'party', id: me.id, name: me.name, text: said, cls: me.cls, lvl: me.lvl, at: now };
        for (const mem of this.membersOf(me.party)) this.send(mem.ws, out);
        return;
      }
      let line: { kind: string; text: string; emoji?: string } | null = null;
      if (c === 'me') {
        const act = clean(rest.join(' '), 120);
        if (act) line = { kind: 'emote', text: act };
      } else if (Object.hasOwn(EMOTES, c)) line = { kind: 'emote', ...EMOTES[c] };
      if (line) this.broadcast({ t: 'say', ...line, id: me.id, name: me.name, cls: me.cls, lvl: me.lvl, at: now });
      return;
    }

    const line = { name: me.name, text, at: now, cls: me.cls, lvl: me.lvl };
    const history = await this.load();
    history.push(line);
    if (history.length > HISTORY) history.splice(0, history.length - HISTORY);
    await this.ctx.storage.put('history', history);
    this.broadcast({ t: 'say', kind: 'say', id: me.id, ...line });
  }

  /** Aviso del mundo para todos (jefes caídos, hitos de nivel, quien entra). */
  private announce(text: string, tone: 'boss' | 'level' | 'join' = 'boss'): void {
    this.broadcast({ t: 'say', kind: 'announce', tone, name: '', text, at: Date.now() });
  }

  /** «Escribiendo...»: una burbuja de puntos sobre la cabeza, para que se note que alguien está por hablar. */
  private onTyping(ws: WebSocket): void {
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me?.placed) return;
    const now = Date.now();
    if (now - (this.lastTyping.get(ws) ?? 0) < 1500) return;
    this.lastTyping.set(ws, now);
    this.broadcast({ t: 'typing', id: me.id }, ws);
  }

  private onPos(ws: WebSocket, m: Msg): void {
    const now = Date.now();
    if (now - (this.lastPos.get(ws) ?? 0) < MIN_POS_GAP_MS) return;
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me) return;
    const { x, z, r, skin } = m;
    if (!finite(x) || !finite(z) || !finite(r)) return;
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return;
    this.lastPos.set(ws, now);
    me.x = Math.round(x * 100) / 100;
    me.z = Math.round(z * 100) / 100;
    me.r = Math.round(r * 100) / 100;
    me.cls = typeof m.cls === 'string' && CLASSES.has(m.cls) ? m.cls : 'pepe';
    me.skin = typeof skin === 'number' && Number.isInteger(skin) && skin >= 0 && skin <= 3 ? skin : 0;
    const lvl = finite(m.lvl) ? Math.max(1, Math.min(RULES.progression.maxLevel, Math.floor(m.lvl))) : 1;
    // Avisos sociales: entrada y hitos de nivel (el nivel lo informa el cliente, así que solo sirve de ambiente).
    if (!me.placed) this.announce(`${me.name} entered Memeria.`, 'join');
    else if (lvl > me.lvl && Math.floor(lvl / LEVEL_MILESTONE) > Math.floor(me.lvl / LEVEL_MILESTONE)) this.announce(`${me.name} reached level ${lvl}!`, 'level');
    // Vida para el cuadro de la party (la informa el cliente: sirve de ambiente y para no curar de más, no para decidir nada).
    const maxHp = finite(m.maxHp) ? Math.max(1, Math.min(9999, Math.round(m.maxHp))) : (me.maxHp ?? 0);
    const hp = finite(m.hp) ? Math.max(0, Math.min(maxHp, Math.round(m.hp))) : (me.hp ?? 0);
    if (me.party && (hp !== me.hp || maxHp !== me.maxHp || lvl !== me.lvl)) this.partyDirty.add(me.party);
    me.hp = hp;
    me.maxHp = maxHp;
    me.lvl = lvl;
    me.placed = true;
    me.seen = now;
    ws.serializeAttachment(me);
    this.dirty.add(me.id);
    this.arm();
  }

  /** Un jugador le pegó a un mob: el servidor lo valida, descuenta la vida y, si muere, reparte créditos y botín. */
  private async onHit(ws: WebSocket, m: Msg): Promise<void> {
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me?.placed || typeof m.id !== 'string' || !finite(m.dmg)) return;
    const res = this.world.hit(this.asPlayer(me), m.id, m.dmg, Date.now());
    if (!res.ok) return;
    // Los demás ven el número; el que pegó ya lo vio al instante.
    this.broadcast({ t: 'hit', id: m.id, a: res.dmg }, ws);
    if (!res.kill) return;
    this.broadcast({ t: 'drop', drop: res.drop });
    if (BOSS_IDS.has(res.kill.templateId)) {
      const names = this.ctx
        .getWebSockets()
        .map((w) => w.deserializeAttachment() as Peer | null)
        .filter((p): p is Peer => !!p && res.kill!.credit.includes(p.id))
        .map((p) => p.name);
      this.announce(`${names.join(', ') || 'Someone'} felled ${MOB_TEMPLATES[res.kill.templateId]?.name ?? 'a boss'}!`, 'boss');
    }
    await this.rank.sync(Date.now());
    const socks = this.ctx.getWebSockets();
    for (const w of socks) {
      const p = w.deserializeAttachment() as Peer | null;
      if (!p || !res.kill.credit.includes(p.id)) continue;
      this.send(w, { t: 'kill', m: res.kill.mobId, tpl: res.kill.templateId });
      this.rank.addKill(p.key, p.name, p.cls, p.lvl);
    }
    this.arm();
  }

  private async onPickup(ws: WebSocket, m: Msg): Promise<void> {
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me?.placed || typeof m.id !== 'string') return;
    const d = this.world.pickup(this.asPlayer(me), m.id);
    if (!d) return;
    this.broadcast({ t: 'dropgone', id: d.id });
    // Las fichas van a la base antes de avisar: lo que el jugador ve es lo que quedó guardado (con el tope diario aplicado).
    let tokens = 0;
    let bal: number | undefined;
    // Los invitados no juntan fichas canjeables: sin wallet no hay a dónde mandar el MMRIA.
    if (d.tokens && !isGuest(me.key)) {
      try {
        const r = await creditTokens(this.env.DB, me.key, d.tokens);
        tokens = r.credited;
        bal = r.balance;
      } catch {
        /* sin base no hay fichas, pero las monedas y los ítems se entregan igual */
      }
    }
    this.send(ws, { t: 'loot', id: d.id, coins: d.coins, items: d.items, tokens, bal });
  }

  private async onLeaderboard(ws: WebSocket): Promise<void> {
    const now = Date.now();
    if (now - (this.lastLb.get(ws) ?? 0) < MIN_LB_GAP_MS) return;
    this.lastLb.set(ws, now);
    await this.rank.sync(now);
    // La identidad la fijó el servidor al ingresar, así que sirve desde antes de la primera posición.
    const me = ws.deserializeAttachment() as Peer | null;
    const key = me?.key;
    this.send(ws, {
      t: 'lb',
      week: this.rank.label,
      top: this.rank.top(10),
      factions: this.rank.factions(),
      me: key ? this.rank.rankOf(key) : null,
    });
  }

  private asPlayer(p: Peer): WorldPlayer {
    return { id: p.id, cls: p.cls, x: p.x, z: p.z };
  }

  /** Pone en marcha el ciclo del mundo si estaba parado. */
  private arm(): void {
    void this.ctx.storage.getAlarm().then((a) => {
      if (a !== null) return;
      this.lastTick = Date.now();
      return this.ctx.storage.setAlarm(this.lastTick + TICK_MS);
    });
  }

  /** Un paso del mundo: mobs, mordidas, botín vencido, posiciones de los jugadores y ranking. */
  async alarm(): Promise<void> {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.25);
    this.lastTick = now;
    const socks = this.ctx.getWebSockets();
    const peers = socks.map((w) => w.deserializeAttachment() as Peer | null);
    const live = peers.filter((p): p is Peer => !!p && p.placed && now - p.seen < STALE_MS);

    if (live.length) {
      const { strikes, changed, gone } = this.world.tick(dt, live.map((p) => this.asPlayer(p)));
      for (const s of strikes) {
        const i = peers.findIndex((p) => p?.id === s.playerId);
        if (i >= 0) this.send(socks[i], { t: 'mhit', m: s.mobId, d: s.damage });
      }
      if (changed.length) this.broadcast({ t: 'mobs', m: changed });
      for (const id of gone) this.broadcast({ t: 'dropgone', id });
    }

    // Cuadro de la party: si alguien cambió de vida, todos sus compañeros lo ven en el próximo paso.
    if (this.partyDirty.size) {
      const pids = this.partyDirty;
      this.partyDirty = new Set();
      for (const pid of pids) this.sendParty(pid);
    }

    // Presencia: a cada uno las posiciones nuevas de los demás, juntas, en un único mensaje.
    if (this.dirty.size) {
      const ids = this.dirty;
      this.dirty = new Set();
      const moved = peers.filter((p): p is Peer => !!p && ids.has(p.id)).map(publicPeer);
      for (const [i, w] of socks.entries()) {
        const mine = peers[i]?.id;
        const players = moved.filter((p) => p.id !== mine);
        if (players.length) this.send(w, { t: 'ps', players });
      }
    }

    if (now - this.lastFlush > RANK_FLUSH_MS || !live.length) {
      this.lastFlush = now;
      await this.rank.flush();
    }
    // Mientras haya alguien en el mundo sigue el ciclo; si no, el próximo mensaje de posición lo rearma.
    if (live.length) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const me = ws.deserializeAttachment() as Peer | null;
    if (me) {
      this.broadcast({ t: 'left', id: me.id }, ws);
      this.world.forget(me.id);
      this.leaveParty(ws, false);
      this.invites.delete(me.id);
      for (const [to, inv] of this.invites) if (inv.from === me.id) this.invites.delete(to);
    }
    this.lastInvite.delete(ws);
    this.lastHeal.delete(ws);
    this.lastSent.delete(ws);
    this.lastPos.delete(ws);
    this.lastLb.delete(ws);
    this.lastTyping.delete(ws);
    ws.close();
    this.broadcast({ t: 'online', online: this.ctx.getWebSockets().filter((s) => s !== ws).length });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private send(ws: WebSocket, data: unknown): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* conexión muerta: su close la limpia */
    }
  }

  private broadcast(data: unknown, except?: WebSocket): void {
    const payload = JSON.stringify(data);
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      try {
        s.send(payload);
      } catch {
        /* conexión muerta: su close la limpia */
      }
    }
  }
}
