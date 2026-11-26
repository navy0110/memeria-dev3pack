import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Bounds, Collider, GroundKind, Region, WorldGeometry } from '../shared/types';
import { treeFx, type GlowSpot } from './atmosphere';

// Escenografía del mundo: texturas de píxel, suelo con variación, edificios, árboles,
// props, vegetación instanciada, colinas y cielo. Todo es estático y se arma una vez.
// Presupuesto: unos pocos miles de triángulos por zona; la vegetación va instanciada.

// ---------- utilidades ----------

export type Spot = { x: number; z: number };

/** PRNG determinista: el mundo se ve igual en cada carga. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, opts: { rough?: number; flat?: boolean; emissive?: number } = {}): THREE.MeshStandardMaterial {
  const { rough = 0.95, flat = true, emissive = 0 } = opts;
  const key = `${color}-${rough}-${flat}-${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: flat });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 0.9;
    }
    matCache.set(key, m);
  }
  return m;
}

/** Vidrio de las ventanas y farol: la atmósfera les sube el brillo de noche. */
export const windowGlass = (): THREE.MeshStandardMaterial => mat(0xffe08a, { emissive: 0x9a6a10 });
export const lampGlass = (): THREE.MeshStandardMaterial => mat(0xffe9a0, { emissive: 0xffc850 });

function put<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return put(parent, m, x, y, z);
}

function cyl(parent: THREE.Object3D, rt: number, rb: number, h: number, seg: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return put(parent, m, x, y, z);
}

function cone(parent: THREE.Object3D, r: number, h: number, seg: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  m.castShadow = true;
  return put(parent, m, x, y, z);
}

function blob(parent: THREE.Object3D, r: number, color: number, x: number, y: number, z: number, sy = 1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(color));
  m.scale.y = sy;
  m.castShadow = true;
  return put(parent, m, x, y, z);
}

// ---------- texturas de píxel (estilo PS2) ----------

const TEX_SIZE = 64;
const texCache = new Map<GroundKind, THREE.CanvasTexture>();

/** Ruido de valor tileable: da manchas grandes de claro/oscuro para que el suelo no parezca una grilla. */
function blotches(rand: () => number, size: number, cell: number): number[] {
  const n = size / cell;
  const lat = Array.from({ length: n * n }, () => rand());
  const at = (i: number, j: number): number => lat[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
  const out: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = fx - i;
      const v = fy - j;
      const su = u * u * (3 - 2 * u);
      const sv = v * v * (3 - 2 * v);
      const a = at(i, j) * (1 - su) + at(i + 1, j) * su;
      const b = at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su;
      out.push(a * (1 - sv) + b * sv);
    }
  }
  return out;
}

function groundTexture(kind: GroundKind): THREE.CanvasTexture {
  const cached = texCache.get(kind);
  if (cached) return cached;
  const rand = rng(kind.length * 977 + kind.charCodeAt(0));
  const c = document.createElement('canvas');
  c.width = c.height = TEX_SIZE;
  const g = c.getContext('2d')!;
  // La textura es en escala de grises; el color real viene del vertex color del suelo.
  const k = new Float32Array(TEX_SIZE * TEX_SIZE);
  const big = blotches(rand, TEX_SIZE, 16);
  const mid = blotches(rand, TEX_SIZE, 8);
  const at = (x: number, y: number): number => ((y + TEX_SIZE) % TEX_SIZE) * TEX_SIZE + ((x + TEX_SIZE) % TEX_SIZE);
  for (let i = 0; i < k.length; i++) k[i] = 0.8 + big[i] * 0.16 + mid[i] * 0.08 + rand() * 0.05;

  if (kind === 'grass') {
    // Briznas: trazos verticales cortos, más claros en la punta, más oscuros en la base.
    for (let n = 0; n < 150; n++) {
      const x = Math.floor(rand() * TEX_SIZE);
      const y = Math.floor(rand() * TEX_SIZE);
      const len = 2 + Math.floor(rand() * 3);
      for (let d = 0; d < len; d++) k[at(x + (d > 2 ? 1 : 0), y - d)] = d === len - 1 ? 1.08 : 0.74;
    }
    // Tierra asomando y tréboles claros.
    for (let n = 0; n < 24; n++) k[at(Math.floor(rand() * TEX_SIZE), Math.floor(rand() * TEX_SIZE))] = 0.6;
    for (let n = 0; n < 16; n++) {
      const x = Math.floor(rand() * TEX_SIZE);
      const y = Math.floor(rand() * TEX_SIZE);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) k[at(x + dx, y + dy)] = 1.12;
    }
  } else if (kind === 'road') {
    // Tierra apisonada: guijarros con sombra abajo a la derecha y dos huellas de carro.
    for (let n = 0; n < 34; n++) {
      const x = Math.floor(rand() * TEX_SIZE);
      const y = Math.floor(rand() * TEX_SIZE);
      k[at(x, y)] = 1.1;
      k[at(x + 1, y)] = 1.02;
      k[at(x + 1, y + 1)] = 0.62;
      k[at(x, y + 1)] = 0.7;
    }
    for (let x = 0; x < TEX_SIZE; x++) {
      for (const row of [14, 15, 46, 47]) k[at(x, row)] *= 0.84;
    }
    for (let n = 0; n < 40; n++) k[at(Math.floor(rand() * TEX_SIZE), Math.floor(rand() * TEX_SIZE))] = 0.66;
  } else if (kind === 'stone') {
    // Adoquines de tamaño irregular, con borde claro arriba-izquierda y junta oscura.
    const rows = [0, 13, 29, 41, 56, 64];
    for (let r = 0; r < rows.length - 1; r++) {
      const y0 = rows[r];
      const y1 = rows[r + 1];
      let x = Math.floor(rand() * 8) - 4;
      while (x < TEX_SIZE) {
        const w = 10 + Math.floor(rand() * 9);
        const tone = 0.84 + rand() * 0.2;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            const edgeL = xx === x || yy === y0;
            const edgeR = xx === x + w - 1 || yy === y1 - 1;
            k[at(xx, yy)] = edgeR ? 0.6 : edgeL ? Math.min(1.12, tone + 0.14) : tone * (0.94 + rand() * 0.08);
          }
        }
        x += w;
      }
    }
    for (let n = 0; n < 26; n++) k[at(Math.floor(rand() * TEX_SIZE), Math.floor(rand() * TEX_SIZE))] = 0.55; // grietas
  } else {
    // Pantano: barro con charcos oscuros de borde claro y burbujas.
    for (let i = 0; i < k.length; i++) k[i] = big[i] > 0.62 ? 0.52 + mid[i] * 0.12 : k[i] * 0.92;
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        if (big[y * TEX_SIZE + x] > 0.62 && big[((y + 1) % TEX_SIZE) * TEX_SIZE + x] <= 0.62) k[y * TEX_SIZE + x] = 1.05;
      }
    }
    for (let n = 0; n < 40; n++) k[at(Math.floor(rand() * TEX_SIZE), Math.floor(rand() * TEX_SIZE))] = 0.6;
    for (let n = 0; n < 8; n++) k[at(Math.floor(rand() * TEX_SIZE), Math.floor(rand() * TEX_SIZE))] = 1.15;
  }

  const img = g.createImageData(TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < k.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(k[i] * 255)));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(kind, t);
  return t;
}

// ---------- suelo ----------

const TILE_M = 4; // metros por repetición de textura
const GROUND_A: Record<GroundKind, number> = { grass: 0x78b24a, road: 0xcdb27c, stone: 0xc2b393, swamp: 0x56703f };
const GROUND_B: Record<GroundKind, number> = { grass: 0x5a9a3a, road: 0xb3965f, stone: 0xaa9d82, swamp: 0x3e5530 };

function groundPatch(b: Bounds, kind: GroundKind, y: number, seed: number): THREE.Mesh {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2)));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const fade = kind === 'road';
  const stride = fade ? 4 : 3;
  const colors = new Float32Array(pos.count * stride);
  const a = new THREE.Color(GROUND_A[kind]);
  const bb = new THREE.Color(GROUND_B[kind]);
  const c = new THREE.Color();
  const rand = rng(seed);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    // manchas grandes de dos tonos + ruido por vértice
    const n = 0.5 + 0.5 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.13 + Math.sin(x * 0.05) * 2);
    c.copy(bb).lerp(a, Math.min(1, Math.max(0, n + (rand() - 0.5) * 0.25)));
    colors[i * stride] = c.r;
    colors[i * stride + 1] = c.g;
    colors[i * stride + 2] = c.b;
    if (fade) {
      // El camino se funde con el pasto en los costados y en la punta; el lado de la villa queda firme.
      const edge = Math.min(99, b.maxX - x, z - b.minZ, b.maxZ - z);
      colors[i * stride + 3] = Math.max(0, Math.min(1, edge / 2.2 + (rand() - 0.5) * 0.35));
    }
    uv.setXY(i, x / TILE_M, z / TILE_M);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, stride));
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: groundTexture(kind), vertexColors: true, roughness: 1, transparent: fade, depthWrite: !fade }),
  );
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  return m;
}

export function addGround(scene: THREE.Scene, geo: WorldGeometry): void {
  // Terreno enorme debajo de todo: el borde del mundo nunca deja ver el vacío.
  const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat(0x5f8f43, { flat: false }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.05;
  scene.add(far);
  scene.add(groundPatch(geo.bounds, 'grass', 0, 11));
  // Capas: el camino y la piedra van sobre el pasto, que va sobre el pantano.
  const LAYER: Record<GroundKind, number> = { swamp: 0.01, grass: 0.014, stone: 0.018, road: 0.022 };
  geo.regions.forEach((r, i) => scene.add(groundPatch(r.bounds, r.ground, LAYER[r.ground], 31 + i * 17)));
}

// ---------- obstáculos (colliders con cara visual) ----------

/** Hash estable por posición para variar color/forma sin guardar nada. */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function buildObstacle(c: Collider): THREE.Group {
  const g = new THREE.Group();
  if (c.shape === 'circle') {
    g.position.set(c.x, 0, c.z);
    const h = hash2(c.x, c.z);
    if (c.visual === 'pond') pond(g, c.r, h);
    else if (c.visual === 'pillar') pillar(g, c.r, h);
    else if (c.visual === 'fountain') fountain(g, c.r);
    else rock(g, c.r, h);
    return g;
  }
  g.position.set((c.minX + c.maxX) / 2, 0, (c.minZ + c.maxZ) / 2);
  const w = c.maxX - c.minX;
  const d = c.maxZ - c.minZ;
  if (c.visual === 'stall') stall(g, w, d);
  else house(g, w, d, c.visual === 'inn', hash2(c.minX, c.minZ));
  return g;
}

type TreeKind = 'pine' | 'round' | 'autumn';

/** Un árbol sin escala ni rotación, hecho de piezas con material. */
function treeParts(t: THREE.Group, kind: TreeKind): void {
  cyl(t, 0.22, 0.38, 2.4, 6, 0x6a4526, 0, 1.2, 0);
  if (kind === 'pine') {
    cone(t, 1.7, 2.2, 7, 0x2c7a3c, 0, 2.7, 0);
    cone(t, 1.35, 2, 7, 0x358a45, 0, 3.9, 0);
    cone(t, 0.95, 1.8, 7, 0x3f9a50, 0, 5, 0);
  } else {
    const leaf = kind === 'round' ? [0x4a9d3a, 0x5cb347, 0x3d8a33] : [0xd9822b, 0xe6a23a, 0xc4622a];
    blob(t, 1.5, leaf[0], 0, 3.5, 0, 0.9);
    blob(t, 1.1, leaf[1], 0.9, 3.1, 0.3);
    blob(t, 1.0, leaf[2], -0.8, 3.0, -0.4);
    blob(t, 0.9, leaf[1], 0.1, 4.5, 0.2);
  }
}

const TREE_KINDS: TreeKind[] = ['pine', 'round', 'autumn'];

let treeAtlas: THREE.CanvasTexture | null = null;

/** 64x32 en grises: corteza con vetas a la izquierda, follaje con hojas y huecos a la derecha. Se multiplica por el color de cada pieza. */
function treeTexture(): THREE.CanvasTexture {
  if (treeAtlas) return treeAtlas;
  const rand = rng(4242);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d')!;
  const dot = (x: number, y: number, v: number): void => {
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, y, 1, 1);
  };
  // Corteza: columnas de tono casi constante con grietas verticales.
  for (let x = 0; x < 32; x++) {
    const col = 0.66 + rand() * 0.3;
    for (let y = 0; y < 32; y++) {
      let v = col * (0.9 + rand() * 0.1);
      if (rand() < 0.07) v *= 0.55;
      dot(x, y, Math.round(Math.min(1, v) * 255));
    }
  }
  for (let n = 0; n < 9; n++) {
    const x = Math.floor(rand() * 32);
    const y0 = Math.floor(rand() * 24);
    for (let d = 0; d < 6 + Math.floor(rand() * 8); d++) dot(x, Math.min(31, y0 + d), 70);
  }
  // Follaje: manchas de hoja claras con borde oscuro debajo, y huecos de sombra.
  for (let y = 0; y < 32; y++) for (let x = 32; x < 64; x++) dot(x, y, Math.round((0.6 + rand() * 0.22) * 255));
  for (let n = 0; n < 70; n++) {
    const x = 32 + Math.floor(rand() * 30);
    const y = Math.floor(rand() * 30);
    dot(x, y, 255);
    dot(x + 1, y, 235);
    dot(x, y + 1, 150);
    dot(x + 1, y + 1, 110);
  }
  for (let n = 0; n < 40; n++) dot(32 + Math.floor(rand() * 32), Math.floor(rand() * 32), 70);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  treeAtlas = t;
  return t;
}

/** Une todas las piezas de un árbol en una sola geometría con color por vértice. */
function mergedTree(kind: TreeKind): THREE.BufferGeometry {
  const t = new THREE.Group();
  treeParts(t, kind);
  t.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  t.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    const col = (m.material as THREE.MeshStandardMaterial).color;
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) col.toArray(colors, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // UV al atlas: el tronco (cilindro) usa la corteza, todo lo demás el follaje. Se repite el patrón 2 veces en vertical.
    const uv = geo.attributes.uv;
    const trunk = m.geometry.type === 'CylinderGeometry';
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 0.5 + (trunk ? 0 : 0.5)) * 0.98 + 0.01, uv.getY(i) * 0.96 + 0.02);
    parts.push(geo);
  });
  return mergeGeometries(parts)!;
}

// Árboles encantados: una parte brilla de noche y suelta orbes que flotan. Se decide por posición, así que
// es igual en cada carga. addTrees junta los orbes y la atmósfera los pide con takeTreeOrbs().
const ORB_COLORS: Record<TreeKind, number[]> = {
  pine: [0xc79bff, 0x9fb8ff],
  round: [0x7ff0ff, 0x7fffc0],
  autumn: [0xffc35a, 0xff9a5a],
};
const ENCHANT_TINT: Record<TreeKind, [number, number, number]> = {
  pine: [0.8, 1.0, 1.3],
  round: [0.75, 1.15, 1.1],
  autumn: [1.2, 0.95, 0.8],
};
const treeOrbs: GlowSpot[] = [];

/** Orbes de los árboles encantados creados hasta ahora; vacía la lista. */
export function takeTreeOrbs(): GlowSpot[] {
  return treeOrbs.splice(0);
}

/** Material de los árboles: se balancean con el viento y, los encantados, brillan de noche. */
function treeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: treeTexture(), roughness: 0.95, flatShading: true });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, treeFx);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aGlow;\nvarying float vGlow;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGlow = aGlow;
        float bend = pow(clamp(position.y / 5.5, 0.0, 1.0), 2.0);
        vec3 ip = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
        transformed.x += sin(uTime * 1.3 + ip.x * 0.37 + ip.z * 0.21) * 0.11 * bend;
        transformed.z += cos(uTime * 1.05 + ip.z * 0.33 + ip.x * 0.17) * 0.08 * bend;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform float uBlood;\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float foliage = step(0.5, vMapUv.x);
        vec3 glowTint = mix(vec3(0.35, 0.9, 1.0), vec3(1.0, 0.2, 0.2), uBlood);
        totalEmissiveRadiance += glowTint * diffuseColor.rgb * vGlow * foliage * uNight * 0.9;`,
      );
  };
  m.customProgramCacheKey = () => 'memeria-tree';
  return m;
}

/** Todos los árboles del mundo: 3 mallas instanciadas (una por especie), un draw call cada una. */
export function addTrees(scene: THREE.Scene, spots: Spot[]): void {
  const material = treeMaterial();
  TREE_KINDS.forEach((kind) => {
    const list = spots.filter((p) => TREE_KINDS[Math.floor(hash2(p.x, p.z) * 3) % 3] === kind);
    if (list.length === 0) return;
    const geometry = mergedTree(kind);
    const glow = new Float32Array(list.length);
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    list.forEach((p, i) => {
      const h = hash2(p.x * 1.7, p.z * 2.3);
      const s = 0.85 + h * 0.55;
      const sy = s * (0.9 + hash2(p.z, p.x) * 0.3);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h * 6.28);
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(s, sy, s));
      mesh.setMatrixAt(i, m);
      const shade = 0.85 + hash2(p.x + 5, p.z - 3) * 0.3;
      const magic = hash2(p.x * 0.7 + 11, p.z * 1.3 - 5);
      if (magic > (kind === 'pine' ? 0.8 : 0.64)) {
        const [r, g, b] = ENCHANT_TINT[kind];
        mesh.setColorAt(i, col.setRGB(shade * r, shade * g, shade * b));
        glow[i] = 1;
        // Tres orbes alrededor de la copa.
        for (let k = 0; k < 3; k++) {
          const a = h * 6.28 + k * 2.1 + magic * 9;
          const rad = (1.7 + hash2(p.x + k, p.z) * 0.5) * s;
          const colors = ORB_COLORS[kind];
          treeOrbs.push({
            x: p.x + Math.cos(a) * rad,
            y: (2.6 + hash2(p.z, p.x + k * 3) * 2) * sy,
            z: p.z + Math.sin(a) * rad,
            color: colors[(i + k) % colors.length],
            size: 0.8 + hash2(p.x * k, p.z) * 0.5,
            kind: 'orb',
          });
        }
      } else {
        mesh.setColorAt(i, col.setScalar(shade));
      }
    });
    geometry.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

function pond(g: THREE.Group, r: number, h: number): void {
  cyl(g, r * 1.1, r * 1.18, 0.16, 14, 0xb9a577, 0, 0.06, 0); // orilla de arena
  const water = cyl(g, r * 0.93, r * 0.93, 0.1, 14, 0x2f86c9, 0, 0.14, 0);
  water.material = mat(0x2f86c9, { rough: 0.15, flat: false, emissive: 0x0a2a48 });
  water.castShadow = false;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + h * 3;
    const d = r * (0.97 + (i % 3) * 0.04);
    cone(g, 0.06, 0.9 + (i % 3) * 0.3, 3, 0x5f8a3a, Math.cos(a) * d, 0.5, Math.sin(a) * d);
  }
  blob(g, r * 0.12, 0xf2d6e0, r * 0.3, 0.2, r * 0.2, 0.3); // nenúfares
  blob(g, r * 0.1, 0xf2d6e0, -r * 0.35, 0.2, -r * 0.1, 0.3);
}

function pillar(g: THREE.Group, r: number, h: number): void {
  const broken = h > 0.45;
  const height = broken ? 2.4 + h * 1.2 : 4.5;
  cyl(g, r * 1.35, r * 1.5, 0.35, 8, 0x8b8478, 0, 0.18, 0); // base
  cyl(g, r, r * 1.1, height, 8, 0x9a9384, 0, 0.35 + height / 2, 0);
  if (!broken) {
    cyl(g, r * 1.4, r * 1.2, 0.4, 8, 0x8b8478, 0, 0.35 + height + 0.2, 0); // capitel
  } else {
    const chunk = box(g, r * 1.3, 0.6, r * 1.0, 0x8b8478, r * 1.7, 0.3, r * 0.8);
    chunk.rotation.y = h * 5;
    chunk.rotation.z = 0.15;
  }
}

function fountain(g: THREE.Group, r: number): void {
  cyl(g, r * 1.12, r * 1.12, 0.25, 16, 0x9c9588, 0, 0.12, 0);
  cyl(g, r, r, 0.75, 16, 0x8c8579, 0, 0.62, 0);
  cyl(g, r * 0.84, r * 0.84, 0.12, 16, 0x3b9bd6, 0, 0.98, 0).material = mat(0x3b9bd6, { rough: 0.2, flat: false, emissive: 0x0a3050 });
  cyl(g, 0.22, 0.32, 1.5, 8, 0x9c9588, 0, 1.4, 0);
  cyl(g, 0.7, 0.35, 0.25, 10, 0x9c9588, 0, 2.2, 0);
  blob(g, 0.35, 0x7fd0ff, 0, 2.6, 0).material = mat(0x7fd0ff, { rough: 0.2, emissive: 0x2a6a90 });
}

function rock(g: THREE.Group, r: number, h: number): void {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(0x7a766d));
  m.scale.set(1.15, 0.8 + h * 0.4, 1);
  m.rotation.y = h * 6;
  m.castShadow = true;
  m.receiveShadow = true;
  put(g, m, 0, r * 0.45, 0);
  blob(g, r * 0.5, 0x8a867c, r * 0.9, r * 0.25, r * 0.3, 0.8);
  // musgo
  blob(g, r * 0.45, 0x5f8f43, -r * 0.2, r * 0.95, 0, 0.45);
}

function house(g: THREE.Group, w: number, d: number, inn: boolean, h: number): void {
  const wallColors = inn ? [0x8a5f3c, 0x7b5636] : [0xd8c7a0, 0xe0b88a, 0xc9d2d8, 0xd6a58a];
  const roofColors = inn ? [0x8c2f2a] : [0xb5432f, 0x3f6f8c, 0x7a4f8c, 0xa8603a];
  const wall = wallColors[Math.floor(h * 97) % wallColors.length];
  const roof = roofColors[Math.floor(h * 53) % roofColors.length];
  const height = inn ? 4.2 : 3.2;
  box(g, w + 0.3, 0.5, d + 0.3, 0x7d766a, 0, 0.25, 0); // zócalo de piedra
  box(g, w, height, d, wall, 0, 0.5 + height / 2, 0);
  // vigas de madera en las esquinas
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.25, height, 0.25, 0x5a3d22, (sx * w) / 2, 0.5 + height / 2, (sz * d) / 2);
  box(g, w + 0.1, 0.22, d + 0.1, 0x5a3d22, 0, 0.5 + height * 0.55, 0); // viga horizontal
  // techo con alero
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, inn ? 2.8 : 2.3, 4), mat(roof));
  r.rotation.y = Math.PI / 4;
  r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  r.castShadow = true;
  put(g, r, 0, 0.5 + height + (inn ? 1.4 : 1.15), 0);
  // chimenea
  box(g, 0.7, 1.6, 0.7, 0x6e6a63, w * 0.25, 0.5 + height + 1.6, -d * 0.2);
  // puerta y ventanas hacia +z
  box(g, 1.1, 2.1, 0.12, 0x4a2f1a, 0, 0.5 + 1.05, d / 2 + 0.02, false);
  box(g, 1.3, 0.2, 0.3, 0x5a3d22, 0, 0.5 + 2.2, d / 2 + 0.1, false);
  const glass = windowGlass();
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), glass);
    put(g, win, sx * Math.min(2.4, w * 0.32), 0.5 + height * 0.55 - 0.1, d / 2 + 0.03);
    box(g, 1, 0.12, 0.2, 0x5a3d22, sx * Math.min(2.4, w * 0.32), 0.5 + height * 0.55 - 0.55, d / 2 + 0.08, false);
  }
  if (inn) {
    // cartel colgante
    box(g, 0.1, 0.1, 1.1, 0x4a2f1a, w / 2 + 0.6, 0.5 + height * 0.7, d / 2 - 0.9);
    box(g, 0.1, 0.8, 0.8, 0xe8c26a, w / 2 + 0.6, 0.5 + height * 0.7 - 0.5, d / 2 - 0.9);
  }
}

function stall(g: THREE.Group, w: number, d: number): void {
  const x = w / 2 - 0.15;
  const z = d / 2 - 0.15;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.18, 2.2, 0.18, 0x5a3d22, sx * x, 1.1, sz * z);
  box(g, w - 0.4, 0.8, d - 0.5, 0x8a5f3c, 0, 0.4, 0); // mostrador
  // toldo a rayas
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = box(g, (w + 0.6) / n, 0.14, d + 0.6, i % 2 ? 0xf2efe6 : 0xd04a3a, -(w + 0.6) / 2 + ((i + 0.5) * (w + 0.6)) / n, 2.35, 0);
    t.rotation.x = 0.1;
  }
  // mercadería
  blob(g, 0.25, 0xe0463a, -0.7, 0.95, 0.1);
  blob(g, 0.25, 0xf2c13a, -0.2, 0.95, -0.1);
  blob(g, 0.25, 0x6ab547, 0.4, 0.95, 0.15);
  box(g, 0.5, 0.4, 0.5, 0xb88a52, 0.9, 1.0, -0.1);
}

// ---------- props sueltos ----------

function lamppost(scene: THREE.Scene, x: number, z: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  cyl(g, 0.08, 0.14, 3, 6, 0x3a3a40, 0, 1.5, 0);
  box(g, 0.5, 0.5, 0.5, 0xfff0b0, 0, 3.25, 0).material = lampGlass();
  cone(g, 0.45, 0.4, 4, 0x3a3a40, 0, 3.7, 0).rotation.y = Math.PI / 4;
  scene.add(g);
}

function barrel(scene: THREE.Scene, x: number, z: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  cyl(g, 0.4, 0.4, 0.9, 8, 0x8a5a2c, 0, 0.45, 0);
  cyl(g, 0.42, 0.42, 0.08, 8, 0x3a3a40, 0, 0.25, 0);
  cyl(g, 0.42, 0.42, 0.08, 8, 0x3a3a40, 0, 0.7, 0);
  scene.add(g);
}

function crates(scene: THREE.Scene, x: number, z: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = hash2(x, z) * 3;
  box(g, 0.9, 0.9, 0.9, 0xb88a52, 0, 0.45, 0);
  box(g, 0.7, 0.7, 0.7, 0xa87a46, 0.9, 0.35, 0.2);
  box(g, 0.6, 0.6, 0.6, 0xc49860, 0.1, 1.2, 0.05);
  scene.add(g);
}

function fence(scene: THREE.Scene, x1: number, z1: number, x2: number, z2: number): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / 1.5));
  const g = new THREE.Group();
  g.position.set(x1, 0, z1);
  g.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  for (let i = 0; i <= n; i++) box(g, 0.14, 1.1, 0.14, 0x6a4526, (len * i) / n, 0.55, 0);
  box(g, len, 0.12, 0.08, 0x7a5430, len / 2, 0.85, 0);
  box(g, len, 0.12, 0.08, 0x7a5430, len / 2, 0.5, 0);
  scene.add(g);
}

function banner(scene: THREE.Scene, x: number, z: number, color: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  cyl(g, 0.06, 0.08, 3.6, 5, 0x5a3d22, 0, 1.8, 0);
  box(g, 0.05, 1.3, 0.8, color, 0, 2.8, 0.45);
  box(g, 0.06, 0.3, 0.3, 0xffd23f, 0, 2.9, 0.45);
  scene.add(g);
}

function deadTree(scene: THREE.Scene, x: number, z: number, h: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = h * 6;
  cyl(g, 0.12, 0.3, 3.2, 5, 0x3a3228, 0, 1.6, 0);
  const b1 = cyl(g, 0.06, 0.12, 1.6, 4, 0x3a3228, 0.5, 2.6, 0);
  b1.rotation.z = -0.9;
  const b2 = cyl(g, 0.05, 0.1, 1.3, 4, 0x3a3228, -0.4, 2.2, 0.1);
  b2.rotation.z = 0.8;
  scene.add(g);
}

function runeCircle(scene: THREE.Scene, x: number, z: number, r: number): void {
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 18), mat(0x8c8579));
  floor.position.set(x, 0.04, z);
  floor.receiveShadow = true;
  scene.add(floor);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.08, 18), mat(0xa39b8c));
  inner.position.set(x, 0.045, z);
  inner.receiveShadow = true;
  scene.add(inner);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.07, 4, 18), mat(0xb48cff, { emissive: 0x7a3cff }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.09, z);
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.35, 0.05, 4, 12), mat(0xb48cff, { emissive: 0x7a3cff }));
  ring2.rotation.x = Math.PI / 2;
  ring2.position.set(x, 0.09, z);
  scene.add(ring2);
}

// Props colocados a mano en Villa Nilo. Son decoración: no colisionan (son chicos y están
// pegados a los edificios, fuera de los caminos).
const LAMPS: Array<[number, number]> = [[-3.5, 3.5], [3.5, 3.5], [-3.5, -3.5], [3.5, -3.5], [11, -2], [-6, 14], [-10.5, 15]];

/** Halos de los faroles de la villa, para que la atmósfera los prenda de noche. */
export function lampGlows(): GlowSpot[] {
  return LAMPS.map(([x, z]) => ({ x, y: 3.3, z, color: 0xffc66a, size: 2.6, kind: 'lamp' as const }));
}

function addVillageProps(scene: THREE.Scene): void {
  for (const [x, z] of LAMPS) lamppost(scene, x, z);
  for (const [x, z] of [[-7.4, 10.8], [-7.4, 9.8], [10.8, 9.2], [2.8, -11.2], [-6.9, -13.4], [-19, -16]]) barrel(scene, x, z);
  for (const [x, z] of [[-17.2, 5], [10.9, -8.5], [-7, -17], [5.2, 10.8]]) crates(scene, x, z);
  fence(scene, -22, -20, -22, -6);
  fence(scene, -22, 6, -22, 20);
  fence(scene, -22, 20, -10, 20);
  banner(scene, -2.2, -4.5, 0xd04a3a);
  banner(scene, 2.2, -4.5, 0x3a6ad0);
  banner(scene, 13, -5, 0xe6b43a);
  banner(scene, 13, 5, 0xe6b43a);
  runeCircle(scene, -38, 0, 9.5);
}

// ---------- vegetación instanciada ----------


function collidesAny(x: number, z: number, cols: Collider[], pad: number): boolean {
  for (const c of cols) {
    if (c.shape === 'circle') {
      if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    } else if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
  }
  return false;
}

function inside(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function groundAt(regions: Region[], x: number, z: number): GroundKind {
  let kind: GroundKind = 'grass';
  for (const r of regions) if (inside(r.bounds, x, z)) kind = r.ground;
  return kind;
}

function scatter(
  geo: WorldGeometry,
  n: number,
  seed: number,
  kinds: GroundKind[],
  pad: number,
  exclude: (x: number, z: number) => boolean = () => false,
): Spot[] {
  const rand = rng(seed);
  const b = geo.bounds;
  const out: Spot[] = [];
  let guard = n * 20;
  while (out.length < n && guard-- > 0) {
    const x = b.minX + 1 + rand() * (b.maxX - b.minX - 2);
    const z = b.minZ + 1 + rand() * (b.maxZ - b.minZ - 2);
    if (!kinds.includes(groundAt(geo.regions, x, z))) continue;
    if (collidesAny(x, z, geo.colliders, pad) || exclude(x, z)) continue;
    out.push({ x, z });
  }
  return out;
}

function instanced(
  scene: THREE.Scene,
  geometry: THREE.BufferGeometry,
  spots: Spot[],
  colors: number[],
  seed: number,
  lift: number,
  scale: [number, number],
  material: THREE.Material = mat(0xffffff),
): void {
  if (spots.length === 0) return;
  const rand = rng(seed);
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  spots.forEach((p, i) => {
    const s = scale[0] + rand() * (scale[1] - scale[0]);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    m.compose(new THREE.Vector3(p.x, lift * s, p.z), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setHex(colors[Math.floor(rand() * colors.length)]));
  });
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export function addDecor(scene: THREE.Scene, geo: WorldGeometry): void {
  addVillageProps(scene);
  // Las cantidades están pensadas para 120x100 m; se escalan con el área del mapa.
  const b0 = geo.bounds;
  const k = ((b0.maxX - b0.minX) * (b0.maxZ - b0.minZ)) / 12000;
  const nearNpc = (x: number, z: number): boolean =>
    (Math.abs(z) < 22 && x > -23 && x < 15) || Math.hypot(x + 38, z) < 10.5; // villa y círculo rúnico

  // pasto
  const tuft = new THREE.ConeGeometry(0.1, 0.55, 3);
  instanced(scene, tuft, scatter(geo, Math.round(700 * k), 5, ['grass'], 0.4, nearNpc), [0x5aa83a, 0x6bbd44, 0x4c9433], 6, 0.27, [0.7, 1.5]);
  // flores
  const flower = new THREE.IcosahedronGeometry(0.14, 0);
  instanced(scene, flower, scatter(geo, Math.round(260 * k), 8, ['grass'], 0.5, nearNpc), [0xffffff, 0xffd23f, 0xff6fa3, 0xb48cff, 0xff8a3c], 9, 0.35, [0.8, 1.4]);
  // el suelo del campo: hojas caídas, ramitas, piedras sueltas y hongos
  const leaf = new THREE.PlaneGeometry(0.3, 0.2).rotateX(-Math.PI / 2);
  instanced(scene, leaf, scatter(geo, Math.round(120 * k), 40, ['grass'], 0.3, nearNpc), [0xd9822b, 0xe6a23a, 0xb8512a, 0xc9b13a, 0x8a6a2a], 41, 0.03, [0.8, 1.6], new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide }));
  const twig = new THREE.BoxGeometry(0.75, 0.05, 0.05);
  instanced(scene, twig, scatter(geo, Math.round(70 * k), 42, ['grass', 'swamp'], 0.3, nearNpc), [0x5c3d22, 0x6e4a2a, 0x4a3320], 43, 0.03, [0.6, 1.5]);
  const stone = new THREE.DodecahedronGeometry(0.22, 0);
  instanced(scene, stone, scatter(geo, Math.round(70 * k), 44, ['grass'], 0.5, nearNpc), [0x8a867c, 0x9a958a, 0x76726a, 0xa09a8e], 45, 0.1, [0.7, 1.9]);
  const cap = new THREE.SphereGeometry(0.16, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  instanced(scene, cap, scatter(geo, Math.round(26 * k), 46, ['grass'], 0.5, nearNpc), [0xd23a2a, 0xe6c9a0, 0xc98a3a], 47, 0.05, [0.8, 1.6]);
  // piedritas en el camino y la villa
  const pebble = new THREE.DodecahedronGeometry(0.16, 0);
  instanced(scene, pebble, scatter(geo, Math.round(90 * k), 12, ['road'], 0.6), [0x8a867c, 0x9a958a, 0x76726a], 13, 0.08, [0.7, 1.6]);
  // pantano: juncos, hongos que brillan, charcos
  const reed = new THREE.ConeGeometry(0.07, 1.4, 3);
  instanced(scene, reed, scatter(geo, Math.round(200 * k), 20, ['swamp'], 0.4), [0x6b8a3a, 0x4f6b2c, 0x7d9a45], 21, 0.7, [0.7, 1.6]);
  const shroom = new THREE.SphereGeometry(0.22, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  instanced(
    scene,
    shroom,
    scatter(geo, Math.round(60 * k), 24, ['swamp'], 0.6),
    [0x9a6fff, 0x5fe0b0, 0xff7fb0],
    25,
    0.1,
    [0.9, 1.8],
    mat(0xffffff, { emissive: 0x303030 }),
  );
  const puddle = new THREE.CylinderGeometry(0.9, 0.9, 0.02, 9);
  instanced(scene, puddle, scatter(geo, Math.round(26 * k), 28, ['swamp'], 1.2), [0x2c4a5a, 0x35566a], 29, 0.05, [0.8, 2.2], mat(0xffffff, { rough: 0.15, flat: false }));
  // árboles muertos del pantano
  scatter(geo, Math.round(14 * k), 30, ['swamp'], 1.5).forEach((p, i) => deadTree(scene, p.x, p.z, hash2(p.x, i)));
  // árboles de relleno en el borde del mapa (no colisionan: están contra el muro)
  const edge = scatter(geo, Math.round(40 * k), 33, ['grass', 'swamp'], 2, (x, z) => {
    const b = geo.bounds;
    return Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z) > 5;
  });
  addTrees(scene, edge);
}

// ---------- paisaje lejano ----------

/** Colinas, montañas y nubes. Devuelve el material de las nubes para teñirlo con la hora. */
export function addBackdrop(scene: THREE.Scene, geo: WorldGeometry): THREE.MeshBasicMaterial {
  const b = geo.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const rand = rng(77);
  const reach = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2; // radio que abarca el mapa
  const tones = [0x5f8a4a, 0x6a9a52, 0x4f7a45, 0x7a9a6a];
  // colinas redondeadas en anillo
  for (let i = 0; i < 34; i++) {
    const ang = (i / 34) * Math.PI * 2 + rand() * 0.2;
    const dist = reach + 25 + rand() * 40;
    const r = 18 + rand() * 20;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(tones[Math.floor(rand() * tones.length)]));
    hill.scale.y = 0.45 + rand() * 0.3;
    hill.position.set(cx + Math.cos(ang) * dist, -2, cz + Math.sin(ang) * dist);
    scene.add(hill);
  }
  // montañas lejanas con picos nevados
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + rand() * 0.3;
    const dist = reach + 90 + rand() * 30;
    const h = 38 + rand() * 30;
    const g = new THREE.Group();
    g.position.set(cx + Math.cos(ang) * dist, 0, cz + Math.sin(ang) * dist);
    cone(g, h * 0.6, h, 5, 0x6b7a99, 0, h / 2 - 3, 0);
    cone(g, h * 0.22, h * 0.34, 5, 0xf2f6ff, 0, h * 0.83 - 3, 0);
    scene.add(g);
  }
  // nubes planas
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    const ang = rand() * Math.PI * 2;
    const dist = 40 + rand() * (reach + 100);
    c.position.set(cx + Math.cos(ang) * dist, 55 + rand() * 25, cz + Math.sin(ang) * dist);
    const parts = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < parts; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + rand() * 4, 0), cloudMat);
      m.scale.y = 0.45;
      m.position.set((k - parts / 2) * 6, rand() * 2, rand() * 3);
      c.add(m);
    }
    scene.add(c);
  }
  return cloudMat;
}
