// Barra de consumibles: las teclas 1 a 5 usan lo que haya en cada casilla (pociones, comida), sin abrir la mochila.
// Qué va en cada casilla lo decide el juego (GameState.hotbar): lo nuevo ocupa la primera libre y desde la mochila
// se reasigna con un número. Acá solo se dibuja y se escuchan las teclas.
import type { GameState } from '../shared/game';
import { HOTBAR_SLOTS } from '../shared/rules';
import { itemIcon, rarityOf } from './icons';
import { sfx } from './sfx';
import { t } from '../i18n';

/** Segundos entre un consumible y el siguiente: evita gastar dos pociones de un golpe de teclado. */
const SHARED_COOLDOWN = 0.9;

export class Hotbar {
  private readonly slots: HTMLElement[] = [];
  private signature = '';
  private cooldown = 0;
  onMessage: (text: string) => void = () => {};
  /** Se llama tras usar un consumible (para guardar). */
  onUsed: () => void = () => {};

  constructor(
    root: Document,
    private readonly game: GameState,
  ) {
    const bar = root.getElementById('hotbar');
    if (!bar) throw new Error('Missing element #hotbar in index.html');
    bar.addEventListener('mousedown', (e) => e.stopPropagation());
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = root.createElement('button');
      slot.type = 'button';
      slot.className = 'hb-slot';
      slot.innerHTML = `<i class="key">${i + 1}</i><span class="ico"></span><b class="qty"></b><div class="cd"></div>`;
      slot.addEventListener('click', () => this.use(i));
      bar.append(slot);
      this.slots.push(slot);
    }
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      // Con la mochila abierta los números sirven para asignar, no para usar.
      if (n && Number(n) <= HOTBAR_SLOTS && !document.getElementById('inventory')?.classList.contains('on')) this.use(Number(n) - 1);
    });
  }

  private use(slot: number): void {
    if (this.cooldown > 0 || this.game.player.hp <= 0) return;
    const id = this.game.hotbar[slot];
    if (!id) return;
    const msg = this.game.useHotbar(slot);
    if (msg === null) return;
    // «Ya tenés la vida llena» y «te quedaste sin» no gastan nada: suena el rechazo y no hay enfriamiento.
    if (/already full|out of/i.test(msg)) {
      sfx.error();
      this.onMessage(msg);
      return;
    }
    sfx.confirm();
    this.cooldown = SHARED_COOLDOWN;
    this.slots[slot].classList.remove('used');
    void this.slots[slot].offsetWidth; // reinicia el destello
    this.slots[slot].classList.add('used');
    this.onMessage(msg);
    this.onUsed();
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const g = this.game;
    const sig = g.hotbar.map((id) => `${id}:${g.inventory.find((i) => i.id === id)?.qty ?? 0}`).join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      g.hotbar.forEach((id, i) => {
        const slot = this.slots[i];
        const def = id ? g.itemDefs[id] : undefined;
        const qty = id ? (g.inventory.find((s) => s.id === id)?.qty ?? 0) : 0;
        slot.className = `hb-slot${def ? ` r-${rarityOf(def)}` : ' empty'}${def && qty === 0 ? ' dry' : ''}`;
        slot.title = def ? t('{name} (key {n})', { name: def.name, n: i + 1 }) : t('Empty (open the bag, select a potion and press {n})', { n: i + 1 });
        slot.querySelector('.ico')!.innerHTML = def ? itemIcon(def) : '';
        slot.querySelector('.qty')!.textContent = def ? String(qty) : '';
      });
    }
    // Enfriamiento compartido: el velo gira igual en todas las casillas ocupadas.
    const deg = `${Math.round((this.cooldown / SHARED_COOLDOWN) * 120) * 3}deg`;
    for (const slot of this.slots) slot.style.setProperty('--cd', deg);
  }
}
