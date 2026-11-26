import * as THREE from 'three';
import { CLASS_LIST } from '../data';
import { SKINS } from '../data/skins';
import type { PlayerClass } from '../shared/types';
import { buildMascot, type Mascot } from './mascots';
import { sfx } from './sfx';
import { ALIAS_MAX, checkAlias } from '../shared/alias';
import { t } from '../i18n';

// Pantalla de selección de mascota. Un visor 3D chico gira la mascota elegida.
// Resuelve con la clase elegida y se desmonta (renderer incluido).
export interface Choice {
  cls: PlayerClass;
  /** Índice en SKINS. */
  skin: number;
  /** Nombre elegido; sin valor, se usa la wallet abreviada. */
  alias?: string;
}

export function selectClass(root: HTMLElement, aliasFree?: (name: string) => Promise<string | null>): Promise<Choice> {
  // ?cls=<id> salta la pantalla (para pruebas); ?skin=<0..3> elige la paleta.
  const params = new URLSearchParams(location.search);
  const skinParam = Math.max(0, Math.min(SKINS.length - 1, Number(params.get('skin')) || 0));
  const forced = CLASS_LIST.find((c) => c.id === params.get('cls'));
  if (forced) return Promise.resolve({ cls: forced, skin: skinParam });
  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="sel-box">
        <div class="sel-head">
          <h1>Meme <span>RPG</span></h1>
          <p class="sel-sub">${t('Choose your mascot')}</p>
        </div>
        <div class="sel-main">
          <div class="sel-stage">
            <canvas id="sel-view" width="240" height="300"></canvas>
            <div class="sel-skins" id="sel-skins" role="group" aria-label="${t('Color palette')}"></div>
          </div>
          <div class="sel-side">
            <div class="sel-cards" id="sel-cards"></div>
            <div class="sel-detail" id="sel-detail" aria-live="polite"></div>
          </div>
        </div>
        <div class="sel-foot">
          <input id="sel-name" class="sel-name" maxlength="${ALIAS_MAX}" placeholder="${t('Hero name (optional)')}" aria-label="${t('Hero name')}" autocomplete="off" spellcheck="false" />
          <button id="sel-go" class="sel-go">${t('Play')}</button>
          <p class="sel-err" id="sel-err" role="alert"></p>
          <p class="sel-hint">${t('{range} to choose · ← → to change colors · Enter to play', { range: `1 – ${CLASS_LIST.length}` })}</p>
        </div>
      </div>`;
    root.style.display = 'flex';

    const canvas = root.querySelector<HTMLCanvasElement>('#sel-view')!;
    const cardsEl = root.querySelector<HTMLElement>('#sel-cards')!;
    const goBtn = root.querySelector<HTMLButtonElement>('#sel-go')!;
    const skinsEl = root.querySelector<HTMLElement>('#sel-skins')!;
    const detailEl = root.querySelector<HTMLElement>('#sel-detail')!;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setSize(240, 300, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x24203a);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0cf, 1.4);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x3d3560, flatShading: true }));
    floor.position.y = -0.05;
    scene.add(floor);
    const camera = new THREE.PerspectiveCamera(35, 240 / 300, 0.1, 50);
    camera.position.set(0, 2.2, 6.2);
    camera.lookAt(0, 1.35, 0);

    // Una mascota armada por clase y paleta; se arman al verlas por primera vez.
    const mascots = new Map<string, Mascot>();
    let skin = skinParam;
    // ?sel=<id> deja preseleccionada una mascota (para pruebas); por defecto el Shiba.
    let current: PlayerClass = CLASS_LIST.find((c) => c.id === new URLSearchParams(location.search).get('sel')) ?? CLASS_LIST[1];
    let shown: Mascot | null = null;
    let shownTick: (t: number) => void = () => {};

    const pick = (cls: PlayerClass): void => {
      if (current !== cls) sfx.cursor();
      current = cls;
      if (shown) scene.remove(shown.root);
      const key = `${cls.id}:${skin}`;
      let m = mascots.get(key);
      if (!m) {
        m = buildMascot(cls.id, skin);
        mascots.set(key, m);
      }
      m.armR.rotation.x = -0.8;
      m.weapon.rotation.x = m.holdRot;
      shownTick = m.tick;
      scene.add(m.root);
      shown = m;
      cardsEl.querySelectorAll<HTMLElement>('.sel-card').forEach((el) => el.classList.toggle('on', el.dataset.id === cls.id));
      skinsEl.querySelectorAll<HTMLElement>('.sel-skin').forEach((el, i) => el.classList.toggle('on', i === skin));
      detailEl.innerHTML = `
        <span class="st"><u>${t('Health')}</u><s>${bar(cls.maxHp, 140)}</s></span>
        <span class="st"><u>${t('Mana')}</u><s>${bar(cls.maxMp, 100)}</s></span>
        <span class="st"><u>${t('Speed')}</u><s>${bar(cls.speed, 8)}</s></span>
        <span class="st"><u>${t('Damage')}</u><s>${bar(cls.attack.damage / cls.attack.cooldown, 20)}</s></span>
        <small>${cls.blurb}</small>`;
    };

    SKINS.forEach((k, i) => {
      const dot = document.createElement('button');
      dot.className = 'sel-skin';
      dot.title = k.name;
      dot.setAttribute('aria-label', t('{name} palette', { name: k.name }));
      dot.style.setProperty('--sw', k.swatch);
      dot.addEventListener('click', () => setSkin(i));
      skinsEl.appendChild(dot);
    });
    const setSkin = (i: number): void => {
      if (i === skin) return;
      skin = i;
      sfx.cursor();
      pick(current);
    };
    const bar = (v: number, max: number): string => `<i style="width:${Math.round((v / max) * 100)}%"></i>`;
    CLASS_LIST.forEach((cls, i) => {
      const el = document.createElement('button');
      el.className = 'sel-card';
      el.dataset.id = cls.id;
      el.innerHTML = `<b>${i + 1} · ${cls.name}</b><em>${cls.role}</em>`;
      el.addEventListener('click', () => pick(cls));
      cardsEl.appendChild(el);
    });

    let raf = 0;
    const loop = (t: number): void => {
      if (shown) shown.root.rotation.y = t / 1500;
      shownTick(t / 1000);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };

    const nameEl = root.querySelector<HTMLInputElement>('#sel-name')!;
    const errEl = root.querySelector<HTMLElement>('#sel-err')!;
    let checking = false;
    const finish = async (): Promise<void> => {
      if (checking) return;
      let alias: string | undefined;
      if (nameEl.value.trim()) {
        const r = checkAlias(nameEl.value);
        if (!r.ok) {
          errEl.textContent = t(r.error);
          return;
        }
        alias = r.alias;
        if (aliasFree) {
          checking = true;
          errEl.textContent = t('Checking the name...');
          const taken = await aliasFree(alias);
          checking = false;
          if (taken) {
            errEl.textContent = t(taken);
            return;
          }
        }
      }
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      renderer.dispose();
      root.style.display = 'none';
      root.innerHTML = '';
      sfx.confirm();
      resolve({ cls: current, skin, alias });
    };
    const onKey = (e: KeyboardEvent): void => {
      // Escribiendo el nombre, los números y las flechas son del campo, no de la mascota.
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Enter') void finish();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= CLASS_LIST.length) pick(CLASS_LIST[n - 1]);
      if (e.key === 'ArrowRight') setSkin((skin + 1) % SKINS.length);
      if (e.key === 'ArrowLeft') setSkin((skin + SKINS.length - 1) % SKINS.length);
      if (e.key === 'Enter') void finish();
    };
    window.addEventListener('keydown', onKey);
    goBtn.addEventListener('click', () => void finish());

    pick(current);
    raf = requestAnimationFrame(loop);
  });
}
