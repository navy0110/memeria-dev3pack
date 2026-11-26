// Party: ventana (P) para invitar y ver a tu grupo, cuadros de vida de tus compañeros bajo tu marco,
// aviso de invitación y la elección de a quién curar con Mend (H).
// El servidor lleva la party (worker.ts); acá solo se refleja y se mandan las órdenes.
import { sfx } from './sfx';
import { PARTY, type PartyView } from '../shared/party';
import { t } from '../i18n';
import type { ChatLink } from './net';
import type { Remotes } from './remotes';
import { CLASSES } from '../data';

const FRAME_REFRESH_S = 0.2;
const LIST_REFRESH_S = 1;

interface Io {
  /** Mi id de conexión (cambia al reconectar). */
  myId: () => string;
  /** Mensaje corto sobre el mundo. */
  log: (text: string, seconds?: number) => void;
  /** Línea en el chat. */
  say: (text: string) => void;
}

export class PartyUi {
  /** Mi party; null si estoy solo. */
  party: PartyView | null = null;
  /** Compañero elegido a mano como destino de Mend (click o toque en su cuadro). */
  selected = '';
  private open = false;
  private invite: { from: string; name: string; at: number } | null = null;
  private frameT = 0;
  private listT = 0;
  private readonly win: HTMLElement;
  private readonly members: HTMLElement;
  private readonly online: HTMLElement;
  private readonly count: HTMLElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly frames: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly toastText: HTMLElement;
  private readonly slot: HTMLElement;

  constructor(
    root: Document,
    private readonly link: ChatLink,
    private readonly remotes: Remotes,
    private readonly io: Io,
  ) {
    const q = <T extends HTMLElement>(id: string): T => {
      const el = root.getElementById(id);
      if (!el) throw new Error(`Missing element #${id} in index.html`);
      return el as T;
    };
    this.win = q('partywin');
    this.members = q('party-members');
    this.online = q('party-online');
    this.count = q('party-count');
    this.leaveBtn = q<HTMLButtonElement>('party-leave');
    this.frames = q('pframes');
    this.toast = q('party-invite');
    this.toastText = q('party-invite-text');
    this.slot = q('slot-party');

    for (const el of [this.win, this.slot, this.toast, this.frames]) el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.slot.addEventListener('click', () => this.toggle());
    q('pause-party').addEventListener('click', () => {
      q('pause').classList.remove('on');
      this.toggle(true);
    });
    q('party-close').addEventListener('click', () => this.toggle(false));
    this.leaveBtn.addEventListener('click', () => this.link.party('leave'));
    q('party-accept').addEventListener('click', () => this.answer(true));
    q('party-decline').addEventListener('click', () => this.answer(false));
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.code === 'KeyP') this.toggle();
      else if (e.code === 'Escape' && this.open) this.toggle(false);
      else if (this.invite && e.code === 'KeyY') this.answer(true);
      else if (this.invite && e.code === 'KeyN') this.answer(false);
    });

    link.onPartyInvite = (from, name) => {
      this.invite = { from, name, at: performance.now() };
      this.toastText.textContent = t('{name} invites you to a party.', { name });
      this.toast.classList.add('on');
      sfx.chime();
      this.io.say(t('{name} invites you to a party. Press Y to accept, N to decline (or /accept, /decline).', { name }));
    };
    link.onParty = (p) => this.setParty(p);
    link.onPartyNote = (n) => {
      const text = t(n.s, n.v);
      this.io.say(text);
      if (n.err) {
        sfx.error();
        this.io.log(text, 3);
      }
    };
    link.onStatus = ((prev) => (up: boolean) => {
      prev(up);
      if (!up) {
        this.setParty(null);
        this.dismissInvite();
      }
    })(link.onStatus);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Los demás integrantes (sin mí). */
  get others(): PartyView['members'] {
    const me = this.io.myId();
    return this.party?.members.filter((m) => m.id !== me) ?? [];
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.win.classList.toggle('on', this.open);
    this.slot.classList.toggle('glow', this.open);
    (this.open ? sfx.open : sfx.cancel)();
    if (this.open) {
      this.paintMembers();
      this.paintOnline();
    }
  }

  private setParty(p: PartyView | null): void {
    const was = this.party;
    this.party = p;
    if (p && !was) this.io.log(t('You joined a party. H heals a friend with Mend, /p talks to the party.'), 5);
    if (!p && this.selected) this.selected = '';
    document.body.classList.toggle('inparty', !!p);
    this.remotes.setParty(this.others.map((m) => m.id));
    this.paintMembers();
    this.paintFrames(null);
  }

  private dismissInvite(): void {
    this.invite = null;
    this.toast.classList.remove('on');
  }

  private answer(accept: boolean): void {
    if (!this.invite) return;
    this.link.party(accept ? 'accept' : 'decline');
    if (!accept) this.io.say(t('You declined the invite.'));
    this.dismissInvite();
  }

  /** Comandos de chat de la party. Devuelve true si el texto era uno (y ya se atendió). */
  command(text: string): boolean {
    const m = /^\/(invite|inv|accept|decline|leave|kick|party)\b\s*(.*)$/i.exec(text);
    if (!m) return false;
    const cmd = m[1].toLowerCase();
    const arg = m[2].trim();
    if (cmd === 'party') {
      this.toggle(true);
    } else if (cmd === 'accept') {
      if (this.invite) this.answer(true);
      else this.io.say(t('Nobody has invited you.'));
    } else if (cmd === 'decline') {
      if (this.invite) this.answer(false);
      else this.io.say(t('Nobody has invited you.'));
    } else if (cmd === 'leave') {
      if (this.party) this.link.party('leave');
      else this.io.say(t('You are not in a party.'));
    } else {
      const who = this.find(arg);
      if (!arg) this.io.say(t('Usage: /{cmd} <name>', { cmd }));
      else if (!who) this.io.say(t('No player called "{name}" nearby. Open the Party panel (P) to see who is online.', { name: arg }));
      else if (cmd === 'kick') this.link.party('kick', who.id);
      else this.link.party('invite', who.id);
    }
    return true;
  }

  /** Busca un jugador por nombre: exacto primero, si no por el comienzo. */
  private find(name: string): { id: string; name: string } | undefined {
    const n = name.toLowerCase();
    const all = [...this.remotes.list(), ...this.others];
    return all.find((p) => p.name.toLowerCase() === n) ?? all.find((p) => p.name.toLowerCase().startsWith(n));
  }

  /** A quién curaría Mend ahora: el elegido a mano si está herido y a tiro; si no, el más lastimado a tiro. */
  mendTarget(me: { x: number; z: number }): string | null {
    const inReach = this.others.filter((m) => {
      if (m.maxHp <= 0 || m.hp >= m.maxHp) return false;
      const pos = this.remotes.positionOf(m.id);
      return !!pos && Math.hypot(pos.x - me.x, pos.z - me.z) <= PARTY.mend.range;
    });
    const picked = inReach.find((m) => m.id === this.selected);
    if (picked) return picked.id;
    inReach.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    return inReach[0]?.id ?? null;
  }

  update(dt: number, me: { x: number; z: number }): void {
    if (this.invite && performance.now() - this.invite.at > PARTY.inviteTtlMs) this.dismissInvite();
    this.frameT -= dt;
    if (this.frameT <= 0) {
      this.frameT = FRAME_REFRESH_S;
      this.paintFrames(me);
    }
    if (this.open) {
      this.listT -= dt;
      if (this.listT <= 0) {
        this.listT = LIST_REFRESH_S;
        this.paintOnline();
      }
    }
  }

  // ---- Dibujo ----

  private bar(m: { hp: number; maxHp: number }): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'pbar';
    const fill = document.createElement('i');
    const r = m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 1;
    fill.style.transform = `scaleX(${r.toFixed(3)})`;
    if (r < 0.3) fill.className = 'low';
    const txt = document.createElement('span');
    txt.textContent = m.maxHp > 0 ? `${Math.ceil(m.hp)}/${m.maxHp}` : '';
    bar.append(fill, txt);
    return bar;
  }

  /** Cuadros de vida de los compañeros, bajo mi marco. */
  private paintFrames(me: { x: number; z: number } | null): void {
    const others = this.others;
    this.frames.replaceChildren();
    this.frames.classList.toggle('on', others.length > 0);
    for (const m of others) {
      const pos = me ? this.remotes.positionOf(m.id) : undefined;
      const dist = pos && me ? Math.hypot(pos.x - me.x, pos.z - me.z) : Infinity;
      const row = document.createElement('div');
      row.className = `pf cls-${m.cls}${m.id === this.selected ? ' sel' : ''}${dist > PARTY.mend.range ? ' far' : ''}`;
      const name = document.createElement('b');
      name.textContent = `${m.lvl} ${m.name}`;
      row.append(name, this.bar(m));
      row.addEventListener('click', () => {
        this.selected = this.selected === m.id ? '' : m.id;
        sfx.cursor();
        this.paintFrames(me);
      });
      this.frames.append(row);
    }
  }

  private paintMembers(): void {
    const p = this.party;
    this.members.replaceChildren();
    this.count.textContent = p ? `${p.members.length}/${PARTY.maxSize}` : '';
    this.leaveBtn.hidden = !p;
    if (!p) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('You are not in a party. Invite someone from the list below.');
      this.members.append(li);
      return;
    }
    const me = this.io.myId();
    const iLead = p.leader === me;
    for (const m of p.members) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${m.id === p.leader ? '★ ' : ''}${m.name}${m.id === me ? ` (${t('you')})` : ''}`;
      const lv = document.createElement('em');
      lv.textContent = `${CLASSES[m.cls]?.role ?? m.cls} · ${t('Lv {n}', { n: m.lvl })}`;
      li.append(name, lv);
      if (iLead && m.id !== me) {
        const kick = document.createElement('button');
        kick.type = 'button';
        kick.textContent = t('Remove');
        kick.addEventListener('click', () => this.link.party('kick', m.id));
        li.append(kick);
      }
      this.members.append(li);
    }
  }

  private paintOnline(): void {
    this.online.replaceChildren();
    const inParty = new Set(this.party?.members.map((m) => m.id));
    const full = (this.party?.members.length ?? 0) >= PARTY.maxSize;
    const list = this.remotes.list().sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = this.link.live ? t('Nobody else is around right now.') : t('Parties need a connection to the server.');
      this.online.append(li);
      return;
    }
    for (const p of list) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = p.name;
      const lv = document.createElement('em');
      lv.textContent = `${CLASSES[p.cls]?.role ?? p.cls} · ${t('Lv {n}', { n: p.lvl })}`;
      li.append(name, lv);
      if (!inParty.has(p.id)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t('Invite');
        btn.disabled = full;
        btn.addEventListener('click', () => this.link.party('invite', p.id));
        li.append(btn);
      }
      this.online.append(li);
    }
  }
}
