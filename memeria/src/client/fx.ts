import * as THREE from 'three';

// Efectos visuales de combate: arcos de espada, proyectiles, anillos, chispas y las "caras"
// de la mascota que lanza la habilidad. Todo es de vida corta; cada efecto se quita de la
// escena y libera su material al terminar. Las geometrías son compartidas.

export type FxStyle = { color: number; face: string };
export const CLASS_FX: Record<string, FxStyle> = {
  pepe: { color: 0x7dff5a, face: 'pepe' },
  shiba: { color: 0xff9a3c, face: 'shiba' },
  doge: { color: 0xffd84a, face: 'doge' },
  popcat: { color: 0xff8fb3, face: 'popcat' },
  wif: { color: 0xff7fb0, face: 'wif' },
};

interface Effect {
  obj: THREE.Object3D;
  age: number;
  life: number;
  /** u en [0,1] */
  tick: (u: number, dt: number) => void;
}

const RING = new THREE.RingGeometry(0.88, 1, 28);
RING.rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 24);
DISC.rotateX(-Math.PI / 2);
const CUBE = new THREE.BoxGeometry(1, 1, 1);
const ORB = new THREE.IcosahedronGeometry(1, 0);
const COIN = new THREE.CylinderGeometry(1, 1, 0.25, 10);
// Mancha de borde difuso: gradiente radial sin contorno.
const SOFT = new THREE.PlaneGeometry(1, 1);
SOFT.rotateX(-Math.PI / 2);
let softTex: THREE.CanvasTexture | null = null;
function softMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  if (!softTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    softTex = new THREE.CanvasTexture(c);
    softTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshBasicMaterial({
    color,
    map: softTex,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: false,
  });
}

const PILLAR = new THREE.CylinderGeometry(1, 1.15, 1, 12, 1, true);

function glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

// Caras de pixel art (16x16) de cada mascota, dibujadas por código: nada de arte externo.
const faceCache = new Map<string, THREE.CanvasTexture>();
function faceTexture(kind: string): THREE.CanvasTexture {
  const hit = faceCache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const r = (x: number, y: number, w: number, h: number, col: string): void => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  if (kind === 'pepe') {
    r(2, 4, 12, 9, '#4f9a3a');
    r(1, 6, 14, 5, '#4f9a3a');
    r(2, 2, 5, 5, '#ffffff');
    r(9, 2, 5, 5, '#ffffff');
    r(4, 4, 2, 2, '#111111');
    r(10, 4, 2, 2, '#111111');
    r(2, 2, 5, 2, '#3d7d2c');
    r(9, 2, 5, 2, '#3d7d2c');
    r(3, 10, 10, 1, '#a83232');
    r(5, 11, 6, 1, '#7bc255');
  } else if (kind === 'shiba') {
    r(1, 1, 3, 4, '#e58a3c');
    r(12, 1, 3, 4, '#e58a3c');
    r(2, 4, 12, 9, '#e58a3c');
    r(4, 9, 8, 4, '#f5e6c8');
    r(4, 6, 2, 2, '#111111');
    r(10, 6, 2, 2, '#111111');
    r(7, 9, 2, 2, '#111111');
    r(4, 4, 2, 1, '#f5e6c8');
    r(10, 4, 2, 1, '#f5e6c8');
  } else if (kind === 'doge') {
    r(1, 1, 3, 4, '#f0cf86');
    r(12, 1, 3, 4, '#f0cf86');
    r(2, 4, 12, 9, '#f0cf86');
    r(4, 9, 8, 4, '#fff4d6');
    r(4, 6, 3, 2, '#111111');
    r(9, 6, 3, 2, '#111111');
    r(7, 9, 2, 2, '#111111');
    r(4, 5, 3, 1, '#f0cf86');
    r(9, 5, 3, 1, '#f0cf86');
  } else if (kind === 'popcat') {
    r(1, 1, 3, 4, '#f4f0ee');
    r(12, 1, 3, 4, '#f4f0ee');
    r(2, 4, 12, 9, '#f4f0ee');
    r(5, 6, 1, 2, '#111111');
    r(10, 6, 1, 2, '#111111');
    r(5, 9, 6, 4, '#3a1620');
    r(6, 11, 4, 2, '#ff9db5');
    r(2, 8, 2, 2, '#ff9db5');
    r(12, 8, 2, 2, '#ff9db5');
  } else if (kind === 'wif') {
    r(3, 0, 10, 4, '#ff7fb0');
    r(7, 0, 2, 1, '#fff0f6');
    r(2, 4, 12, 9, '#c9a07a');
    r(1, 5, 2, 6, '#8a5a38');
    r(13, 5, 2, 6, '#8a5a38');
    r(4, 9, 8, 4, '#f1dfc4');
    r(4, 6, 2, 2, '#111111');
    r(10, 6, 2, 2, '#111111');
    r(7, 9, 2, 2, '#111111');
  } else {
    // moneda
    r(4, 1, 8, 14, '#e0b23a');
    r(2, 3, 12, 10, '#e0b23a');
    r(5, 4, 6, 8, '#f5d36a');
    r(7, 5, 2, 6, '#b88a1c');
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(kind, t);
  return t;
}

export class Fx {
  private readonly list: Effect[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.age += dt;
      const u = Math.min(1, e.age / e.life);
      e.tick(u, dt);
      if (u >= 1) {
        this.scene.remove(e.obj);
        e.obj.traverse((o) => {
          const m = (o as THREE.Mesh | THREE.Sprite).material as THREE.Material | undefined;
          m?.dispose();
        });
        this.list.splice(i, 1);
      }
    }
  }

  private add(obj: THREE.Object3D, life: number, tick: (u: number, dt: number) => void): void {
    this.scene.add(obj);
    this.list.push({ obj, age: 0, life, tick });
  }

  /** Anillo plano que crece de r0 a r1 y se desvanece. */
  ring(x: number, z: number, color: number, r0: number, r1: number, life: number, y = 0.12): void {
    const m = new THREE.Mesh(RING, glow(color));
    m.position.set(x, y, z);
    this.add(m, life, (u) => {
      const r = r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2));
      m.scale.set(r, 1, r);
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - u;
    });
  }

  /** Anillo que se cierra sobre el lanzador mientras carga la habilidad. */
  charge(anchor: THREE.Object3D, color: number, r0: number, life: number): void {
    const m = new THREE.Mesh(RING, glow(color, 0.2));
    this.add(m, life, (u) => {
      m.position.set(anchor.position.x, 0.14, anchor.position.z);
      const r = r0 * (1 - u) + 0.3;
      m.scale.set(r, 1, r);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + u * 0.7;
    });
  }

  /**
   * Aviso en el piso de un golpe de mob que viene. Sin contorno: es una mancha de gradiente
   * radial con el borde difuso (el daño también tiene alcance aproximado), que se va
   * llenando y late hasta que el mob pega.
   */
  telegraph(anchor: THREE.Object3D, radius: number, life: number): void {
    const g = new THREE.Group();
    const outer = new THREE.Mesh(SOFT, softMat(0xff2a1e, 0.5));
    const inner = new THREE.Mesh(SOFT, softMat(0xff7a3a, 0.7));
    g.add(outer, inner);
    outer.scale.set(radius * 2.1, 1, radius * 2.1);
    this.add(g, life, (u) => {
      g.position.set(anchor.position.x, 0.1, anchor.position.z);
      const pulse = 1 + Math.sin(u * 22) * 0.04 * u;
      const r = radius * 2.1 * (0.3 + 0.7 * u) * pulse;
      inner.scale.set(r, 1, r);
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.4 * u;
      (inner.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * u;
    });
  }

  /** Columna de luz alrededor del lanzador. */
  pillar(x: number, z: number, color: number, radius: number, life: number): void {
    const m = new THREE.Mesh(PILLAR, glow(color, 0.55));
    this.add(m, life, (u) => {
      const h = 7 * Math.min(1, u * 4);
      m.scale.set(radius * (1 - u * 0.5), h, radius * (1 - u * 0.5));
      m.position.set(x, h / 2, z);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - u);
    });
  }

  /** Arco de espada que barre el frente del jugador. */
  slash(x: number, z: number, facing: number, range: number, color: number): void {
    const arc = 2.3;
    const geo = new THREE.RingGeometry(range * 0.45, range, 18, 1, -arc / 2, arc);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, glow(color, 0.9));
    m.position.set(x, 0.9, z);
    this.add(m, 0.24, (u) => {
      m.rotation.y = facing - Math.PI / 2 + (0.9 - 1.8 * u);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u * u);
      m.position.y = 0.9 + u * 0.2;
    });
    // La geometría del arco es propia de cada efecto: se libera junto con el material.
    const prev = this.list[this.list.length - 1];
    const baseTick = prev.tick;
    prev.tick = (u, dt) => {
      baseTick(u, dt);
      if (u >= 1) geo.dispose();
    };
  }

  /** Proyectil corto con estela, del bastón al blanco. */
  bolt(from: THREE.Vector3, to: THREE.Vector3, color: number, life = 0.14): void {
    const g = new THREE.Group();
    const head = new THREE.Mesh(ORB, glow(0xffffff));
    head.scale.setScalar(0.28);
    g.add(head);
    const trail: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(ORB, glow(color, 0.8 - i * 0.18));
      t.scale.setScalar(0.34 - i * 0.05);
      g.add(t);
      trail.push(t);
    }
    this.add(g, life, (u) => {
      head.position.lerpVectors(from, to, u);
      trail.forEach((t, i) => t.position.lerpVectors(from, to, Math.max(0, u - (i + 1) * 0.1)));
    });
  }

  /** Estallido de cubitos que salen disparados y caen. */
  sparks(x: number, y: number, z: number, color: number, n = 8, speed = 4): void {
    const g = new THREE.Group();
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(CUBE, glow(color));
      p.scale.setScalar(0.12 + Math.random() * 0.1);
      g.add(p);
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random() * 0.7);
      vel.push(new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s));
      p.position.set(x, y, z);
    }
    this.add(g, 0.45, (u, dt) => {
      g.children.forEach((c, i) => {
        vel[i].y -= 14 * dt;
        c.position.addScaledVector(vel[i], dt);
        c.rotation.x += dt * 8;
        (c as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 1 - u;
      });
    });
  }

  /** Caras de la mascota que salen en abanico desde el lanzador: la firma de cada habilidad. */
  faces(x: number, z: number, kind: string, n: number, radius: number, life: number): void {
    const g = new THREE.Group();
    const dirs: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: faceTexture(kind), transparent: true, depthWrite: false, fog: false }),
      );
      s.scale.setScalar(0.9);
      g.add(s);
      dirs.push((i / n) * Math.PI * 2 + Math.random() * 0.3);
    }
    this.add(g, life, (u) => {
      g.children.forEach((c, i) => {
        const r = radius * (1 - Math.pow(1 - u, 2));
        c.position.set(x + Math.cos(dirs[i]) * r, 1.2 + u * 2.2 + Math.sin(u * 6 + i) * 0.2, z + Math.sin(dirs[i]) * r);
        c.scale.setScalar(0.9 + Math.sin(u * Math.PI) * 0.6);
        (c as THREE.Sprite).material.opacity = u < 0.7 ? 1 : (1 - u) / 0.3;
      });
    });
  }

  /** Monedas que suben girando (To the Moon). */
  coins(x: number, z: number, n: number, life: number): void {
    const g = new THREE.Group();
    const phase: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(COIN, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, fog: false }));
      c.scale.setScalar(0.28);
      c.rotation.z = Math.PI / 2;
      g.add(c);
      phase.push((i / n) * Math.PI * 2);
    }
    this.add(g, life, (u) => {
      g.children.forEach((c, i) => {
        const a = phase[i] + u * 5;
        const r = 0.6 + u * 1.8;
        c.position.set(x + Math.cos(a) * r, 0.4 + u * 6 * (0.6 + (i % 3) * 0.25), z + Math.sin(a) * r);
        c.rotation.y = u * 20 + i;
        (c as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = u < 0.75 ? 1 : (1 - u) / 0.25;
      });
    });
  }
}
