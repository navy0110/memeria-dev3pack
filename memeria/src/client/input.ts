// Entrada del navegador. Expone estado de teclas y acciones "de un disparo"
// que se consumen cuando un tick de simulación las toma (así no se pierden
// si un frame no ejecuta ningún tick).

export interface Edges {
  attack: boolean;
  skill: boolean;
  interact: boolean;
  mend: boolean;
}

const held = new Set<string>();
/** Palanca virtual de la pantalla táctil (adelante/derecha, de -1 a 1). */
const touchAxes = { forward: 0, side: 0 };
export const edges: Edges = { attack: false, skill: false, interact: false, mend: false };
let dragYaw = 0;
let dragPitch = 0;
let dragging = false;
/** Con el puntero bloqueado en el canvas, mover el mouse o el trackpad gira la cámara sin apretar nada. */
let lookEl: HTMLElement | null = null;
const looking = (): boolean => !!lookEl && document.pointerLockElement === lookEl;

const EDGE_KEYS: Record<string, keyof Edges> = {
  Space: 'attack',
  KeyR: 'skill',
  KeyF: 'interact',
  KeyH: 'mend',
};

window.addEventListener('keydown', (e) => {
  // Escribiendo en el chat: las teclas no mueven al personaje.
  if (e.target instanceof HTMLInputElement) return;
  if (e.repeat) return;
  held.add(e.code);
  const edge = EDGE_KEYS[e.code];
  if (edge) edges[edge] = true;
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
// Entrar al chat suelta todas las teclas: el personaje no sigue corriendo mientras escribís.
window.addEventListener('focusin', (e) => {
  if (e.target instanceof HTMLInputElement) {
    held.clear();
    edges.attack = edges.skill = edges.interact = edges.mend = false;
  }
});
window.addEventListener('blur', () => held.clear());

window.addEventListener('mousedown', (e) => {
  if (e.button === 0 || e.button === 2) dragging = true;
});
window.addEventListener('mouseup', () => {
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (dragging || looking()) {
    dragYaw += e.movementX;
    dragPitch += e.movementY;
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

/**
 * Escritorio: un click en el mundo captura el mouse y la cámara sigue su movimiento mientras WASD
 * sigue siendo relativo a la cámara. Esc lo suelta (el navegador lo hace solo); los paneles también.
 */
export function enableMouseLook(el: HTMLElement): void {
  lookEl = el;
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || looking()) return;
    // Pedir el bloqueo puede fallar (pestaña sin foco, el usuario recién lo soltó): se sigue con arrastre.
    void Promise.resolve(el.requestPointerLock?.()).catch(() => {});
  });
}

/** Devuelve el mouse (para usar menús, tiendas e inventario). */
export function releaseMouseLook(): void {
  if (looking()) document.exitPointerLock();
}

export const isMouseLooking = looking;

const isHeld = (...codes: string[]): boolean => codes.some((c) => held.has(c));

/** Ejes de movimiento relativos a la cámara: forward (+1 adelante) y side (+1 derecha). */
export function movementAxes(): { forward: number; side: number } {
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  const forward = (isHeld('KeyW', 'ArrowUp') ? 1 : 0) - (isHeld('KeyS', 'ArrowDown') ? 1 : 0) + touchAxes.forward;
  const side = (isHeld('KeyD', 'ArrowRight') ? 1 : 0) - (isHeld('KeyA', 'ArrowLeft') ? 1 : 0) + touchAxes.side;
  return { forward: clamp(forward), side: clamp(side) };
}

export function setTouchAxes(forward: number, side: number): void {
  touchAxes.forward = forward;
  touchAxes.side = side;
}

/** Gira la cámara como si se arrastrara el mouse `dx` píxeles. */
export function addDragYaw(dx: number): void {
  dragYaw += dx;
}

export function rotateHeld(): number {
  return (isHeld('KeyQ') ? 1 : 0) - (isHeld('KeyE') ? 1 : 0);
}

/** Desplazamiento vertical del mouse desde la última lectura (inclina la cámara). */
export function takeDragPitch(): number {
  const v = dragPitch;
  dragPitch = 0;
  return v;
}

/** Desplazamiento horizontal del mouse arrastrado desde la última lectura. */
export function takeDragYaw(): number {
  const v = dragYaw;
  dragYaw = 0;
  return v;
}
