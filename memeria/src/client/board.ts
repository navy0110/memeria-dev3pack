// Ranking semanal y guerra de bandos (una mascota contra otra). Se pide al servidor al abrir (tecla L, la
// casilla de la barra o el menú) y se refresca solo mientras esté abierto.
import { CLASS_LIST } from '../data';
import type { BoardData, ChatLink } from './net';
import { shareOnX } from './share';
import { sfx } from './sfx';
import { t } from '../i18n';

const REFRESH_S = 10;

export class Board {
  private readonly win: HTMLElement;
  private readonly week: HTMLElement;
  private readonly factions: HTMLElement;
  private readonly list: HTMLElement;
  private readonly me: HTMLElement;
  private readonly share: HTMLButtonElement;
  private open = false;
  private since = 0;
  private data: BoardData | null = null;

  constructor(
    root: Document,
    private readonly link: ChatLink,
    private readonly hero: { clsId: string; clsName: string; key: string },
  ) {
    const q = <T extends HTMLElement>(id: string): T => {
      const el = root.getElementById(id);
      if (!el) throw new Error(`Missing element #${id} in index.html`);
      return el as T;
    };
    this.win = q('board');
    this.week = q('board-week');
    this.factions = q('board-factions');
    this.list = q('board-list');
    this.me = q('board-me');
    this.share = q<HTMLButtonElement>('board-share');
    const slot = q('slot-rank');
    this.win.addEventListener('mousedown', (e) => e.stopPropagation());
    slot.addEventListener('mousedown', (e) => e.stopPropagation());
    slot.addEventListener('click', () => this.toggle());
    q('board-close').addEventListener('click', () => this.toggle(false));
    q('pause-rank').addEventListener('click', () => {
      q('pause').classList.remove('on');
      this.toggle(true);
    });
    this.share.addEventListener('click', () => this.shareRank());
    this.link.onBoard = (b) => {
      this.data = b;
      this.paint();
    };
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.code === 'KeyL') this.toggle();
      else if (e.code === 'Escape' && this.open) this.toggle(false);
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.win.classList.toggle('on', this.open);
    document.getElementById('slot-rank')?.classList.toggle('glow', this.open);
    (this.open ? sfx.open : sfx.cancel)();
    if (this.open) {
      this.since = 0;
      this.paint();
      this.link.requestBoard(this.hero.key);
    }
  }

  update(dt: number): void {
    if (!this.open) return;
    this.since += dt;
    if (this.since >= REFRESH_S) {
      this.since = 0;
      this.link.requestBoard(this.hero.key);
    }
  }

  private shareRank(): void {
    const me = this.data?.me;
    const text = me
      ? t("I'm #{rank} on the Memeria weekly ranking: {k} kills as {cls}. Come take my spot.", { rank: me.rank, k: me.k, cls: this.hero.clsName })
      : t('I\'m playing {cls} in Memeria, a browser RPG of memecoin mascots. Come fight with me.', { cls: this.hero.clsName });
    shareOnX(text);
  }

  private paint(): void {
    const d = this.data;
    this.week.textContent = d ? d.week : '';
    this.factions.replaceChildren();
    this.list.replaceChildren();
    if (!d) {
      this.me.textContent = this.link.live ? t('Loading...') : t('Ranking needs a connection to the server.');
      this.share.disabled = !this.link.live;
      return;
    }
    this.share.disabled = false;

    const total = Math.max(1, ...CLASS_LIST.map((c) => d.factions[c.id] ?? 0));
    for (const c of [...CLASS_LIST].sort((a, b) => (d.factions[b.id] ?? 0) - (d.factions[a.id] ?? 0))) {
      const k = d.factions[c.id] ?? 0;
      const row = document.createElement('div');
      row.className = `fac${c.id === this.hero.clsId ? ' mine' : ''}`;
      const name = document.createElement('span');
      name.textContent = c.name;
      const bar = document.createElement('i');
      bar.style.setProperty('--w', `${Math.round((k / total) * 100)}%`);
      const n = document.createElement('b');
      n.textContent = String(k);
      row.append(name, bar, n);
      this.factions.append(row);
    }

    if (!d.top.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('Nobody has made a kill yet this week. Be the first.');
      this.list.append(li);
    }
    for (const e of d.top) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = e.n;
      const lv = document.createElement('em');
      lv.textContent = t('Lv {n}', { n: e.l });
      const k = document.createElement('b');
      k.textContent = t(e.k === 1 ? '{n} kill' : '{n} kills', { n: e.k });
      li.append(name, lv, k);
      this.list.append(li);
    }
    this.me.textContent = d.me ? t(d.me.k === 1 ? 'You: #{rank} with {n} kill' : 'You: #{rank} with {n} kills', { rank: d.me.rank, n: d.me.k }) : t('You have no kills this week yet.');
  }
}
