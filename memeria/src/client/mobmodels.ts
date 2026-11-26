import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MobLook } from '../shared/types';
import { Builder, pivot } from './mascots';

// Modelos de los enemigos, armados con cajas igual que las mascotas. Son interpretaciones
// propias: el Bear Market lleva velas rojas de gráfico en el lomo y el Rug Pull Ghost
// arrastra la alfombra que le sacaron a todos.

export interface MobModel {
  root: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  /** Patas que se balancean al caminar (vacío en el fantasma, que flota). */
  legs: THREE.Group[];
  /** Grupo que sube y baja (el fantasma flota). */
  bob: THREE.Group;
  /** Piezas que se mecen: brazos y faldón del fantasma. */
  sway: THREE.Object3D[];
  /** Altura aproximada, para ubicar la barra de vida. */
  height: number;
}

/**
 * Une las piezas estáticas de un modelo en una malla por material (hay ~30 cajas por mob y
 * ~30 mobs en el mapa). Las piezas en `skip` y sus hijos quedan sueltas porque se animan.
 */
export function bakeStatic(parent: THREE.Object3D, skip: THREE.Object3D[]): void {
  parent.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const used: THREE.Mesh[] = [];
  parent.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (let p: THREE.Object3D | null = m; p && p !== parent; p = p.parent) if (skip.includes(p)) return;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const mat = m.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(geo);
    used.push(m);
  });
  for (const m of used) {
    m.parent?.remove(m);
    m.geometry.dispose();
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

function shade(color: number, k: number): number {
  const c = new THREE.Color(color).multiplyScalar(k);
  return c.getHex();
}

function emissive(m: THREE.Mesh, color: number, intensity = 1.2): void {
  const mat = m.material as THREE.MeshStandardMaterial;
  mat.emissive = new THREE.Color(color);
  mat.emissiveIntensity = intensity;
}

function bear(color: number, horns = false): MobModel {
  const b = new Builder();
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const fur = color;
  const dark = shade(color, 0.7);
  const light = 0xc9a07a;

  // cuerpo y joroba
  b.box(bob, 1.15, 0.95, 1.6, fur, 0, 1.0, 0);
  b.box(bob, 0.95, 0.4, 0.7, fur, 0, 1.6, 0.35);
  b.box(bob, 0.9, 0.5, 0.5, dark, 0, 0.6, -0.15); // panza
  // velas rojas de gráfico en el lomo (mecha fina + cuerpo)
  for (let i = 0; i < 4; i++) {
    const z = -0.6 + i * 0.32;
    const h = 0.28 + (i % 2) * 0.14;
    b.box(bob, 0.04, h + 0.35, 0.04, 0xe8dcc0, 0, 1.58 + (h + 0.35) / 2 - (i === 0 ? 0 : 0.08), z);
    const candle = b.box(bob, 0.17, h, 0.17, 0xe0403c, 0, 1.6 + h / 2, z);
    emissive(candle, 0x801010, 0.7);
  }
  // cabeza
  b.box(bob, 0.8, 0.7, 0.7, fur, 0, 1.45, 1.0);
  b.box(bob, 0.42, 0.32, 0.4, light, 0, 1.3, 1.5); // hocico
  b.box(bob, 0.14, 0.1, 0.08, 0x111111, 0, 1.4, 1.72); // nariz
  b.box(bob, 0.1, 0.06, 0.05, 0x330a0a, 0, 1.2, 1.7); // boca
  b.box(bob, 0.16, 0.08, 0.2, 0xffffff, -0.16, 1.17, 1.66); // colmillos
  b.box(bob, 0.16, 0.08, 0.2, 0xffffff, 0.16, 1.17, 1.66);
  for (const sx of [-1, 1]) {
    const eye = b.box(bob, 0.14, 0.1, 0.06, 0xff3b3b, sx * 0.22, 1.58, 1.36);
    emissive(eye, 0xff2020, 1.6);
    b.box(bob, 0.22, 0.05, 0.08, 0x2a0a0a, sx * 0.22, 1.68, 1.36).rotation.z = sx * 0.4; // ceño
    b.box(bob, 0.22, 0.22, 0.12, dark, sx * 0.32, 1.88, 0.85); // orejas
  }
  b.box(bob, 0.22, 0.22, 0.3, dark, 0, 1.1, -0.9); // cola
  if (horns) {
    // Toro: cuernos curvos y anillo en el hocico (la trampa alcista)
    for (const sx of [-1, 1]) {
      b.box(bob, 0.12, 0.12, 0.34, 0xf2ead2, sx * 0.5, 1.95, 1.0).rotation.z = sx * -0.5;
      b.box(bob, 0.12, 0.34, 0.12, 0xf2ead2, sx * 0.72, 2.2, 1.0).rotation.z = sx * -0.2;
    }
    const ring = b.box(bob, 0.36, 0.06, 0.06, 0xffd24a, 0, 1.18, 1.72);
    emissive(ring, 0xb88a10, 0.8);
  }
  // patas
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [-0.42, 0.55],
    [0.42, 0.55],
    [-0.42, -0.55],
    [0.42, -0.55],
  ]) {
    const leg = pivot(root, x, 0.6);
    leg.position.z = z;
    b.box(leg, 0.34, 0.65, 0.34, dark, 0, -0.3, 0);
    b.box(leg, 0.38, 0.1, 0.42, light, 0, -0.62, 0.05); // garras
    legs.push(leg);
  }
  bakeStatic(bob, []);
  return { root, mats: b.mats, legs, bob, sway: [], height: 2.1 };
}

function ghost(color: number): MobModel {
  const b = new Builder();
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const cloakA = color;
  const cloakB = shade(color, 0.65);

  const cyl = (rt: number, rb: number, h: number, seg: number, c: number, y: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), b.mat(c));
    m.position.y = y;
    m.castShadow = false;
    bob.add(m);
    return m;
  };
  cyl(0.42, 0.85, 1.5, 6, cloakA, 1.0);
  cyl(0.3, 0.5, 0.6, 6, cloakB, 1.95);
  // faldón hecho jirones
  const tatters: THREE.Object3D[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 3), b.mat(cloakA));
    t.rotation.x = Math.PI;
    t.position.set(Math.cos(a) * 0.72, 0.1 - (i % 2) * 0.12, Math.sin(a) * 0.72);
    bob.add(t);
    tatters.push(t);
  }
  // capucha y cara vacía
  b.box(bob, 0.72, 0.7, 0.72, cloakB, 0, 2.5, 0);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 4), b.mat(cloakB));
  peak.rotation.y = Math.PI / 4;
  peak.position.y = 3.05;
  bob.add(peak);
  b.box(bob, 0.5, 0.42, 0.1, 0x0a0614, 0, 2.48, 0.34);
  for (const sx of [-1, 1]) {
    const eye = b.box(bob, 0.12, 0.1, 0.06, 0xd9b3ff, sx * 0.12, 2.52, 0.4);
    emissive(eye, 0xb48cff, 2);
  }
  // brazos largos con la alfombra enrollada
  const arms: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const arm = pivot(bob, sx * 0.55, 2.0);
    b.box(arm, 0.2, 0.9, 0.2, cloakB, 0, -0.35, 0.1).rotation.x = 0;
    b.box(arm, 0.22, 0.2, 0.22, 0xcfc4e6, 0, -0.85, 0.15);
    arm.rotation.x = -1.0;
    arms.push(arm);
  }
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8), b.mat(0x8a3cb0));
  rug.rotation.z = Math.PI / 2;
  rug.position.set(0, 1.55, 0.7);
  bob.add(rug);
  for (const sx of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 8), b.mat(0xf0e2b0));
    end.rotation.z = Math.PI / 2;
    end.position.set(sx * 0.66, 1.55, 0.7);
    bob.add(end);
  }
  // translucidez del cuerpo; la cara y los ojos quedan opacos
  for (const c of [cloakA, cloakB]) {
    const m = b.mat(c);
    m.transparent = true;
    m.opacity = 0.82;
  }
  bakeStatic(bob, [...arms, ...tatters]);
  return { root, mats: b.mats, legs: [], bob, sway: [...arms, ...tatters], height: 3.3 };
}

/** Golem de cristal: una liquidación hecha piedra. Pesado, con una veta que brilla en el pecho. */
function golem(color: number): MobModel {
  const b = new Builder();
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const rock = color;
  const dark = shade(color, 0.6);
  b.box(bob, 1.3, 1.2, 0.9, rock, 0, 1.7, 0); // torso
  b.box(bob, 0.8, 0.5, 0.7, dark, 0, 0.95, 0); // cintura
  b.box(bob, 0.7, 0.62, 0.62, rock, 0, 2.65, 0.05); // cabeza
  b.box(bob, 0.4, 0.14, 0.1, 0x120a1c, 0, 2.62, 0.38); // visor
  const core = b.box(bob, 0.34, 0.5, 0.12, 0xff4a3a, 0, 1.75, 0.48); // veta que brilla
  emissive(core, 0xff2a1a, 1.8);
  for (const sx of [-1, 1]) {
    const eye = b.box(bob, 0.12, 0.08, 0.06, 0xffd04d, sx * 0.17, 2.64, 0.4);
    emissive(eye, 0xffb300, 2);
    // cristales que le nacen de los hombros
    b.box(bob, 0.26, 0.7, 0.26, 0x7be3ff, sx * 0.72, 2.45, -0.1).rotation.z = sx * -0.35;
    b.box(bob, 0.18, 0.45, 0.18, 0x7be3ff, sx * 0.55, 2.55, -0.3).rotation.z = sx * 0.2;
  }
  const arms: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const arm = pivot(bob, sx * 0.95, 2.1);
    b.box(arm, 0.42, 1.0, 0.42, dark, 0, -0.45, 0);
    b.box(arm, 0.58, 0.5, 0.58, rock, 0, -1.1, 0.05); // puño
    arm.rotation.x = -0.35;
    arms.push(arm);
  }
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const leg = pivot(root, sx * 0.38, 0.85);
    b.box(leg, 0.5, 0.85, 0.5, dark, 0, -0.42, 0);
    b.box(leg, 0.6, 0.18, 0.7, rock, 0, -0.8, 0.08);
    legs.push(leg);
  }
  bakeStatic(bob, [...arms]);
  return { root, mats: b.mats, legs, bob, sway: arms, height: 3.2 };
}

export function buildMob(look: MobLook, color: number): MobModel {
  switch (look) {
    case 'beast':
      return bear(color);
    case 'bull':
      return bear(color, true);
    case 'golem':
      return golem(color);
    default:
      return ghost(color);
  }
}
