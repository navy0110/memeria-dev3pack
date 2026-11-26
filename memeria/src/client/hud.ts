import type { GameState } from '../shared/game';
import { t } from '../i18n';
import { PARTY } from '../shared/party';

const PORTRAIT: Record<string, { color: string; letter: string }> = {
  pepe: { color: '#4f9a3a', letter: 'P' },
  shiba: { color: '#e58a3c', letter: 'S' },
  doge: { color: '#e0b24a', letter: 'D' },
  popcat: { color: '#f0e6e4', letter: 'C' },
  wif: { color: '#ff7fb0', letter: 'W' },
};

// HUD en DOM: marco del personaje (retrato, nivel, vida, magia), XP, barra de acciones con
// enfriamientos, misión en curso, diálogo y avisos. Escribe el DOM solo cuando cambia algo
// (evita trabajo de layout por frame).
export class Hud {
  private readonly el = new Map<string, HTMLElement>();
  private readonly text = new Map<HTMLElement, string>();
  private readonly style = new Map<string, string>();
  private time = 0;
  private logUntil = 0;
  private logText = '';
  private dialogUntil = 0;
  private flashUntil = 0;

  constructor(private readonly root: Document) {}

  private q(id: string): HTMLElement {
    let e = this.el.get(id);
    if (!e) {
      const found = this.root.getElementById(id);
      if (!found) throw new Error(`Missing element #${id} in index.html`);
      e = found;
      this.el.set(id, e);
    }
    return e;
  }

  /** Mensaje corto (toast) durante `seconds`. */
  log(text: string, seconds = 2.5): void {
    this.logText = text;
    this.logUntil = this.time + seconds;
  }

  /** Línea de diálogo de un NPC; el tiempo en pantalla crece con el largo del texto. */
  say(who: string, text: string): void {
    this.q('dialog-who').textContent = who;
    this.q('dialog-text').textContent = text;
    this.q('dialog').classList.add('on');
    this.dialogUntil = this.time + Math.max(5, text.length / 13);
  }

  /** Cartel grande al centro (subida de nivel, capítulo, etc.). */
  banner(title: string, sub = ''): void {
    const b = this.q('banner');
    this.q('banner-title').textContent = title;
    this.q('banner-sub').textContent = sub;
    b.classList.remove('on');
    void b.offsetWidth; // reinicia la animación
    b.classList.add('on');
  }

  /** Destello rojo de borde al recibir daño. */
  hurt(): void {
    this.flashUntil = this.time + 0.3;
  }

  update(game: GameState, dt: number): void {
    this.time += dt;
    const p = game.player;
    const cls = game.cls;

    // Marco del personaje
    const portrait = PORTRAIT[cls.id] ?? { color: '#777', letter: cls.name[0] };
    this.setStyle('portrait', '--portrait', portrait.color);
    this.setText(this.q('portrait-letter'), portrait.letter);
    this.setText(this.q('lvl'), String(p.level));
    this.setText(this.q('unit-name'), p.name);
    this.setText(this.q('unit-role'), cls.role);
    const hpRatio = p.hp / p.maxHp;
    this.setBar('hp-fill', hpRatio);
    this.setBar('hp-lag', hpRatio);
    this.q('hp-bar').classList.toggle('low', hpRatio < 0.25 && p.hp > 0);
    this.setText(this.q('hp-text'), `${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.setBar('mp-fill', p.mp / p.maxMp);
    this.setText(this.q('mp-text'), `${Math.floor(p.mp)} / ${p.maxMp}`);

    // Viñeta: pulso rojo con poca vida y destello al recibir un golpe
    const low = hpRatio < 0.3 && p.hp > 0 ? (0.3 - hpRatio) / 0.3 : 0;
    const flash = this.time < this.flashUntil ? 0.8 : 0;
    this.setStyle('vignette', 'opacity', String(Math.max(flash, low * 0.7).toFixed(2)));

    // XP
    const maxed = p.xpToNext === 0;
    this.setBar('xp-fill', maxed ? 1 : p.xp / p.xpToNext);
    this.setText(this.q('xp-text'), maxed ? t('LEVEL {n} · MAX', { n: p.level }) : t('LEVEL {n} · {xp} / {next} XP', { n: p.level, xp: p.xp, next: p.xpToNext }));

    // Zona
    const safe = game.inSafeZone ? `<b>${t('SAFE')}</b>` : '';
    this.setHtml(this.q('zone'), `${game.zoneLabel}${safe}<small>${t('Kills')} ${p.kills}</small>`);

    // Barra de acciones
    const atkCd = p.attackCd / cls.attack.cooldown;
    this.setCooldown('slot-attack', atkCd);
    const skCd = p.skillCd / cls.skill.cooldown;
    this.setCooldown('slot-skill', skCd);
    this.setText(this.q('skill-name'), cls.skill.name);
    this.setText(this.q('skill-cost'), `${cls.skill.cost}`);
    this.setText(this.q('skill-cdt'), p.skillCd > 0 ? p.skillCd.toFixed(1) : '');
    this.q('slot-skill').classList.toggle('off', p.mp < cls.skill.cost && p.skillCd <= 0);
    this.setCooldown('slot-mend', p.mendCd / PARTY.mend.cooldown);
    this.setText(this.q('mend-cost'), `${PARTY.mend.cost}`);
    this.setText(this.q('mend-cdt'), p.mendCd > 0 ? p.mendCd.toFixed(1) : '');
    this.q('slot-mend').classList.toggle('off', p.mp < PARTY.mend.cost && p.mendCd <= 0);
    this.q('slot-talk').classList.toggle('glow', game.nearbyNpc() !== null);

    this.updateQuest(game);

    // Toast y diálogo
    this.setText(this.q('log'), this.time < this.logUntil ? this.logText : '');
    if (this.time >= this.dialogUntil) this.q('dialog').classList.remove('on');
  }

  private updateQuest(game: GameState): void {
    const box = this.q('quest');
    const tracked = game.trackedQuest;
    const npcName = (defId: string): string => game.npcs.find((n) => n.npcId === defId)?.name ?? defId;
    let html: string;
    if (tracked) {
      const { def, state } = tracked;
      const ready = state.status === 'ready';
      const obj = ready
        ? t('Return to {name}', { name: npcName(def.giver) })
        : t('Defeat {name}: {n}/{total}', { name: def.targetName, n: state.progress, total: def.count });
      html = `<div class="q-head">${def.chapter ?? t('Quest')}</div><div class="q-title">${def.title} <span class="q-lvl">${t('Lv {n}', { n: def.level })}</span></div><div class="q-obj${ready ? ' ready' : ''}">${obj}</div>`;
    } else {
      const next = game.quests.find((s) => s.status === 'available');
      if (next) {
        const def = game.questDefs[next.id];
        html = `<div class="q-head">${t('New quest')} · ${def.chapter ?? ''}</div><div class="q-title">${def.title} <span class="q-lvl">${t('Lv {n}', { n: def.level })}</span></div><div class="q-obj">${t('Speak to {name}', { name: npcName(def.giver) })}</div>`;
      } else {
        html = `<div class="q-head">${t('Epilogue')}</div><div class="q-title">${t('The Ledger is whole')}</div><div class="q-obj ready">${t('Read the seventh page by the Lantern Well.')}</div>`;
      }
    }
    this.setHtml(box, html);
  }

  private setCooldown(id: string, ratio: number): void {
    // Cuantizado a pasos de 3 grados para no escribir el estilo en cada frame.
    const deg = Math.round(Math.max(0, Math.min(1, ratio)) * 120) * 3;
    this.setStyle(id, '--cd', `${deg}deg`, this.q(id).querySelector<HTMLElement>('.cd')!);
  }

  private setBar(id: string, ratio: number): void {
    this.setStyle(id, 'transform', `scaleX(${Math.max(0, Math.min(1, ratio)).toFixed(3)})`);
  }

  private setStyle(id: string, prop: string, value: string, target: HTMLElement = this.q(id)): void {
    const key = `${id}|${prop}`;
    if (this.style.get(key) === value) return;
    this.style.set(key, value);
    target.style.setProperty(prop, value);
  }

  private setText(el: HTMLElement, text: string): void {
    if (this.text.get(el) === text) return;
    this.text.set(el, text);
    el.textContent = text;
  }

  private setHtml(el: HTMLElement, html: string): void {
    if (this.text.get(el) === html) return;
    this.text.set(el, html);
    el.innerHTML = html;
  }
}
