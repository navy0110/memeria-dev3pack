// Ventana de tienda: se abre sola cuando el juego marca una tienda (hablar con Gary, Dan o Tom con F)
// y se cierra al alejarse, con × o con Escape. Pestañas Buy y Sell; la posada ofrece descansar.
// En la herrería, una vista previa 3D muestra las armas, empezando por la especial de tu clase.
import type { GameState } from '../shared/game';
import type { ItemDef } from '../shared/types';
import { itemIcon, rarityName, rarityOf } from './icons';
import { statHtml, usableByClass } from './itemtext';
import { sfx } from './sfx';
import { WeaponPreview } from './weaponpreview';
import { t } from '../i18n';

type Tab = 'buy' | 'sell';

export class Shop {
  private readonly win: HTMLElement;
  private readonly title: HTMLElement;
  private readonly greet: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly list: HTMLElement;
  private readonly tabBar: HTMLElement;
  private readonly tabs: HTMLButtonElement[];
  private readonly previewBox: HTMLElement;
  private readonly previewName: HTMLElement;
  private readonly previewCanvas: HTMLCanvasElement;
  private preview: WeaponPreview | null = null;
  private previewId: string | null = null;
  private tab: Tab = 'buy';
  private signature = '';
  private wasOpen = false;
  onMessage: (text: string) => void = () => {};
  /** Compra de un ítem de MMRIA real (lo resuelve main con la wallet y el servidor). */
  onBuyMmria: (def: ItemDef) => void = () => {};
  /** Mientras hay un pago en curso, los botones de MMRIA quedan quietos. */
  paying = false;
  /** Texto del saludo del NPC; lo fija main al recibir el evento `shop`. */
  greeting = '';

  constructor(
    root: Document,
    private readonly game: GameState,
  ) {
    const q = <T extends HTMLElement>(id: string): T => {
      const el = root.getElementById(id);
      if (!el) throw new Error(`Missing element #${id} in index.html`);
      return el as T;
    };
    this.win = q('shop');
    this.title = q('shop-title');
    this.greet = q('shop-greet');
    this.coins = q('shop-coins');
    this.list = q('shop-list');
    this.previewBox = q('shop-preview-box');
    this.previewName = q('shop-preview-name');
    this.previewCanvas = q<HTMLCanvasElement>('shop-preview');
    this.tabBar = this.win.querySelector<HTMLElement>('.shop-tabs')!;
    this.tabs = Array.from(this.win.querySelectorAll<HTMLButtonElement>('[data-shop-tab]'));
    this.win.addEventListener('mousedown', (e) => e.stopPropagation());
    q('shop-close').addEventListener('click', () => this.close());
    for (const b of this.tabs) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.shopTab as Tab;
        sfx.cursor();
        this.signature = '';
        this.update();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.game.openShop) this.close();
    });
  }

  private close(): void {
    this.game.closeShop();
    sfx.cancel();
    this.update();
  }

  private act(result: string | null): void {
    if (result === null) return;
    const failed = /^(Not enough|You already|Take off)/.test(result);
    (failed ? sfx.error : sfx.confirm)();
    this.signature = '';
    this.update();
    this.onMessage(result);
  }

  /** Arma en la vista previa; solo para ítems con aspecto de arma de la clase del héroe. */
  private showPreview(def: ItemDef): void {
    if (!def.look || !def.slot) return;
    this.preview ??= new WeaponPreview(this.previewCanvas);
    this.preview.show(this.game.cls.id, def.look);
    this.previewId = def.id;
    const price = def.mmria !== undefined ? `${def.mmria.toLocaleString('en-US')} MMRIA` : def.buy !== undefined ? t('{n} coins', { n: def.buy }) : '';
    const tag = def.rarity === 'legendary' ? `<b>${t('LEGENDARY')}</b> · ` : '';
    this.previewName.innerHTML = `${tag}${def.name}${price ? ` · ${price}` : ''}`;
  }

  /** Al abrir una herrería: arrancar con la legendaria de la clase, que es la que da ganas. */
  private openPreview(stock: string[]): void {
    const g = this.game;
    const weapons = stock.map((id) => g.itemDefs[id]).filter((d): d is ItemDef => !!d?.look && usableByClass(d, g));
    const first = weapons.find((d) => d.rarity === 'legendary') ?? weapons[0];
    this.previewBox.classList.toggle('on', !!first);
    if (first) {
      this.showPreview(first);
      this.preview!.start();
    }
  }

  update(): void {
    const shop = this.game.openShop;
    if (!shop) {
      if (this.wasOpen) {
        this.win.classList.remove('on');
        this.preview?.stop();
        this.wasOpen = false;
        this.previewId = null;
      }
      return;
    }
    if (!this.wasOpen) {
      this.wasOpen = true;
      this.tab = 'buy';
      this.signature = '';
      this.win.classList.add('on');
      this.openPreview(shop.def.stock);
      sfx.open();
    }
    const g = this.game;
    const sig = `${shop.npc.id}|${this.tab}|${g.coins}|${g.player.level}|${g.player.hp}|${g.inventory.map((i) => `${i.id}:${i.qty}`).join(',')}|${g.equipment.weapon}|${g.equipment.armor}|${g.payments}|${this.paying}`;
    if (sig === this.signature) return;
    this.signature = sig;

    this.title.textContent = `${shop.npc.name} · ${shop.npc.title}`;
    this.greet.textContent = this.greeting;
    this.coins.textContent = t('{n} coins', { n: g.coins });
    const inn = shop.def.restPerLevel !== undefined;
    this.tabBar.hidden = inn;
    for (const b of this.tabs) b.classList.toggle('on', b.dataset.shopTab === this.tab);

    this.list.replaceChildren();
    if (inn) {
      const cost = shop.def.restPerLevel! * g.player.level;
      const rested = g.player.hp >= g.player.maxHp && g.player.mp >= g.player.maxMp;
      this.row({ icon: '☾', color: '#9fd0ff', name: t('A bed for the night'), stats: t('Restores all health and mana'), price: `${cost}c`, label: rested ? t('Rested') : t('Rest'), disabled: rested || g.coins < cost, broke: !rested && g.coins < cost, onClick: () => this.act(g.rest()) });
    } else if (this.tab === 'buy') {
      const buyable = shop.def.stock.map((id) => g.itemDefs[id]).filter((d): d is ItemDef => !!d && (d.buy !== undefined || d.mmria !== undefined) && usableByClass(d, g));
      for (const def of buyable.filter((d) => d.mmria === undefined)) {
        const owned = !!def.slot && g.inventory.some((i) => i.id === def.id);
        const afford = g.coins >= def.buy!;
        this.row({ def, icon: def.icon, color: def.color, name: def.name, stats: statHtml(def, g), price: `${def.buy}c`, label: owned ? t('Owned') : t('Buy'), disabled: owned || !afford, broke: !afford && !owned, onClick: () => this.act(g.buy(def.id)) });
      }
      const legends = buyable.filter((d) => d.mmria !== undefined);
      if (legends.length > 0) {
        const sep = document.createElement('h4');
        sep.className = 'shop-sep';
        sep.textContent = t('Legendary · paid in MMRIA');
        this.list.append(sep);
        for (const def of legends) {
          const owned = g.inventory.some((i) => i.id === def.id);
          this.row({ def, icon: def.icon, color: def.color, name: def.name, stats: statHtml(def, g), price: `${def.mmria!.toLocaleString('en-US')} MMRIA`, mmria: true, legend: true, label: owned ? t('Owned') : this.paying ? t('Paying...') : g.payments ? t('Buy') : t('Soon'), disabled: owned || this.paying || !g.payments, onClick: () => this.onBuyMmria(def) });
        }
      }
    } else {
      let any = false;
      for (const stack of g.inventory) {
        const def = g.itemDefs[stack.id];
        if (!def || def.sell === undefined) continue;
        any = true;
        const worn = g.isEquipped(stack.id);
        const name = stack.qty > 1 ? `${def.name} ×${stack.qty}` : def.name;
        this.row({ def, icon: def.icon, color: def.color, name, stats: statHtml(def, g), price: `${def.sell}c`, label: worn ? t('Worn') : t('Sell'), disabled: worn, onClick: () => this.act(g.sell(stack.id)) });
      }
      if (!any) this.list.innerHTML = `<p class="dim">${t('Nothing to sell. Pelts and wisps from your hunts fetch a fair price.')}</p>`;
    }
  }

  private row(o: { def?: ItemDef; icon: string; color: string; name: string; stats: string; price: string; label: string; disabled: boolean; broke?: boolean; mmria?: boolean; legend?: boolean; onClick: () => void }): void {
    const row = document.createElement('div');
    const rar = o.def ? rarityOf(o.def) : null;
    row.className = `shop-row${o.legend ? ' legend' : ''}${rar ? ` r-${rar}` : ''}`;
    const ico = document.createElement('span');
    if (o.def) {
      ico.className = 'ico svg';
      ico.innerHTML = itemIcon(o.def);
    } else {
      ico.className = 'ico';
      ico.textContent = o.icon;
      ico.style.color = o.color;
    }
    const info = document.createElement('div');
    info.className = 'shop-info';
    const b = document.createElement('b');
    b.textContent = o.name;
    if (rar) {
      const tag = document.createElement('em');
      tag.className = 'rtag';
      tag.textContent = rarityName(rar);
      b.append(' ', tag);
    }
    const small = document.createElement('small');
    small.innerHTML = o.stats;
    info.append(b, small);
    const p = document.createElement('span');
    p.className = `shop-price${o.broke ? ' bad' : ''}${o.mmria ? ' mmria' : ''}`;
    p.textContent = o.price;
    const btn = document.createElement('button');
    btn.textContent = o.label;
    btn.disabled = o.disabled;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      o.onClick();
    });
    row.append(ico, info, p, btn);
    // Tocar un arma la muestra en la vista previa.
    const def = o.def;
    if (def?.look && this.previewBox.classList.contains('on')) {
      row.classList.add('pickable');
      row.addEventListener('click', () => {
        if (this.previewId === def.id) return;
        sfx.cursor();
        this.showPreview(def);
      });
    }
    this.list.append(row);
  }
}
