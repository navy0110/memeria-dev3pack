// Ventana de inventario (tecla I o el botón de la barra de acciones): grilla de casillas,
// monedas y detalle del ítem elegido. Click elige, doble click o el botón Use lo usa.
import type { GameState } from '../shared/game';
import { HOTBAR_SLOTS, TOKEN } from '../shared/rules';
import type { ItemStack } from '../shared/types';
import { itemIcon, rarityName, rarityOf } from './icons';
import { statHtml } from './itemtext';
import { sfx } from './sfx';
import { t } from '../i18n';

const SLOTS = 20;
export const TOKEN_ID = 'mmria-token';

export class Inventory {
  private readonly win: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly bagSlot: HTMLElement;
  private selected: string | null = null;
  private open = false;

  get isOpen(): boolean {
    return this.open;
  }
  private signature = '';
  private readonly equipLine: HTMLElement;
  onMessage: (text: string) => void = () => {};
  /** Canje de las fichas por MMRIA real (lo resuelve el servidor); devuelve el mensaje a mostrar. Sin esto no hay botón. */
  onRedeem: (() => Promise<string>) | null = null;
  private redeeming = false;

  constructor(
    root: Document,
    private readonly game: GameState,
  ) {
    const q = <T extends HTMLElement>(id: string): T => {
      const el = root.getElementById(id);
      if (!el) throw new Error(`Missing element #${id} in index.html`);
      return el as T;
    };
    this.win = q('inventory');
    this.grid = q('inv-grid');
    this.coins = q('inv-coins');
    this.detail = q('inv-detail');
    this.useBtn = q<HTMLButtonElement>('inv-use');
    this.bagSlot = q('slot-bag');
    this.equipLine = q('inv-equip');

    // El click dentro de la ventana no debe girar la cámara (el arrastre se lee en window).
    this.win.addEventListener('mousedown', (e) => e.stopPropagation());
    this.bagSlot.addEventListener('mousedown', (e) => e.stopPropagation());
    this.bagSlot.addEventListener('click', () => this.toggle());
    q('inv-close').addEventListener('click', () => this.toggle(false));
    this.useBtn.addEventListener('click', () => this.use());

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.code === 'KeyI') this.toggle();
      else if (e.code === 'Escape' && this.open) this.toggle(false);
      else if (this.open && this.selected) {
        // Con la mochila abierta, un número manda el consumible elegido a esa casilla de la barra.
        const slot = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
        if (slot && Number(slot) <= HOTBAR_SLOTS) this.assign(Number(slot) - 1);
      }
    });
  }

  private toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.win.classList.toggle('on', this.open);
    this.bagSlot.classList.toggle('glow', this.open);
    (this.open ? sfx.open : sfx.cancel)();
    this.signature = '';
    this.update();
  }

  private assign(slot: number): void {
    if (!this.selected) return;
    const msg = this.game.assignHotbar(slot, this.selected);
    if (msg === null) return;
    sfx.confirm();
    this.signature = '';
    this.update();
    this.onMessage(msg);
  }

  /** Canje de fichas por MMRIA real: pregunta al servidor y muestra lo que respondió. */
  private async redeem(): Promise<void> {
    if (!this.onRedeem || this.redeeming) return;
    this.redeeming = true;
    this.signature = '';
    this.update();
    try {
      this.onMessage(await this.onRedeem());
      sfx.confirm();
    } finally {
      this.redeeming = false;
      this.signature = '';
      this.update();
    }
  }

  private use(): void {
    if (!this.selected) return;
    if (this.selected === TOKEN_ID) {
      void this.redeem();
      return;
    }
    const def = this.game.itemDefs[this.selected];
    let msg: string | null;
    let ok = true;
    if (def?.slot) {
      // Equipo: si ya está puesto se quita; si no, se equipa (y puede rechazarlo por nivel o clase).
      if (this.game.isEquipped(def.id)) msg = this.game.unequip(def.slot);
      else {
        msg = this.game.equip(def.id);
        ok = msg?.startsWith(t('You equip {name}', { name: '' })) ?? false;
      }
    } else {
      msg = this.game.useItem(this.selected);
    }
    if (msg === null || !ok) {
      if (msg !== null) this.onMessage(msg);
      sfx.error();
      return;
    }
    sfx.confirm();
    this.signature = '';
    this.update();
    this.onMessage(msg);
  }

  /** Redibuja solo si cambió algo (la grilla es DOM, no se toca por frame). */
  update(): void {
    if (!this.open) return;
    // Las fichas MMRIA no están en la mochila guardada: el servidor las cuenta, y acá se ven como una casilla más al principio.
    const inv: ItemStack[] = [...(this.game.tokens > 0 ? [{ id: TOKEN_ID, qty: this.game.tokens }] : []), ...this.game.inventory];
    const eq = this.game.equipment;
    const bar = this.game.hotbar.join(',');
    const sig = `${this.game.coins}|${this.selected}|${this.game.player.level}|${eq.weapon}|${eq.armor}|${bar}|${this.redeeming}|${inv.map((i) => `${i.id}:${i.qty}`).join(',')}`;
    if (sig === this.signature) return;
    this.signature = sig;

    if (this.selected && !inv.some((i) => i.id === this.selected)) this.selected = null;
    this.coins.textContent = `${this.game.coins} coins`;
    const name = (id?: string): string => (id ? this.game.itemDefs[id].name : t('none'));
    this.equipLine.innerHTML = `<b>${t('Weapon')}</b> ${name(eq.weapon)} · <b>${t('Armor')}</b> ${name(eq.armor)} · ${t('Attack')} ${this.game.attackPower} · ${t('Defense')} ${this.game.defense}`;

    this.grid.replaceChildren();
    for (let i = 0; i < SLOTS; i++) {
      const stack = inv[i];
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      if (stack) {
        const def = this.game.itemDefs[stack.id];
        if (stack.id === this.selected) cell.classList.add('sel');
        if (this.game.isEquipped(stack.id)) cell.classList.add('eq');
        const slot = this.game.hotbar.indexOf(stack.id);
        if (slot >= 0) cell.dataset.bar = String(slot + 1);
        const ico = document.createElement('span');
        ico.className = 'ico';
        if (def) {
          cell.classList.add(`r-${rarityOf(def)}`);
          ico.innerHTML = itemIcon(def);
          cell.title = def.name;
        } else ico.textContent = '?';
        cell.append(ico);
        if (stack.qty > 1) {
          const n = document.createElement('i');
          n.textContent = String(stack.qty);
          cell.append(n);
        }
        cell.addEventListener('click', () => {
          this.selected = stack.id;
          sfx.cursor();
          this.signature = '';
          this.update();
        });
        cell.addEventListener('dblclick', () => {
          this.selected = stack.id;
          this.use();
        });
      }
      this.grid.append(cell);
    }

    const def = this.selected ? this.game.itemDefs[this.selected] : null;
    if (def) {
      const stats = statHtml(def, this.game);
      const rar = rarityOf(def);
      const slot = this.game.hotbar.indexOf(def.id);
      const hint =
        def.heal !== undefined
          ? `<span class="hint">${slot >= 0 ? t('On key {n}.', { n: `<b>${slot + 1}</b>` }) + ' ' : ''}${t('Press {keys} to put it on the quick bar.', { keys: `<b>1</b>-<b>${HOTBAR_SLOTS}</b>` })}</span>`
          : def.id === TOKEN_ID
            ? `<span class="hint">${t('{per} tokens = 1 MMRIA. Minimum {min}. Rewards are sent to your wallet automatically, up to a daily limit; this is not an investment.', { per: TOKEN.perMmria, min: TOKEN.redeemMin })}</span>`
            : '';
      this.detail.innerHTML = `<b class="r-${rar}">${def.name}</b><em class="r-${rar}">${rarityName(rar)} ${t(def.kind)}</em>${stats ? `<span class="stats">${stats}</span>` : ''}<p>${def.desc}</p>${hint}`;
      if (def.id === TOKEN_ID) {
        this.useBtn.disabled = this.redeeming || !this.onRedeem || this.game.tokens < TOKEN.redeemMin;
        this.useBtn.textContent = this.redeeming ? t('Sending...') : `${t('Redeem')}${this.game.tokens >= TOKEN.redeemMin ? ` ${(this.game.tokens / TOKEN.perMmria).toFixed(2)} MMRIA` : ` (${t('min {n}', { n: TOKEN.redeemMin })})`}`;
      } else {
        const usable = def.heal !== undefined || def.slot !== undefined;
        this.useBtn.disabled = !usable;
        this.useBtn.textContent = def.slot ? (this.game.isEquipped(def.id) ? t('Take off') : t('Equip')) : t('Use');
      }
    } else {
      this.detail.innerHTML = inv.length === 0 ? `<p class="dim">${t('Your bags are empty.')}</p>` : `<p class="dim">${t('Select an item.')}</p>`;
      this.useBtn.disabled = true;
      this.useBtn.textContent = 'Use';
    }
  }
}
