import * as THREE from 'three';

interface NameLabel {
  anchor: THREE.Object3D;
  yOffset: number;
  el: HTMLDivElement;
  text: string;
  visible: boolean;
}

interface FloatLabel {
  anchor: THREE.Object3D;
  el: HTMLDivElement;
  life: number;
  age: number;
  base: number;
  rot: number;
}

const FLOAT_LIFE = 0.9;
const FLOAT_POOL = 24;
const MARGIN = 120;
/** Más lejos que esto, la burbuja no se dibuja (nadie la podría leer). */
const BUBBLE_RANGE = 40;

interface Bubble {
  anchor: THREE.Object3D;
  el: HTMLDivElement;
  life: number;
  age: number;
  yOffset: number;
}

// Etiquetas HTML proyectadas sobre el mundo: nombres, indicador de interacción y
// números de daño. Los elementos se crean una vez y se reciclan; no hay alocaciones por frame.
export class Labels {
  private readonly names: NameLabel[] = [];
  private readonly floats: FloatLabel[] = [];
  private readonly bubbles = new Map<THREE.Object3D, Bubble>();
  private readonly tmp = new THREE.Vector3();
  private readonly base = new THREE.Vector3();

  constructor(
    private readonly layer: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {
    for (let i = 0; i < FLOAT_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'float';
      el.style.display = 'none';
      layer.appendChild(el);
      this.floats.push({ anchor: new THREE.Object3D(), el, life: 0, age: 0, base: 2.6, rot: 0 });
    }
  }

  /** Nombre fijo sobre una entidad. Devuelve el handle para cambiarlo después. */
  addName(anchor: THREE.Object3D, text: string, yOffset: number, cls = 'name'): NameLabel {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    this.layer.appendChild(el);
    const handle: NameLabel = { anchor, yOffset, el, text, visible: true };
    this.names.push(handle);
    return handle;
  }

  removeName(handle: NameLabel): void {
    const i = this.names.indexOf(handle);
    if (i >= 0) this.names.splice(i, 1);
    handle.el.remove();
  }

  setText(handle: NameLabel, text: string): void {
    if (handle.text === text) return;
    handle.text = text;
    handle.el.textContent = text;
  }

  setVisible(handle: NameLabel, visible: boolean): void {
    if (handle.visible === visible) return;
    handle.visible = visible;
    handle.el.style.display = visible ? '' : 'none';
  }

  /** Texto flotante (daño, onomatopeya). `base`: altura inicial sobre el ancla; `rot`: grados. */
  pop(anchor: THREE.Object3D, text: string, cls: string, opts: { base?: number; color?: string; rot?: number } = {}): void {
    const f = this.floats.find((x) => x.life <= 0);
    if (!f) return;
    f.anchor = anchor;
    f.life = FLOAT_LIFE;
    f.age = 0;
    f.base = opts.base ?? 2.6;
    f.rot = opts.rot ?? 0;
    f.el.style.color = opts.color ?? '';
    f.el.textContent = text;
    f.el.className = `float ${cls}`;
    f.el.style.display = '';
  }

  /**
   * Burbuja de diálogo sobre una entidad (jugador, NPC). Una por ancla: la nueva reemplaza a la vieja.
   * `kind`: say (charla), emote (acción), typing (puntos), npc (frase de un personaje).
   */
  bubble(anchor: THREE.Object3D, text: string, kind: 'say' | 'emote' | 'typing' | 'npc', yOffset = 2.55, seconds?: number): void {
    let b = this.bubbles.get(anchor);
    if (!b) {
      const el = document.createElement('div');
      this.layer.appendChild(el);
      b = { anchor, el, life: 0, age: 0, yOffset };
      this.bubbles.set(anchor, b);
    }
    b.el.className = `bubble ${kind}`;
    b.el.textContent = text;
    b.yOffset = yOffset;
    b.age = 0;
    b.life = seconds ?? Math.min(9, 3.2 + text.length * 0.07);
    // Reinicia la animación de entrada aunque la clase sea la misma.
    void b.el.offsetWidth;
    b.el.classList.add('in');
  }

  /** Quita la burbuja de un ancla (por ejemplo, los puntos de «escribiendo» cuando llega el mensaje). */
  clearBubble(anchor: THREE.Object3D): void {
    const b = this.bubbles.get(anchor);
    if (!b) return;
    b.el.remove();
    this.bubbles.delete(anchor);
  }

  update(dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const [anchor, b] of this.bubbles) {
      b.age += dt;
      if (b.age >= b.life || !anchor.parent) {
        b.el.remove();
        this.bubbles.delete(anchor);
        continue;
      }
      const left = b.life - b.age;
      b.el.style.opacity = left < 0.5 ? String(Math.max(0, left / 0.5)) : '';
      if (anchor.position.distanceTo(this.camera.position) > BUBBLE_RANGE) {
        b.el.style.visibility = 'hidden';
        continue;
      }
      this.project(anchor, b.yOffset, w, h, b.el, 0, -30);
    }

    for (const n of this.names) {
      if (n.visible) this.project(n.anchor, n.yOffset, w, h, n.el);
    }

    for (const f of this.floats) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.age += dt;
      if (f.life <= 0) {
        f.el.style.display = 'none';
        continue;
      }
      const rise = f.age * 1.2;
      this.project(f.anchor, f.base + rise, w, h, f.el, f.rot);
      f.el.style.opacity = String(Math.min(1, f.life / (FLOAT_LIFE * 0.5)));
    }
  }

  /** Coloca el elemento sobre anchor + yOffset. Oculta (visibility) si queda detrás de la cámara. */
  private project(anchor: THREE.Object3D, yOffset: number, w: number, h: number, el: HTMLElement, rot = 0, lift = 0): void {
    this.base.copy(anchor.position);
    this.base.y += yOffset;
    this.tmp.copy(this.base).project(this.camera);
    const x = (this.tmp.x * 0.5 + 0.5) * w;
    const y = (-this.tmp.y * 0.5 + 0.5) * h;
    const onScreen = this.tmp.z <= 1 && this.tmp.z >= -1 && x > -MARGIN && x < w + MARGIN && y > -MARGIN && y < h + MARGIN;
    el.style.visibility = onScreen ? '' : 'hidden';
    if (!onScreen) return;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)${lift ? ` translateY(${lift}px)` : ''}${rot ? ` rotate(${rot}deg)` : ''}`;
  }
}

export type { NameLabel };
