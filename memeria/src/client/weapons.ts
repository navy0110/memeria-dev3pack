import * as THREE from 'three';
import type { WeaponFxKind, WeaponLook } from '../shared/types';

// Armas armadas con cajas. La forma sale de la clase (espada, daga, bastón, bo, arco) y el
// aspecto lo da `WeaponLook`: colores, brillo propio y efectos animados. Las armas de tier
// bajo son sobrias; las especiales brillan, largan chispas y orbitan, para que dé ganas de pagarlas.
//
// Las piezas se modelan en las coordenadas del hombro, igual que las armas de las mascotas:
// la mano está en y = -0.75 y la hoja o el astil se extienden desde ahí.

export type Family = 'sword' | 'dagger' | 'staff' | 'bo' | 'bow';

export const FAMILY: Record<string, Family> = { shiba: 'sword', doge: 'dagger', pepe: 'staff', popcat: 'bo', wif: 'bow' };

/** Lo que lleva cada clase cuando no tiene arma equipada. */
export const DEFAULT_LOOKS: Record<string, WeaponLook> = {
  shiba: { blade: 0xdfe5ee, trim: 0xc9a24a },
  doge: { blade: 0xf4e3a3, trim: 0xe0b23a },
  pepe: { blade: 0xffd23f, trim: 0x3d7d2c },
  popcat: { blade: 0x6b4a2b, trim: 0xd94a3d },
  wif: { blade: 0x7a5230, trim: 0xd9b56c },
};

export interface Weapon {
  group: THREE.Group;
  tick: (t: number) => void;
}

/** Dónde ocurren los efectos: el eje del arma, su punta y la caja del halo. */
interface Anchor {
  focus: { y: number; z: number; len: number; wid: number };
  head: { y: number; z: number };
  halo: { y: number; z: number; w: number; h: number; d: number };
}

/** Mancha de luz suave (degradé radial) para los halos: un sprite aditivo que mira siempre a la cámara. */
let softTexture: THREE.CanvasTexture | null = null;
function soft(): THREE.CanvasTexture {
  if (softTexture) return softTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  softTexture = new THREE.CanvasTexture(c);
  softTexture.colorSpace = THREE.SRGBColorSpace;
  return softTexture;
}

const lighten = (color: number, k: number): number => new THREE.Color(color).lerp(new THREE.Color(0xffffff), k).getHex();

function stdMat(color: number, glow?: number, intensity = 1.2): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, flatShading: true });
  if (glow !== undefined) {
    m.emissive = new THREE.Color(glow);
    m.emissiveIntensity = intensity;
  }
  return m;
}

function addMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const HILT = 0x6b4a2b;

/** Espada o daga: `len` es el largo de la hoja en unidades de espada larga. */
function sword(g: THREE.Group, look: WeaponLook, len: number, wide: number): Anchor {
  // Las armas con efectos son más anchas: la hoja gana presencia además del brillo.
  const blade = stdMat(look.blade, look.glow, 0.5);
  const edge = stdMat(lighten(look.blade, 0.35), look.glow, 1.5);
  const trim = stdMat(look.trim);
  const mid = -(0.5 + len);
  box(g, 0.16 * wide, 2 * len, 0.07, blade, 0, mid, 0.05);
  box(g, 0.07 * wide, 1.9 * len, 0.09, edge, 0, mid, 0.05);
  box(g, 0.1 * wide, 0.3, 0.06, blade, 0, -(0.5 + 2 * len) - 0.15, 0.05); // punta
  box(g, 0.7 * wide, 0.1, 0.16, trim, 0, -0.5, 0.05); // guarda
  box(g, 0.1, 0.26, 0.1, stdMat(HILT), 0, -0.3, 0.05);
  box(g, 0.16, 0.12, 0.16, trim, 0, -0.14, 0.05); // pomo
  return {
    focus: { y: mid, z: 0.05, len: 2 * len, wid: 0.16 * wide },
    head: { y: -(0.5 + 2 * len) - 0.2, z: 0.05 },
    halo: { y: mid, z: 0.05, w: 0.5 * wide, h: 2 * len + 0.4, d: 0.36 },
  };
}

/** Bastón de mago: astil, engarce, orbe y dos cristales. */
function staff(g: THREE.Group, look: WeaponLook, bulk: number): Anchor {
  const orb = stdMat(look.blade, look.glow, 1.6);
  const trim = stdMat(look.trim);
  const ob = 0.42 * (1 + (bulk - 1) * 1.3);
  box(g, 0.12 * Math.sqrt(bulk), 2.8, 0.12 * Math.sqrt(bulk), stdMat(HILT), 0, -0.35, 0.35);
  box(g, 0.34 * bulk, 0.12, 0.34 * bulk, trim, 0, 0.95, 0.35);
  const o = box(g, ob, ob, ob, orb, 0, 1.25 + (ob - 0.42) / 2, 0.35);
  o.rotation.set(0.6, 0.6, 0);
  box(g, 0.14, 0.34, 0.14, stdMat(lighten(look.blade, 0.4), look.glow, 1.1), 0.28, 1.0, 0.35);
  box(g, 0.14, 0.34, 0.14, stdMat(lighten(look.blade, 0.4), look.glow, 1.1), -0.28, 1.0, 0.35);
  return {
    focus: { y: 0.2, z: 0.35, len: 2.8, wid: 0.12 },
    head: { y: 1.25, z: 0.35 },
    halo: { y: 1.25, z: 0.35, w: 0.95 * bulk, h: 0.95 * bulk, d: 0.95 * bulk },
  };
}

/** Bo del monje: caña con remates y bandas. */
function bo(g: THREE.Group, look: WeaponLook, bulk: number): Anchor {
  const shaft = stdMat(look.blade, look.glow, 0.5);
  const trim = stdMat(look.trim, look.glow, 0.9);
  box(g, 0.11 * bulk, 2.4, 0.11 * bulk, shaft, 0, -0.35, 0.35);
  box(g, 0.2 * bulk, 0.28, 0.2 * bulk, trim, 0, 0.85, 0.35);
  box(g, 0.2 * bulk, 0.28, 0.2 * bulk, trim, 0, -1.55, 0.35);
  box(g, 0.17 * bulk, 0.1, 0.17 * bulk, trim, 0, 0.1, 0.35);
  box(g, 0.17 * bulk, 0.1, 0.17 * bulk, trim, 0, -0.8, 0.35);
  return {
    focus: { y: -0.35, z: 0.35, len: 2.4, wid: 0.11 },
    head: { y: 1.0, z: 0.35 },
    halo: { y: -0.35, z: 0.35, w: 0.4 * bulk, h: 2.6, d: 0.4 * bulk },
  };
}

/** Arco: empuñadura, dos brazos curvados hacia delante y cuerda. */
function bow(g: THREE.Group, look: WeaponLook, bulk: number): Anchor {
  const wood = stdMat(look.blade, look.glow, 0.7);
  const trim = stdMat(look.trim, look.glow, 1.0);
  const string = stdMat(0xf2ead0, look.glow, 1.4);
  box(g, 0.13, 0.5, 0.13, trim, 0, -0.35, 0.35);
  for (const sign of [1, -1]) {
    const limb = box(g, 0.1 * bulk, 0.95, 0.1 * bulk, wood, 0, -0.35 + sign * 0.65, 0.5);
    limb.rotation.x = -sign * 0.32;
    const tip = box(g, 0.1 * bulk, 0.4, 0.1 * bulk, wood, 0, -0.35 + sign * 1.2, 0.48);
    tip.rotation.x = sign * 0.25;
    box(g, 0.14, 0.12, 0.14, trim, 0, -0.35 + sign * 1.42, 0.36);
  }
  box(g, 0.03, 2.75, 0.03, string, 0, -0.35, 0.3);
  return {
    focus: { y: -0.35, z: 0.42, len: 2.8, wid: 0.14 },
    head: { y: 1.1, z: 0.4 },
    halo: { y: -0.35, z: 0.42, w: 0.4, h: 3.0, d: 0.8 },
  };
}

/** Arma de una clase con el aspecto dado, más la función que anima sus efectos. */
export function buildWeapon(classId: string, look: WeaponLook): Weapon {
  const g = new THREE.Group();
  const family = FAMILY[classId] ?? 'sword';
  // Cuantos más efectos, más corpulenta: las especiales se ven imponentes, no solo brillantes.
  const bulk = 1 + 0.22 * (look.fx?.length ?? 0);
  const a =
    family === 'sword'
      ? sword(g, look, 1, bulk)
      : family === 'dagger'
        ? sword(g, look, 0.7, 0.85 * bulk)
        : family === 'staff'
          ? staff(g, look, bulk)
          : family === 'bo'
            ? bo(g, look, bulk)
            : bow(g, look, bulk);
  if (look.size && look.size !== 1) g.scale.setScalar(look.size);

  const fxColor = look.glow ?? look.trim;
  const ticks: Array<(t: number) => void> = [];
  const make: Record<WeaponFxKind, () => void> = {
    halo: () => {
      const mat = new THREE.SpriteMaterial({ map: soft(), color: fxColor, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Sprite(mat);
      const sx = Math.max(a.halo.w, a.halo.d) * 2.6;
      const sy = a.halo.h * 1.25;
      m.position.set(0, a.halo.y, a.halo.z);
      m.scale.set(sx, sy, 1);
      g.add(m);
      ticks.push((t) => {
        const k = 1 + 0.06 * Math.sin(t * 3);
        mat.opacity = 0.55 + 0.15 * Math.sin(t * 3);
        m.scale.set(sx * k, sy * k, 1);
      });
    },
    embers: () => {
      const n = 14;
      const mat = addMat(lighten(fxColor, 0.3), 0.95);
      const sz = 0.08 * bulk;
      const bits = Array.from({ length: n }, () => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
        g.add(m);
        return m;
      });
      ticks.push((t) => {
        bits.forEach((m, i) => {
          const u = (t * 0.45 + i / n) % 1;
          const ang = t * 3 + i * 2.4;
          const r = a.focus.wid * 1.2 + 0.14 * bulk;
          m.position.set(Math.cos(ang) * r, a.focus.y + (u - 0.5) * a.focus.len, a.focus.z + Math.sin(ang) * r);
          m.scale.setScalar(Math.max(0.05, Math.sin(u * Math.PI)));
          m.rotation.set(t * 2 + i, t * 3, 0);
        });
      });
    },
    orbit: () => {
      const mat = addMat(lighten(fxColor, 0.45), 0.95);
      const bits = Array.from({ length: 3 }, () => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), mat);
        g.add(m);
        return m;
      });
      ticks.push((t) => {
        bits.forEach((m, i) => {
          const ang = t * 2.4 + (i * Math.PI * 2) / 3;
          m.position.set(Math.cos(ang) * 0.5, a.head.y + Math.sin(t * 3 + i) * 0.12, a.head.z + Math.sin(ang) * 0.5);
          m.rotation.set(t * 2, t * 2.6, 0);
        });
      });
    },
    rings: () => {
      const mat = addMat(fxColor, 0.7);
      const rings = [0, 1].map(() => {
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 5, 14), mat);
        m.position.set(0, a.head.y, a.head.z);
        g.add(m);
        return m;
      });
      ticks.push((t) => {
        rings[0].rotation.set(t * 1.3, 0, t * 0.5);
        rings[1].rotation.set(0, t * 1.1, Math.PI / 2 + t * 0.7);
      });
    },
    crescent: () => {
      const mat = addMat(lighten(fxColor, 0.2), 0.75);
      const arc = new THREE.Group();
      arc.position.set(0, a.focus.y, a.focus.z - 0.08);
      const R = a.focus.len * 0.32;
      for (let i = 0; i < 9; i++) {
        const ang = -1.25 + (i / 8) * 2.5;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.12 + 0.1 * Math.cos(ang), 0.17, 0.05), mat);
        m.position.set(-Math.cos(ang) * R * 0.5, Math.sin(ang) * R, 0);
        m.rotation.z = -ang;
        arc.add(m);
      }
      g.add(arc);
      ticks.push((t) => {
        arc.rotation.y = Math.sin(t * 1.4) * 0.5;
        mat.opacity = 0.6 + 0.2 * Math.sin(t * 2.5);
      });
    },
    runes: () => {
      const n = 4;
      const mat = addMat(lighten(fxColor, 0.5), 1);
      const bits = Array.from({ length: n }, (_, i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.04), mat);
        m.position.set(0, a.focus.y + (i / (n - 1) - 0.5) * a.focus.len * 0.7, a.focus.z + a.focus.wid * 0.5 + 0.03);
        g.add(m);
        return m;
      });
      ticks.push((t) => bits.forEach((m, i) => m.scale.setScalar(0.4 + 0.6 * Math.max(0, Math.sin(t * 3 - i * 0.9)))));
    },
  };
  for (const kind of look.fx ?? []) make[kind]();

  return { group: g, tick: (t) => ticks.forEach((fn) => fn(t)) };
}
