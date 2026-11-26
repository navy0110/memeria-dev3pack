// Atmósfera de Memeria: ciclo de día y noche, cielo con sol, luna, estrellas, aurora y estrellas fugaces,
// luciérnagas y pétalos, orbes en los árboles encantados y la Luna de Sangre. Todo se dibuja en shaders
// (un domo de cielo y dos nubes de puntos): no hay luces nuevas ni mallas por elemento.
//
// La hora sale del reloj de pared (Date.now), así que todos los jugadores ven el mismo cielo sin que el
// servidor tenga que decir nada. Un día de Memeria dura 12 minutos reales.
//   ?hour=22     congela la hora (para mirar o sacar capturas)
//   ?cycle=60    el día dura 60 s en vez de 12 min
//   ?blood=1     fuerza la Luna de Sangre
import * as THREE from 'three';

const params = new URLSearchParams(location.search);
const DAY_MS = (Number(params.get('cycle')) || 12 * 60) * 1000;
const FIXED_HOUR = params.has('hour') ? Number(params.get('hour')) % 24 : null;
const FORCE_BLOOD = params.has('blood');
/** Una de cada tantas noches sale la Luna de Sangre. */
const BLOOD_EVERY = 6;
/** Alto fijo del render (ver scene.ts): sirve para pasar metros a píxeles en los puntos. */
const POINT_SCALE = 360 / (2 * Math.tan((60 / 2) * (Math.PI / 180)));

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

/** Uniformes que comparten los árboles (balanceo y brillo nocturno). Los reparte scenery.ts, los mueve la atmósfera. */
export const treeFx = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uBlood: { value: 0 },
};

interface Key {
  h: number;
  top: number;
  mid: number;
  horizon: number;
  fog: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunI: number;
}

// Una fila por momento del día; entre filas se interpola. h = hora (0-24).
const KEYS: Key[] = [
  { h: 0, top: 0x050816, mid: 0x0b1030, horizon: 0x1a2250, fog: 0x1a2250, hemiSky: 0x5a6cb0, hemiGround: 0x1c2244, hemi: 1.15, sun: 0x8fa8ff, sunI: 0 },
  { h: 5, top: 0x0a1038, mid: 0x1c2a5c, horizon: 0x3a3a70, fog: 0x3a3a70, hemiSky: 0x6070b0, hemiGround: 0x2a2a4a, hemi: 1.1, sun: 0xffa070, sunI: 0 },
  { h: 6.3, top: 0x3a4f9a, mid: 0xe08a7a, horizon: 0xffb27a, fog: 0xe6a888, hemiSky: 0xffd0b0, hemiGround: 0x6a6a50, hemi: 1.0, sun: 0xffb070, sunI: 0.9 },
  { h: 8, top: 0x4a82d0, mid: 0x9ccdf0, horizon: 0xf0e6d0, fog: 0xd8e6e8, hemiSky: 0xcfe4ff, hemiGround: 0x7a8a50, hemi: 1.3, sun: 0xfff1d6, sunI: 1.5 },
  { h: 12, top: 0x3f78c8, mid: 0x8fc3ee, horizon: 0xe4f0e8, fog: 0xcfe3ec, hemiSky: 0xcfe4ff, hemiGround: 0x7a8a50, hemi: 1.35, sun: 0xfff1d6, sunI: 1.6 },
  { h: 17, top: 0x4a7ac0, mid: 0x9ac0e0, horizon: 0xf0e0c0, fog: 0xe0dccc, hemiSky: 0xd8e0f0, hemiGround: 0x7a8a50, hemi: 1.3, sun: 0xffe6b0, sunI: 1.5 },
  { h: 18.8, top: 0x3a3f8a, mid: 0xd9667a, horizon: 0xffa050, fog: 0xd88a70, hemiSky: 0xffb090, hemiGround: 0x504050, hemi: 0.95, sun: 0xff8a50, sunI: 0.85 },
  { h: 20.3, top: 0x141a4a, mid: 0x4a3070, horizon: 0xa05080, fog: 0x8a4a7a, hemiSky: 0x6a70b0, hemiGround: 0x2a2a48, hemi: 0.85, sun: 0xff6a40, sunI: 0 },
  { h: 22, top: 0x070a1e, mid: 0x0e1438, horizon: 0x1c2658, fog: 0x1c2658, hemiSky: 0x5a6cb0, hemiGround: 0x1c2244, hemi: 1.15, sun: 0x8fa8ff, sunI: 0 },
  { h: 24, top: 0x050816, mid: 0x0b1030, horizon: 0x1a2250, fog: 0x1a2250, hemiSky: 0x5a6cb0, hemiGround: 0x1c2244, hemi: 1.15, sun: 0x8fa8ff, sunI: 0 },
];
const KEY_COLORS = KEYS.map((k) => ({
  top: new THREE.Color(k.top),
  mid: new THREE.Color(k.mid),
  horizon: new THREE.Color(k.horizon),
  fog: new THREE.Color(k.fog),
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
  sun: new THREE.Color(k.sun),
}));

const BLOOD = {
  top: new THREE.Color(0x2a0510),
  mid: new THREE.Color(0x5a0f1c),
  horizon: new THREE.Color(0xa02a2a),
  fog: new THREE.Color(0x3a1018),
  hemiSky: new THREE.Color(0xa04a5a),
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- cielo ----------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uMid, uHorizon, uSunDir, uMoonDir, uSunCol, uMoonCol;
uniform float uTime, uSunVis, uMoonVis, uStars, uAurora, uBlood;

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = clamp(y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, t));
  col = mix(col, uTop, smoothstep(0.3, 1.0, t));
  if (y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-y * 4.0, 0.0, 1.0));

  // Sol: resplandor y disco.
  float sd = dot(d, uSunDir);
  col += uSunCol * (pow(max(sd, 0.0), 6.0) * 0.22 + pow(max(sd, 0.0), 80.0) * 0.55) * uSunVis;
  col = mix(col, vec3(1.0, 0.96, 0.82) * 1.35, smoothstep(0.99935, 0.99975, sd) * uSunVis);

  if (y > -0.02) {
    float fade = smoothstep(-0.02, 0.12, y);

    // Estrellas: celdas con un punto brillante que titila.
    if (uStars > 0.01) {
      vec3 p = d * 72.0;
      vec3 id = floor(p);
      float h = hash3(id);
      float star = step(0.991, h) * smoothstep(0.38, 0.0, length(fract(p) - 0.5));
      star *= 0.55 + 0.45 * sin(uTime * (2.0 + h * 6.0) + h * 60.0);
      float big = step(0.9988, h) * smoothstep(0.5, 0.0, length(fract(p) - 0.5));
      col += (vec3(0.85, 0.92, 1.0) * star + vec3(1.0, 0.95, 0.8) * big * 1.4) * uStars * fade * (1.0 - uBlood * 0.45);

      // Estrellas fugaces: dos, cada tanto, cruzan el cielo con cola.
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float tt = uTime / (7.0 + fk * 3.3) + fk * 0.37;
        float cyc = floor(tt);
        float f = fract(tt);
        float dur = 0.1;
        if (f < dur) {
          float pr = f / dur;
          vec3 s = normalize(vec3(hash2(vec2(cyc, fk)) * 2.0 - 1.0, 0.5 + hash2(vec2(cyc, 7.0 + fk)) * 0.4, hash2(vec2(cyc, 3.0 + fk)) * 2.0 - 1.0));
          vec3 v = normalize(cross(s, vec3(0.0, 1.0, 0.0)) + vec3(0.0, -0.3, 0.0));
          vec3 head = normalize(s + v * pr * 0.6);
          vec3 td = normalize(v - head * dot(v, head));
          vec3 rel = d - head;
          float along = dot(rel, td);
          float across = length(rel - td * along);
          float m = smoothstep(-0.2, 0.0, along) * step(along, 0.004) * smoothstep(0.0045, 0.0, across) * (1.0 - pr * 0.6);
          col += vec3(1.0, 0.96, 0.88) * m * 1.6 * uStars;
        }
      }
    }

    // Aurora: cortinas verdes, celestes y violetas que ondulan; en la Luna de Sangre se ponen carmesí.
    if (uAurora > 0.01) {
      float az = atan(d.z, d.x);
      float wave = sin(az * 4.0 + uTime * 0.18 + noise(vec2(az * 2.0, uTime * 0.07)) * 4.0);
      float h0 = 0.34 + 0.11 * wave;
      float band = exp(-pow((y - h0) * 6.0, 2.0));
      float rays = 0.35 + 0.65 * noise(vec2(az * 22.0 + wave, uTime * 0.35));
      float shimmer = 0.75 + 0.25 * sin(uTime * 1.3 + az * 9.0);
      vec3 ac = mix(vec3(0.1, 1.0, 0.5), vec3(0.2, 0.65, 1.0), smoothstep(0.25, 0.55, y));
      ac = mix(ac, vec3(0.85, 0.25, 1.0), smoothstep(0.5, 0.75, y) * 0.8);
      ac = mix(ac, vec3(1.0, 0.12, 0.2), uBlood);
      col += ac * band * rays * shimmer * uAurora * fade * 0.85;
    }

    // Luna con cráteres y halo.
    float md = dot(d, uMoonDir);
    float moonR = 0.05;
    vec3 tx = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
    vec3 ty = cross(uMoonDir, tx);
    vec2 mp = vec2(dot(d, tx), dot(d, ty)) / moonR;
    float cm = cos(moonR);
    float disc = smoothstep(cm - 0.0004, cm + 0.0003, md);
    float crater = noise(mp * 3.5 + 3.0) * 0.5 + noise(mp * 8.0) * 0.28;
    vec3 mcol = uMoonCol * mix(0.7, 1.15, crater);
    col += uMoonCol * (pow(max(md, 0.0), 30.0) * 0.28 + pow(max(md, 0.0), 400.0) * 0.4) * uMoonVis;
    col = mix(col, mcol * 1.15, disc * uMoonVis);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// ---------- luciérnagas y pétalos ----------

const AMBIENT_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uNight, uBlood, uSpan, uScale;
uniform vec2 uCenter;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 base = aSeed.xy * uSpan;
  vec2 drift = vec2(sin(uTime * 0.25 + aSeed.z * 20.0), cos(uTime * 0.21 + aSeed.w * 20.0)) * 1.8
             + vec2(uTime * 0.4 * (aSeed.z - 0.5), uTime * 0.4 * (aSeed.w - 0.5));
  vec2 xz = mod(base + drift - uCenter + uSpan * 0.5, uSpan) - uSpan * 0.5 + uCenter;
  // De noche flotan a media altura; de día caen despacio como pétalos.
  float floatY = 0.6 + aSeed.w * 3.2 + sin(uTime * 0.8 + aSeed.z * 30.0) * 0.35;
  float fallY = 0.3 + mod(aSeed.w * 4.0 - uTime * 0.35 - aSeed.z * 3.0, 4.2);
  float y = mix(fallY, floatY, uNight);
  vec4 mv = modelViewMatrix * vec4(xz.x, y, xz.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.45 + 0.55 * sin(uTime * (1.4 + aSeed.z * 3.0) + aSeed.w * 50.0);
  vA = mix(0.55, tw, uNight);
  vec3 petal = mix(vec3(1.0, 0.82, 0.9), vec3(1.0, 0.9, 0.55), aSeed.z);
  vec3 fly = mix(vec3(0.55, 1.0, 0.4), vec3(0.4, 0.95, 1.0), aSeed.z);
  fly = mix(fly, vec3(1.0, 0.3, 0.15), uBlood);
  vCol = mix(petal, fly, uNight);
  float size = mix(0.07, 0.26, uNight) * (0.6 + aSeed.z * 0.8);
  gl_PointSize = min(size * uScale / max(-mv.z, 0.5), 48.0);
}`;

const GLOW_VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec2 aInfo;
attribute float aKind;
uniform float uTime, uNight, uBlood, uScale;
varying vec3 vCol;
varying float vA;
void main() {
  float ph = aInfo.y;
  float orb = 1.0 - aKind;
  vec3 p = position;
  p.y += orb * sin(uTime * 0.9 + ph) * 0.18;
  p.x += orb * sin(uTime * 0.6 + ph * 1.7) * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float pulse = 0.78 + 0.22 * sin(uTime * (1.2 + ph * 0.1) + ph * 3.0);
  vA = mix(mix(0.3, 1.0, uNight) * pulse, uNight * 0.95, aKind);
  vCol = mix(aColor, vec3(1.0, 0.22, 0.15), uBlood * orb);
  gl_PointSize = min(aInfo.x * uScale / max(-mv.z, 0.5), 64.0);
}`;

const POINT_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  a *= a;
  gl_FragColor = vec4(vCol, a * vA);
  #include <colorspace_fragment>
}`;

export interface GlowSpot {
  x: number;
  y: number;
  z: number;
  /** Color 0xRRGGBB. */
  color: number;
  /** Tamaño del halo en metros. */
  size: number;
  /** 'orb' flota y titila todo el día (tenue); 'lamp' solo brilla de noche. */
  kind: 'orb' | 'lamp';
}

export interface AtmosphereParts {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.Fog;
  /** Material compartido de las nubes planas, para teñirlo con la hora. */
  clouds: THREE.MeshBasicMaterial;
  /** Materiales que se encienden de noche: ventanas y faroles. */
  windows: THREE.MeshStandardMaterial;
  lamps: THREE.MeshStandardMaterial;
}

const scratch = { top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), sun: new THREE.Color() };
const WHITE = new THREE.Color(0xffffff);
const MOON_BLUE = new THREE.Color(0x8fa8ff);
const BLOOD_LIGHT = new THREE.Color(0xff5a4a);
const MOON_WHITE = new THREE.Color(0.88, 0.92, 1.0);
const MOON_RED = new THREE.Color(1.0, 0.22, 0.14);

export class Atmosphere {
  /** Hora del mundo (0-24). */
  hour = 12;
  /** Cuánto de noche es: 0 de día, 1 en plena noche. */
  night = 0;
  /** 0-1: cuánto se nota la Luna de Sangre. */
  blood = 0;
  phase: Phase = 'day';
  private clock = 0;
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  private readonly moonDir = new THREE.Vector3(0, -1, 0);
  private readonly lightDir = new THREE.Vector3();
  private readonly focusAt = new THREE.Vector3();
  private readonly sky: THREE.Mesh;
  private readonly skyU: Record<string, THREE.IUniform>;
  private readonly ambient: THREE.Points;
  private readonly ambientU: Record<string, THREE.IUniform>;
  private glow: THREE.Points | null = null;
  private glowU: Record<string, THREE.IUniform> | null = null;
  private pools: THREE.Mesh[] = [];
  private readonly poolMat: THREE.MeshBasicMaterial;

  constructor(private readonly parts: AtmosphereParts) {
    const u = (v: unknown): THREE.IUniform => ({ value: v });
    this.skyU = {
      uTop: u(new THREE.Color()),
      uMid: u(new THREE.Color()),
      uHorizon: u(new THREE.Color()),
      uSunDir: u(this.sunDir),
      uMoonDir: u(this.moonDir),
      uSunCol: u(new THREE.Color()),
      uMoonCol: u(new THREE.Color()),
      uTime: u(0),
      uSunVis: u(1),
      uMoonVis: u(0),
      uStars: u(0),
      uAurora: u(0),
      uBlood: u(0),
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(350, 24, 16),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    parts.scene.add(this.sky);

    // Luciérnagas de noche, pétalos de día: una nube de puntos que sigue al jugador.
    const N = 200;
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.ambientU = { uTime: u(0), uNight: u(0), uBlood: u(0), uSpan: u(56), uScale: u(POINT_SCALE), uCenter: u(new THREE.Vector2()) };
    this.ambient = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({ vertexShader: AMBIENT_VERT, fragmentShader: POINT_FRAG, uniforms: this.ambientU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.ambient.frustumCulled = false;
    parts.scene.add(this.ambient);

    // Charco de luz de los faroles.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,214,130,0.9)');
    grad.addColorStop(0.5, 'rgba(255,190,100,0.35)');
    grad.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  }

  /** Orbes de los árboles encantados y halos de los faroles (con su charco de luz en el suelo). */
  addGlows(spots: GlowSpot[]): void {
    const n = spots.length;
    if (!n) return;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const info = new Float32Array(n * 2);
    const kind = new Float32Array(n);
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      pos.set([s.x, s.y, s.z], i * 3);
      c.set(s.color).toArray(col, i * 3);
      info[i * 2] = s.size;
      info[i * 2 + 1] = Math.random() * 20;
      kind[i] = s.kind === 'lamp' ? 1 : 0;
      if (s.kind === 'lamp') {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), this.poolMat);
        pool.position.set(s.x, 0.07, s.z);
        pool.renderOrder = 1;
        this.parts.scene.add(pool);
        this.pools.push(pool);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
    geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    this.glowU = { uTime: { value: 0 }, uNight: { value: 0 }, uBlood: { value: 0 }, uScale: { value: POINT_SCALE } };
    this.glow = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: POINT_FRAG, uniforms: this.glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.glow.frustumCulled = false;
    this.parts.scene.add(this.glow);
  }

  /** La luz del sol/luna y su sombra siguen al jugador. */
  focus(x: number, z: number): void {
    this.focusAt.set(x, 0, z);
  }

  /** Hora para mostrar: «14:30». */
  get clockText(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** ¿Estamos en una noche de Luna de Sangre? */
  get bloodMoon(): boolean {
    return this.blood > 0.5;
  }

  update(dt: number, camera: THREE.Camera, px: number, pz: number): void {
    this.clock += dt;
    const now = Date.now();
    this.hour = FIXED_HOUR ?? ((now % DAY_MS) / DAY_MS) * 24;
    const nightIndex = Math.floor(now / DAY_MS) - (this.hour < 12 ? 1 : 0);
    const isBloodNight = FORCE_BLOOD || (((nightIndex % BLOOD_EVERY) + BLOOD_EVERY) % BLOOD_EVERY === 3);

    // Posiciones del sol y la luna: el sol sale por +x a las 6, pasa por el cenit a las 12 y se pone a las 18.
    const ang = ((this.hour - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    this.moonDir.set(-Math.cos(ang), -Math.sin(ang), -0.25).normalize();
    this.night = smooth(0.12, -0.28, this.sunDir.y);
    this.blood = isBloodNight ? this.night : 0;
    this.phase = this.night > 0.6 ? 'night' : this.hour >= 5 && this.hour < 8 ? 'dawn' : this.hour >= 17.5 && this.hour < 20.5 ? 'dusk' : this.night > 0.3 ? 'night' : 'day';

    // Interpolación entre filas de la tabla.
    let i = 0;
    while (i < KEYS.length - 2 && this.hour >= KEYS[i + 1].h) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = smooth(0, 1, (this.hour - a.h) / (b.h - a.h));
    const ca = KEY_COLORS[i];
    const cb = KEY_COLORS[i + 1];
    const s = scratch;
    s.top.copy(ca.top).lerp(cb.top, t);
    s.mid.copy(ca.mid).lerp(cb.mid, t);
    s.horizon.copy(ca.horizon).lerp(cb.horizon, t);
    s.fog.copy(ca.fog).lerp(cb.fog, t);
    s.hemiSky.copy(ca.hemiSky).lerp(cb.hemiSky, t);
    s.hemiGround.copy(ca.hemiGround).lerp(cb.hemiGround, t);
    s.sun.copy(ca.sun).lerp(cb.sun, t);
    const hemiI = a.hemi + (b.hemi - a.hemi) * t;
    const sunI = a.sunI + (b.sunI - a.sunI) * t;
    if (this.blood > 0) {
      const k = this.blood;
      s.top.lerp(BLOOD.top, k * 0.85);
      s.mid.lerp(BLOOD.mid, k * 0.85);
      s.horizon.lerp(BLOOD.horizon, k * 0.7);
      s.fog.lerp(BLOOD.fog, k * 0.75);
      s.hemiSky.lerp(BLOOD.hemiSky, k * 0.6);
    }

    // Luces: el sol manda mientras está sobre el horizonte; después, la luna. En el cruce las dos valen cero.
    const { sun, hemi, fog, scene } = this.parts;
    const sunW = sunI * smooth(0, 0.18, this.sunDir.y);
    const moonW = 0.62 * smooth(0, 0.18, this.moonDir.y);
    const useSun = this.sunDir.y > 0;
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    // Evita las sombras larguísimas del sol rasante.
    this.lightDir.y = Math.max(this.lightDir.y, 0.32);
    this.lightDir.normalize();
    sun.color.copy(useSun ? s.sun : MOON_BLUE);
    if (!useSun && this.blood > 0) sun.color.lerp(BLOOD_LIGHT, this.blood * 0.7);
    sun.intensity = useSun ? sunW : moonW;
    sun.position.copy(this.focusAt).addScaledVector(this.lightDir, 60);
    sun.target.position.copy(this.focusAt);
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = hemiI;
    fog.color.copy(s.fog);
    fog.near = 60 - this.night * 28;
    fog.far = 240 - this.night * 70;
    (scene.background as THREE.Color).copy(s.fog);

    // Cielo.
    const su = this.skyU;
    (su.uTop.value as THREE.Color).copy(s.top);
    (su.uMid.value as THREE.Color).copy(s.mid);
    (su.uHorizon.value as THREE.Color).copy(s.horizon);
    (su.uSunCol.value as THREE.Color).copy(s.sun);
    (su.uMoonCol.value as THREE.Color).copy(MOON_WHITE).lerp(MOON_RED, this.blood);
    su.uTime.value = this.clock;
    su.uSunVis.value = smooth(-0.08, 0.06, this.sunDir.y);
    su.uMoonVis.value = smooth(-0.05, 0.1, this.moonDir.y);
    su.uStars.value = smooth(0.06, -0.25, this.sunDir.y);
    su.uAurora.value = Math.pow(this.night, 1.6);
    su.uBlood.value = this.blood;
    this.sky.position.copy(camera.position);

    // Nubes y ventanas.
    const day = 1 - this.night;
    this.parts.clouds.color.copy(s.horizon).lerp(WHITE, 0.55).multiplyScalar(0.3 + 0.7 * day);
    this.parts.windows.emissiveIntensity = 0.3 + 2.1 * this.night;
    this.parts.lamps.emissiveIntensity = 0.25 + 1.9 * this.night;

    // Partículas y brillos.
    const au = this.ambientU;
    au.uTime.value = this.clock;
    au.uNight.value = this.night;
    au.uBlood.value = this.blood;
    (au.uCenter.value as THREE.Vector2).set(px, pz);
    if (this.glowU) {
      this.glowU.uTime.value = this.clock;
      this.glowU.uNight.value = this.night;
      this.glowU.uBlood.value = this.blood;
    }
    this.poolMat.opacity = this.night * 0.55;
    for (const p of this.pools) p.visible = this.night > 0.02;
    treeFx.uTime.value = this.clock;
    treeFx.uNight.value = this.night;
    treeFx.uBlood.value = this.blood;
  }
}
