import * as THREE from 'three';
import type { NpcLook } from '../shared/types';
import { Builder, pivot } from './mascots';
import { bakeStatic } from './mobmodels';

// Modelos de los NPCs, armados con cajas como las mascotas y los mobs. Cada uno es un
// arquetipo del mundo memecoin (paper hands, diamond hands, ballena, degen...). Son
// interpretaciones propias: no copian arte ni logos de ningún proyecto.

export interface NpcModel {
  root: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  /** Animación de reposo; `t` en segundos. */
  idle: (t: number) => void;
  /** Altura aproximada, para ubicar la etiqueta. */
  height: number;
}

interface Rig {
  b: Builder;
  root: THREE.Group;
  /** Torso, cabeza y brazos: sube y baja al respirar. */
  upper: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Piezas que se animan: quedan sueltas al fusionar las estáticas. */
  animated: THREE.Object3D[];
  anim: Array<(t: number) => void>;
  height: number;
}

interface Outfit {
  skin: number;
  shirt: number;
  pants: number;
  shoes?: number;
  /** Ancho del cuerpo (1 = normal). */
  w?: number;
  legs?: boolean;
}

function rig(o: Outfit): Rig {
  const b = new Builder();
  const root = new THREE.Group();
  const upper = new THREE.Group();
  root.add(upper);
  const w = o.w ?? 1;
  if (o.legs !== false) {
    for (const sx of [-1, 1]) {
      b.box(root, 0.28 * w, 0.8, 0.3, o.pants, sx * 0.18 * w, 0.4, 0);
      b.box(root, 0.3 * w, 0.12, 0.42, o.shoes ?? 0x3a2a20, sx * 0.18 * w, 0.06, 0.05);
    }
  }
  b.box(upper, 0.72 * w, 0.82, 0.42, o.shirt, 0, 1.2, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.9, 0);
  upper.add(head);
  b.box(head, 0.46, 0.46, 0.46, o.skin, 0, 0, 0);
  for (const sx of [-1, 1]) b.box(head, 0.07, 0.08, 0.04, 0x1a1a1a, sx * 0.11, 0.03, 0.23);
  const armX = 0.36 * w + 0.12;
  const armL = pivot(upper, -armX, 1.55);
  const armR = pivot(upper, armX, 1.55);
  for (const arm of [armL, armR]) {
    b.box(arm, 0.2, 0.7, 0.22, o.shirt, 0, -0.33, 0);
    b.box(arm, 0.2, 0.2, 0.22, o.skin, 0, -0.76, 0);
  }
  return { b, root, upper, head, armL, armR, animated: [head, armL, armR], anim: [], height: 2.2 };
}

function glow(m: THREE.Mesh, color: number, intensity = 1.2): THREE.Mesh {
  const mat = m.material as THREE.MeshStandardMaterial;
  mat.emissive = new THREE.Color(color);
  mat.emissiveIntensity = intensity;
  return m;
}

/** Grupo en la mano de un brazo, para el objeto que sostiene. */
function hand(arm: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, -0.78, 0.1);
  arm.add(g);
  return g;
}

function textTexture(lines: string[], bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = fg;
  g.font = 'bold 14px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 32, 32 + (i - (lines.length - 1) / 2) * 16));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plate(parent: THREE.Object3D, w: number, h: number, tex: THREE.Texture, x: number, y: number, z: number, ry = 0): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
}

function elder(): Rig {
  const r = rig({ skin: 0xe0b890, shirt: 0x2d4a9e, pants: 0x2d4a9e });
  const { b, upper, head, armR } = r;
  b.box(r.root, 0.9, 0.95, 0.55, 0x2d4a9e, 0, 0.5, 0); // túnica larga
  b.box(upper, 0.74, 0.1, 0.44, 0xd6b24a, 0, 0.84, 0); // cinto dorado
  b.box(head, 0.5, 0.2, 0.5, 0xeeeeee, 0, 0.2, -0.02); // pelo
  b.box(head, 0.36, 0.34, 0.1, 0xf2f2f2, 0, -0.26, 0.2); // barba
  for (const sx of [-1, 1]) b.box(head, 0.14, 0.05, 0.05, 0xf2f2f2, sx * 0.11, 0.12, 0.24);
  // bastón con el farol del Well
  const h = hand(armR);
  b.box(h, 0.07, 2.3, 0.07, 0x6b4a2a, 0, 0.5, 0);
  const lamp = glow(b.box(h, 0.24, 0.3, 0.24, 0xffd36b, 0, 1.75, 0), 0xffd36b, 1.4);
  b.box(h, 0.3, 0.06, 0.3, 0x3a2a1a, 0, 1.94, 0);
  armR.rotation.x = -0.2;
  r.anim.push((t) => {
    (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 2.4) * 0.35;
    r.upper.position.y = Math.sin(t * 1.4) * 0.012;
  });
  r.height = 2.5;
  return r;
}

function scout(): Rig {
  const r = rig({ skin: 0xd9a77c, shirt: 0x3d6b3a, pants: 0x5a4630 });
  const { b, upper, head, armR } = r;
  b.box(upper, 0.8, 0.9, 0.1, 0x2f5530, 0, 1.2, -0.27); // capa
  b.box(head, 0.54, 0.3, 0.54, 0x2f5530, 0, 0.2, -0.03); // capucha
  b.box(head, 0.54, 0.5, 0.1, 0x2f5530, 0, -0.05, -0.27);
  // arco a la espalda
  b.box(upper, 0.06, 1.0, 0.06, 0x7a5230, 0.32, 1.25, -0.4).rotation.z = 0.12;
  b.box(upper, 0.02, 1.0, 0.02, 0xe8dcc0, 0.26, 1.25, -0.4);
  // catalejo
  const h = hand(armR);
  b.box(h, 0.09, 0.09, 0.5, 0xb08d3a, 0, 0, 0.25);
  b.box(h, 0.12, 0.12, 0.08, 0x333333, 0, 0, 0.52);
  armR.rotation.x = -1.2;
  r.anim.push((t) => {
    r.head.rotation.y = Math.sin(t * 0.6) * 0.5;
    r.upper.position.y = Math.sin(t * 1.4) * 0.012;
  });
  return r;
}

function innkeeper(): Rig {
  const r = rig({ skin: 0xe3b58e, shirt: 0xb04a3a, pants: 0x4a3a2a, w: 1.2 });
  const { b, upper, head, armR } = r;
  b.box(upper, 0.8, 0.5, 0.5, 0xb04a3a, 0, 0.95, 0.1); // panza
  b.box(upper, 0.82, 0.62, 0.08, 0xf2efe6, 0, 1.0, 0.36); // delantal
  b.box(head, 0.3, 0.07, 0.08, 0x5a3a20, 0, -0.1, 0.24); // bigote
  b.box(head, 0.5, 0.1, 0.5, 0x5a3a20, 0, 0.24, 0); // pelo
  const h = hand(armR);
  b.box(h, 0.18, 0.22, 0.18, 0xc9a14a, 0, 0.05, 0.1);
  b.box(h, 0.2, 0.06, 0.2, 0xffffff, 0, 0.2, 0.1); // espuma
  armR.rotation.x = -1.0;
  r.anim.push((t) => {
    r.armR.rotation.x = -1.0 + Math.sin(t * 1.1) * 0.12;
    r.upper.position.y = Math.sin(t * 1.4) * 0.015;
  });
  return r;
}

function alchemist(): Rig {
  const r = rig({ skin: 0xe8c4a0, shirt: 0x6b3fa0, pants: 0x6b3fa0 });
  const { b, head, armR } = r;
  b.box(r.root, 0.85, 0.95, 0.5, 0x6b3fa0, 0, 0.5, 0); // túnica
  b.box(head, 0.5, 0.12, 0.5, 0x6b4a2a, 0, 0.2, -0.04); // pelo
  b.box(head, 0.5, 0.5, 0.1, 0x6b4a2a, 0, -0.05, -0.26);
  b.cone(head, 0.38, 0.7, 0x4b2a78, 0, 0.62, 0); // sombrero de punta
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8), b.mat(0x4b2a78));
  brim.position.y = 0.27;
  head.add(brim);
  const h = hand(armR);
  const flask = glow(b.box(h, 0.17, 0.22, 0.17, 0x7dff9a, 0, 0.05, 0.1), 0x39ff6a, 1.2);
  b.box(h, 0.08, 0.1, 0.08, 0x5a3a20, 0, 0.2, 0.1); // corcho
  armR.rotation.x = -1.0;
  r.anim.push((t) => {
    (flask.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 + Math.sin(t * 3) * 0.4;
    r.armR.rotation.x = -1.0 + Math.sin(t * 1.3) * 0.1;
    r.upper.position.y = Math.sin(t * 1.4) * 0.012;
  });
  r.height = 2.8;
  return r;
}

function smith(): Rig {
  const r = rig({ skin: 0xc99466, shirt: 0x3a3a46, pants: 0x3a3028, w: 1.3 });
  const { b, upper, head, armL, armR } = r;
  b.box(upper, 0.9, 0.75, 0.08, 0x5c3b22, 0, 1.1, 0.27); // delantal de cuero
  b.box(head, 0.5, 0.1, 0.5, 0xc03030, 0, 0.17, 0); // pañuelo
  b.box(head, 0.4, 0.14, 0.1, 0x2a1a10, 0, -0.17, 0.22); // barba
  // las manos de diamante
  for (const arm of [armL, armR]) {
    const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), b.mat(0x6fd8ff));
    d.position.set(0, -0.8, 0.05);
    arm.add(d);
    glow(d, 0x2aa7ff, 1.3);
  }
  const h = hand(armR);
  b.box(h, 0.07, 0.7, 0.07, 0x5c3b22, 0, 0.3, 0.1);
  b.box(h, 0.34, 0.22, 0.22, 0x8a8f99, 0, 0.7, 0.1);
  armR.rotation.x = -0.7;
  r.anim.push((t) => {
    const k = Math.max(0, Math.sin(t * 2.2));
    r.armR.rotation.x = -0.7 - k * 0.9;
    r.upper.position.y = Math.sin(t * 1.4) * 0.012;
  });
  r.height = 2.4;
  return r;
}

function paper(): Rig {
  const r = rig({ skin: 0xf0d9c0, shirt: 0xe9e2c8, pants: 0x8a8a7a });
  const { b, head, armL, armR } = r;
  b.box(head, 0.5, 0.1, 0.5, 0x8a6a40, 0, 0.2, -0.02); // pelo
  for (const sx of [-1, 1]) b.box(head, 0.14, 0.04, 0.05, 0x3a2a1a, sx * 0.11, 0.14, 0.24).rotation.z = sx * 0.4; // cejas preocupadas
  // las manos de papel: hojas blancas que tiemblan
  for (const arm of [armL, armR]) {
    const hnd = hand(arm);
    b.box(hnd, 0.32, 0.4, 0.03, 0xffffff, 0, 0.1, 0.12);
    arm.rotation.x = -0.9;
  }
  // gota de sudor
  const sweat = b.box(head, 0.06, 0.1, 0.06, 0x9fe0ff, 0.3, 0.1, 0.1);
  r.animated.push(sweat);
  r.anim.push((t) => {
    r.armL.rotation.x = -0.9 + Math.sin(t * 28) * 0.06;
    r.armR.rotation.x = -0.9 + Math.sin(t * 28 + 1.3) * 0.06;
    sweat.position.y = 0.2 - ((t * 0.7) % 1) * 0.4;
    r.upper.position.x = Math.sin(t * 31) * 0.008;
  });
  return r;
}

function whale(): Rig {
  const r = rig({ skin: 0x5b86b8, shirt: 0x1d2b53, pants: 0x1d2b53, w: 1.5 });
  const { b, upper, head } = r;
  b.box(upper, 1.0, 0.5, 0.1, 0xcfe3f5, 0, 1.1, 0.26); // panza clara
  b.box(upper, 0.8, 0.06, 0.05, 0xffd23f, 0, 1.45, 0.3); // cadena de oro
  glow(b.box(upper, 0.16, 0.16, 0.05, 0xffd23f, 0, 1.28, 0.31), 0xffa500, 0.8);
  // galera
  b.box(head, 0.4, 0.4, 0.4, 0x111111, 0, 0.42, 0);
  b.box(head, 0.64, 0.05, 0.64, 0x111111, 0, 0.23, 0);
  b.box(head, 0.42, 0.07, 0.42, 0xffd23f, 0, 0.3, 0);
  // monóculo
  b.box(head, 0.14, 0.14, 0.04, 0xffd23f, 0.11, 0.03, 0.25);
  // el chorro de la ballena
  const spout = b.box(head, 0.06, 0.3, 0.06, 0xbfe8ff, 0.28, 0.35, -0.05);
  r.animated.push(spout);
  r.anim.push((t) => {
    spout.scale.y = 0.6 + Math.abs(Math.sin(t * 1.5)) * 0.8;
    r.upper.position.y = Math.sin(t * 1.0) * 0.02;
  });
  r.height = 2.8;
  return r;
}

function degen(): Rig {
  const r = rig({ skin: 0xd9a77c, shirt: 0x7b2fbf, pants: 0x222233, shoes: 0x39ff6a });
  const { b, head, armR } = r;
  b.box(head, 0.54, 0.4, 0.54, 0x7b2fbf, 0, 0.15, -0.03); // capucha
  b.box(head, 0.54, 0.6, 0.1, 0x7b2fbf, 0, -0.05, -0.27);
  b.box(head, 0.44, 0.1, 0.05, 0x000000, 0, 0.03, 0.25); // lentes de sol
  glow(b.box(head, 0.1, 0.03, 0.02, 0x3bff70, -0.1, 0.05, 0.28), 0x3bff70, 1.5);
  // celular con el gráfico
  const hnd = hand(armR);
  b.box(hnd, 0.16, 0.26, 0.03, 0x111111, 0, 0.1, 0.12);
  const screen = glow(b.box(hnd, 0.13, 0.2, 0.02, 0x3aff6c, 0, 0.1, 0.14), 0x3aff6c, 1.4);
  armR.rotation.x = -1.1;
  const mat = screen.material as THREE.MeshStandardMaterial;
  r.anim.push((t) => {
    const up = Math.floor(t * 1.3) % 2 === 0;
    mat.color.setHex(up ? 0x39ff6a : 0xff4040);
    mat.emissive.setHex(up ? 0x39ff6a : 0xff4040);
    r.upper.position.y = Math.abs(Math.sin(t * 4)) * 0.04;
    r.head.rotation.x = Math.sin(t * 4) * 0.08;
  });
  return r;
}

function exitLiquidity(): Rig {
  const r = rig({ skin: 0xe0b8a0, shirt: 0x8c8c7a, pants: 0x4a4a3a });
  const { b, upper, head } = r;
  b.box(head, 0.5, 0.1, 0.5, 0x6a5a40, 0, 0.2, -0.02);
  for (const sx of [-1, 1]) b.box(head, 0.14, 0.04, 0.05, 0x3a2a1a, sx * 0.11, 0.14, 0.24).rotation.z = -sx * 0.4; // cejas tristes
  head.rotation.x = 0.22;
  // cartel de sándwich con el pregón
  const front = textTexture(['BUY', 'MY', 'BAGS'], '#c9a96a', '#3a2a1a');
  b.box(upper, 0.78, 0.9, 0.05, 0xb89a5a, 0, 1.12, 0.3);
  plate(upper, 0.7, 0.8, front, 0, 1.12, 0.33);
  b.box(upper, 0.78, 0.9, 0.05, 0xb89a5a, 0, 1.12, -0.3);
  // las bolsas
  for (const sx of [-1, 1]) {
    b.box(r.root, 0.4, 0.5, 0.32, 0x8a6a3a, sx * 0.75, 0.25, 0.25);
    b.box(r.root, 0.14, 0.14, 0.14, 0x8a6a3a, sx * 0.75, 0.57, 0.25);
  }
  // lágrima
  const tear = b.box(head, 0.05, 0.08, 0.05, 0x9fe0ff, 0.14, -0.05, 0.25);
  r.animated.push(tear);
  r.anim.push((t) => {
    tear.position.y = -0.03 - ((t * 0.5) % 1) * 0.35;
    r.upper.position.y = Math.sin(t * 0.9) * 0.01;
  });
  return r;
}

function grocer(): Rig {
  const r = rig({ skin: 0xe3b58e, shirt: 0xf2f0e0, pants: 0x3a3a4a });
  const { b, upper, head, armL, armR } = r;
  b.box(upper, 0.74, 0.7, 0.08, 0x3f8a4a, 0, 1.05, 0.26); // delantal verde
  b.box(head, 0.5, 0.15, 0.5, 0x3f8a4a, 0, 0.26, 0); // gorra
  b.box(head, 0.4, 0.04, 0.2, 0x3f8a4a, 0, 0.2, 0.3);
  b.box(head, 0.2, 0.05, 0.05, 0x7a3a2a, 0, -0.08, 0.24); // sonrisa
  // cajón de fruta, abrazado con los dos brazos
  b.box(upper, 0.56, 0.3, 0.4, 0xa9783e, 0, 0.95, 0.5);
  b.box(upper, 0.14, 0.14, 0.14, 0xd9363e, -0.15, 1.17, 0.5);
  b.box(upper, 0.14, 0.14, 0.14, 0xf08a24, 0.02, 1.17, 0.56);
  b.box(upper, 0.14, 0.14, 0.14, 0x7ac143, 0.17, 1.17, 0.46);
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10), b.mat(0xffd23f));
  coin.rotation.x = Math.PI / 2;
  coin.position.set(0, 1.45, 0.5);
  glow(coin, 0xffa500, 0.8);
  upper.add(coin);
  r.animated.push(coin);
  armL.rotation.x = -1.0;
  armR.rotation.x = -1.0;
  r.anim.push((t) => {
    coin.rotation.z = t * 2;
    coin.position.y = 1.45 + Math.sin(t * 2) * 0.04;
    r.upper.position.y = Math.sin(t * 1.4) * 0.012;
  });
  return r;
}

function mod(): Rig {
  const r = rig({ skin: 0xd9a77c, shirt: 0x8a93a3, pants: 0x4c5566, shoes: 0x2a2f3a });
  const { b, upper, head, armL, armR } = r;
  b.box(head, 0.54, 0.34, 0.54, 0x9aa3b3, 0, 0.18, 0); // yelmo
  b.box(head, 0.1, 0.1, 0.56, 0x5a6372, 0, 0.36, 0); // cresta
  b.box(upper, 0.82, 0.14, 0.5, 0x9aa3b3, 0, 1.6, 0); // hombreras
  // escudo "MOD"
  const tex = textTexture(['MOD'], '#2f5fd0', '#ffffff');
  const sh = hand(armL);
  b.box(sh, 0.56, 0.7, 0.07, 0xd8d8d8, -0.05, 0.1, 0.18);
  plate(sh, 0.46, 0.6, tex, -0.05, 0.1, 0.225);
  armL.rotation.x = -0.5;
  // el martillo de baneo
  const h = hand(armR);
  b.box(h, 0.08, 1.0, 0.08, 0x6b4a2a, 0, 0.35, 0.1);
  b.box(h, 0.5, 0.28, 0.28, 0xd8d8d8, 0, 0.88, 0.1);
  b.box(h, 0.52, 0.06, 0.3, 0xe0403c, 0, 0.88, 0.1);
  armR.rotation.x = -0.25;
  r.anim.push((t) => {
    r.head.rotation.y = Math.sin(t * 0.5) * 0.6;
    r.upper.position.y = Math.sin(t * 1.2) * 0.01;
  });
  r.height = 2.6;
  return r;
}

function founder(): Rig {
  const r = rig({ skin: 0xcfe6ff, shirt: 0x9fd6ff, pants: 0x9fd6ff, legs: false });
  const { b, upper, head } = r;
  // en vez de piernas, una cola de espectro
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 6), b.mat(0x9fd6ff));
  tail.rotation.x = Math.PI;
  tail.position.y = 0.55;
  upper.add(tail);
  b.box(upper, 0.12, 0.6, 0.04, 0x5a8ab8, 0, 1.15, 0.22); // corbata del traje de Founder
  b.box(head, 0.5, 0.12, 0.5, 0xdff0ff, 0, 0.22, -0.02);
  for (const sx of [-1, 1]) glow(b.box(head, 0.09, 0.09, 0.04, 0xeaf6ff, sx * 0.11, 0.03, 0.24), 0xbfe8ff, 2);
  // translucidez de todo el cuerpo
  for (const m of b.mats) {
    m.transparent = true;
    m.opacity = 0.7;
    m.depthWrite = false;
  }
  r.animated.push(tail);
  r.anim.push((t) => {
    upper.position.y = 0.3 + Math.sin(t * 1.2) * 0.12;
    r.armL.rotation.x = -0.3 + Math.sin(t * 1.0) * 0.15;
    r.armR.rotation.x = -0.3 + Math.sin(t * 1.0 + 1) * 0.15;
  });
  r.height = 2.7;
  return r;
}

const BUILDERS: Record<NpcLook, () => Rig> = {
  elder,
  scout,
  innkeeper,
  alchemist,
  smith,
  paper,
  whale,
  degen,
  exit: exitLiquidity,
  grocer,
  mod,
  founder,
};

export function buildNpc(look: NpcLook): NpcModel {
  const r = BUILDERS[look]();
  bakeStatic(r.upper, r.animated);
  const phase = Math.random() * 6;
  return {
    root: r.root,
    mats: r.b.mats,
    idle: (t) => {
      for (const f of r.anim) f(t + phase);
    },
    height: r.height,
  };
}
