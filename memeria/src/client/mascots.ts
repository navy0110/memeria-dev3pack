import * as THREE from 'three';
import { SKINS, type Skin } from '../data/skins';
import type { WeaponLook } from '../shared/types';
import { buildWeapon, DEFAULT_LOOKS, type Weapon } from './weapons';

// Mascotas jugables armadas con cajas, estilo low-poly. Son interpretaciones propias
// de arquetipos de meme (rana, shiba, doge, gato, perro con gorro): no usan arte oficial ni logos
// de ningún proyecto. Cada una admite varias paletas (ver data/skins.ts).

export interface Mascot {
  root: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  /** Brazo derecho con el arma: es el que se balancea al atacar. */
  armR: THREE.Group;
  /** Torso y cabeza, para el rebote al caminar. */
  upper: THREE.Group;
  /** El arma, en un grupo propio centrado en la mano: va en la mano o guardada a la espalda. */
  weapon: THREE.Group;
  /** Dentro de `weapon`: las piezas del arma, en coordenadas del hombro. */
  grip: THREE.Group;
  /** Rotación del arma respecto del brazo cuando está en la mano (la espada apunta hacia arriba-adelante). */
  holdRot: number;
  /** Posición final del brazo al golpear. */
  strikeArm: number;
  /** Dónde queda el arma cuando se guarda (sobre `upper`). */
  stow: { x: number; y: number; z: number; rotZ: number; scale: number };
  /** Cambia el arma de la mano por otra con ese aspecto (null: la básica de la clase). */
  setWeapon: (look: WeaponLook | null) => void;
  /** Anima los efectos del arma; `t` en segundos. */
  tick: (t: number) => void;
}

export class Builder {
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly byColor = new Map<number, THREE.MeshStandardMaterial>();

  constructor(private readonly skin: Skin = SKINS[0]) {}

  /** Retoca un color del cuerpo según la skin. Ojos, armas y detalles no pasan por acá. */
  t(color: number): number {
    const k = this.skin;
    if (k.hue === 0 && k.sat === 1 && k.light === 1) return color;
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL((hsl.h + k.hue + 1) % 1, Math.min(1, hsl.s * k.sat), Math.min(1, hsl.l * k.light));
    return c.getHex();
  }

  mat(color: number): THREE.MeshStandardMaterial {
    let m = this.byColor.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
      this.byColor.set(color, m);
      this.mats.push(m);
    }
    return m;
  }

  box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  cone(parent: THREE.Object3D, r: number, h: number, color: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), this.mat(color));
    m.position.set(x, y, z);
    m.rotation.y = Math.PI / 4;
    m.castShadow = true;
    parent.add(m);
    return m;
  }
}

export function pivot(parent: THREE.Object3D, x: number, y: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  parent.add(g);
  return g;
}

/** Esqueleto común: piernas, torso, brazos. Devuelve las piezas que se animan. */
function base(b: Builder, legColor: number, torsoColor: number, armColor: number): Mascot {
  const root = new THREE.Group();
  const legL = pivot(root, -0.22, 0.8);
  const legR = pivot(root, 0.22, 0.8);
  b.box(legL, 0.32, 0.8, 0.32, legColor, 0, -0.4, 0);
  b.box(legR, 0.32, 0.8, 0.32, legColor, 0, -0.4, 0);
  const upper = new THREE.Group();
  root.add(upper);
  b.box(upper, 0.95, 0.8, 0.55, torsoColor, 0, 1.2, 0);
  const armL = pivot(upper, -0.62, 1.55);
  const armR = pivot(upper, 0.62, 1.55);
  b.box(armL, 0.26, 0.8, 0.26, armColor, 0, -0.35, 0);
  b.box(armR, 0.26, 0.8, 0.26, armColor, 0, -0.35, 0);
  // El arma gira alrededor de la mano (y=-0.75 del brazo); sus piezas se modelan desde el hombro.
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.75, 0.05);
  armR.add(weapon);
  const grip = new THREE.Group();
  grip.position.set(0, 0.75, -0.05);
  weapon.add(grip);
  const m: Mascot = {
    root,
    mats: b.mats,
    legL,
    legR,
    armL,
    armR,
    upper,
    weapon,
    grip,
    holdRot: 0,
    strikeArm: -0.5,
    stow: { x: 0.3, y: 1.9, z: -0.4, rotZ: -0.8, scale: 0.7 },
    setWeapon: () => {},
    tick: () => {},
  };
  return m;
}

/** Conecta el arma intercambiable de una mascota: arma básica de la clase y cambio en vivo. */
function wield(m: Mascot, classId: string): Mascot {
  let current: Weapon | null = null;
  m.setWeapon = (look) => {
    if (current) m.grip.remove(current.group);
    current = buildWeapon(classId, look ?? DEFAULT_LOOKS[classId]);
    m.grip.add(current.group);
  };
  m.tick = (t) => current?.tick(t);
  m.setWeapon(null);
  return m;
}

const VERTICAL_STOW = { x: 0.15, y: 1.35, z: -0.42, rotZ: 0.35, scale: 0.7 };

function pepe(skin: Skin): Mascot {
  const b = new Builder(skin);
  const green = b.t(0x4f9a3a);
  const m = base(b, b.t(0x2f6b27), b.t(0x2d3a8c), green); // capucha azul
  const u = m.upper;
  b.box(u, 1.15, 0.7, 0.85, green, 0, 1.95, 0); // cabeza ancha
  b.box(u, 0.38, 0.34, 0.3, 0xffffff, -0.32, 2.34, 0.2); // ojos saltones
  b.box(u, 0.38, 0.34, 0.3, 0xffffff, 0.32, 2.34, 0.2);
  b.box(u, 0.14, 0.14, 0.05, 0x111111, -0.3, 2.28, 0.37);
  b.box(u, 0.14, 0.14, 0.05, 0x111111, 0.3, 2.28, 0.37);
  b.box(u, 0.42, 0.15, 0.34, b.t(0x3d7d2c), -0.32, 2.43, 0.2); // párpados pesados
  b.box(u, 0.42, 0.15, 0.34, b.t(0x3d7d2c), 0.32, 2.43, 0.2);
  b.box(u, 0.9, 0.09, 0.06, 0xa83232, 0, 1.82, 0.44); // labio
  b.box(u, 0.6, 0.08, 0.06, b.t(0x7bc255), 0, 1.72, 0.44);
  m.stow = VERTICAL_STOW;
  return wield(m, 'pepe');
}

function shiba(skin: Skin): Mascot {
  const b = new Builder(skin);
  const orange = b.t(0xe58a3c), cream = b.t(0xf5e6c8);
  const m = base(b, b.t(0x8a4a1c), b.t(0x9b2d2d), orange); // armadura roja
  const u = m.upper;
  b.box(u, 0.95, 0.12, 0.6, b.t(0xc0392b), 0, 1.64, 0); // bufanda
  b.box(u, 0.3, 0.55, 0.05, cream, 0, 1.2, 0.3); // pechera
  b.box(u, 0.9, 0.8, 0.85, orange, 0, 2.05, 0); // cabeza
  b.box(u, 0.55, 0.32, 0.4, cream, 0, 1.9, 0.55); // hocico
  b.box(u, 0.16, 0.12, 0.1, 0x111111, 0, 2.02, 0.77); // nariz
  b.box(u, 0.12, 0.12, 0.05, 0x111111, -0.24, 2.18, 0.43);
  b.box(u, 0.12, 0.12, 0.05, 0x111111, 0.24, 2.18, 0.43);
  b.box(u, 0.1, 0.07, 0.05, cream, -0.24, 2.32, 0.43); // cejas de shiba
  b.box(u, 0.1, 0.07, 0.05, cream, 0.24, 2.32, 0.43);
  b.cone(u, 0.28, 0.5, orange, -0.3, 2.65, 0);
  b.cone(u, 0.28, 0.5, orange, 0.3, 2.65, 0);
  const tail = b.box(u, 0.2, 0.7, 0.2, orange, 0, 1.3, -0.5);
  tail.rotation.x = -0.5;
  b.box(u, 0.28, 0.28, 0.2, cream, 0, 1.75, -0.7); // punta de la cola enrulada
  m.holdRot = -1.6; // la espada se empuña con la hoja hacia arriba-adelante
  m.strikeArm = 0.35;
  return wield(m, 'shiba');
}

function doge(skin: Skin): Mascot {
  const b = new Builder(skin);
  const fur = b.t(0xf0cf86), cream = b.t(0xfff4d6);
  const m = base(b, b.t(0xc9a45c), b.t(0x333333), fur); // chaleco oscuro
  const u = m.upper;
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10), b.mat(b.t(0xe0b23a)));
  coin.rotation.x = Math.PI / 2;
  coin.position.set(0, 1.25, 0.32);
  u.add(coin);
  b.box(u, 0.9, 0.78, 0.85, fur, 0, 2.05, 0); // cabeza
  b.box(u, 0.6, 0.34, 0.4, cream, 0, 1.88, 0.55); // hocico
  b.box(u, 0.16, 0.12, 0.1, 0x111111, 0, 2.0, 0.77);
  b.box(u, 0.2, 0.14, 0.05, 0x111111, -0.24, 2.16, 0.43); // ojos entrecerrados
  b.box(u, 0.2, 0.14, 0.05, 0x111111, 0.24, 2.16, 0.43);
  b.box(u, 0.24, 0.08, 0.06, fur, -0.24, 2.24, 0.45); // párpados
  b.box(u, 0.24, 0.08, 0.06, fur, 0.24, 2.24, 0.45);
  const brow = b.box(u, 0.22, 0.05, 0.05, b.t(0x8a6a2a), -0.26, 2.38, 0.43); // ceja levantada
  brow.rotation.z = 0.35;
  b.box(u, 0.22, 0.05, 0.05, b.t(0x8a6a2a), 0.26, 2.36, 0.43);
  b.cone(u, 0.26, 0.5, fur, -0.3, 2.65, 0);
  b.cone(u, 0.26, 0.5, fur, 0.3, 2.65, 0);
  const tail = b.box(u, 0.2, 0.6, 0.2, fur, 0, 1.3, -0.5);
  tail.rotation.x = -0.6;
  m.holdRot = -1.6;
  m.strikeArm = 0.35;
  return wield(m, 'doge');
}

/** Gato blanco de boca abierta, con kimono rojo y cinta en la frente: el monje. */
function popcat(skin: Skin): Mascot {
  const b = new Builder(skin);
  const fur = b.t(0xf4f0ee), shade = b.t(0xd9d2cf), pink = b.t(0xff9db5), gi = b.t(0xd94a3d);
  const m = base(b, b.t(0x8a2f28), gi, fur);
  const u = m.upper;
  b.box(u, 1.0, 0.12, 0.62, b.t(0xf2e9d8), 0, 0.95, 0); // cinturón
  b.box(u, 0.9, 0.82, 0.88, fur, 0, 2.05, 0); // cabeza
  b.box(u, 1.0, 0.16, 0.92, gi, 0, 2.4, 0); // cinta
  b.cone(u, 0.26, 0.5, fur, -0.32, 2.7, 0);
  b.cone(u, 0.26, 0.5, fur, 0.32, 2.7, 0);
  b.cone(u, 0.12, 0.3, pink, -0.32, 2.66, 0.1);
  b.cone(u, 0.12, 0.3, pink, 0.32, 2.66, 0.1);
  b.box(u, 0.14, 0.14, 0.05, 0x111111, -0.26, 2.14, 0.45); // ojos chicos
  b.box(u, 0.14, 0.14, 0.05, 0x111111, 0.26, 2.14, 0.45);
  b.box(u, 0.14, 0.1, 0.06, pink, -0.4, 1.95, 0.44); // mejillas
  b.box(u, 0.14, 0.1, 0.06, pink, 0.4, 1.95, 0.44);
  b.box(u, 0.46, 0.34, 0.06, 0x3a1620, 0, 1.8, 0.45); // boca abierta, el "pop"
  b.box(u, 0.26, 0.12, 0.07, pink, 0, 1.7, 0.46); // lengua
  b.box(u, 0.12, 0.08, 0.06, pink, 0, 1.96, 0.46); // nariz
  b.box(u, 0.5, 0.025, 0.03, shade, -0.52, 1.92, 0.45); // bigotes
  b.box(u, 0.5, 0.025, 0.03, shade, 0.52, 1.92, 0.45);
  const tail = b.box(u, 0.16, 0.8, 0.16, fur, 0, 1.4, -0.48);
  tail.rotation.x = -0.7;
  m.stow = VERTICAL_STOW;
  return wield(m, 'popcat');
}

/** Perro con gorro rosa, capa verde y carcaj: el arquero. */
function wif(skin: Skin): Mascot {
  const b = new Builder(skin);
  const fur = b.t(0xc9a07a), cream = b.t(0xf1dfc4), ear = b.t(0x8a5a38), hat = b.t(0xff7fb0), cloak = b.t(0x3f6b3a);
  const m = base(b, b.t(0x5a4630), cloak, fur);
  const u = m.upper;
  b.box(u, 1.05, 0.14, 0.66, b.t(0x2f5230), 0, 1.62, 0); // cuello de la capa
  b.box(u, 0.9, 0.78, 0.86, fur, 0, 2.0, 0); // cabeza
  b.box(u, 0.56, 0.32, 0.4, cream, 0, 1.84, 0.55); // hocico
  b.box(u, 0.16, 0.12, 0.1, 0x111111, 0, 1.97, 0.77); // nariz
  b.box(u, 0.12, 0.12, 0.05, 0x111111, -0.24, 2.1, 0.44);
  b.box(u, 0.12, 0.12, 0.05, 0x111111, 0.24, 2.1, 0.44);
  b.box(u, 0.2, 0.6, 0.3, ear, -0.55, 1.95, 0.05); // orejas caídas
  b.box(u, 0.2, 0.6, 0.3, ear, 0.55, 1.95, 0.05);
  b.box(u, 1.0, 0.42, 0.94, hat, 0, 2.52, 0); // el gorro
  b.box(u, 1.04, 0.13, 0.98, b.t(0xe85a94), 0, 2.36, 0); // puño del gorro
  b.box(u, 0.26, 0.26, 0.26, b.t(0xfff0f6), 0, 2.82, 0); // pompón
  const tail = b.box(u, 0.2, 0.6, 0.2, fur, 0, 1.3, -0.5);
  tail.rotation.x = -0.6;
  const quiver = b.box(u, 0.26, 0.9, 0.22, b.t(0x6b4a2b), 0.18, 1.35, -0.42); // carcaj
  quiver.rotation.z = -0.25;
  for (const dx of [0.1, 0.22, 0.34]) {
    const arrow = b.box(u, 0.05, 0.4, 0.05, 0xe8dcc0, dx - 0.05, 1.95, -0.42);
    arrow.rotation.z = -0.25;
  }
  m.stow = VERTICAL_STOW;
  return wield(m, 'wif');
}

const BUILDERS: Record<string, (skin: Skin) => Mascot> = { pepe, shiba, doge, popcat, wif };

export function buildMascot(classId: string, skinIndex = 0): Mascot {
  const make = BUILDERS[classId];
  if (!make) throw new Error(`Mascota desconocida: ${classId}`);
  return make(SKINS[skinIndex] ?? SKINS[0]);
}
