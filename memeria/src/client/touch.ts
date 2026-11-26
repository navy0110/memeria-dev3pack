// Controles para pantalla táctil: palanca a la izquierda, botones de acción a la derecha, arrastrar el
// mundo con un dedo para girar la cámara y un botón de menú (no hay tecla Escape). Se activa solo en
// pantallas «gruesas» (celulares y tablets); `?touch=1` lo fuerza para probarlo en la computadora.
import { addDragYaw, edges, setTouchAxes } from './input';

const STICK_R = 52;
const DEAD = 0.18;
const REPEAT_MS = 130;

export function wantsTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
}

export function enableTouch(menu: { toggle: (on?: boolean) => void }, canvas: HTMLElement): void {
  document.body.classList.add('touch');
  document.getElementById('chat')?.classList.add('closed');
  const q = (id: string): HTMLElement => document.getElementById(id)!;

  // Palanca.
  const stick = q('stick');
  const knob = q('stick-knob');
  let stickId = -1;
  const aim = (e: PointerEvent): void => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, len / STICK_R);
    if (mag < DEAD) setTouchAxes(0, 0);
    else setTouchAxes(-dy / STICK_R, dx / STICK_R);
  };
  const release = (e: PointerEvent): void => {
    if (e.pointerId !== stickId) return;
    stickId = -1;
    knob.style.transform = '';
    setTouchAxes(0, 0);
  };
  stick.addEventListener('pointerdown', (e) => {
    if (stickId >= 0) return;
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    aim(e);
    e.preventDefault();
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) aim(e);
  });
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);

  // Botones: atacar se repite mientras se mantiene apretado; el resto es un toque.
  const press = (id: string, edge: 'attack' | 'skill' | 'interact' | 'mend', repeat: boolean): void => {
    const el = q(id);
    let timer = 0;
    const stop = (): void => {
      window.clearInterval(timer);
      timer = 0;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      edges[edge] = true;
      if (repeat && !timer) timer = window.setInterval(() => (edges[edge] = true), REPEAT_MS);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, stop);
  };
  press('slot-attack', 'attack', true);
  press('slot-skill', 'skill', false);
  press('slot-talk', 'interact', false);
  press('slot-mend', 'mend', false);
  q('menu-btn').addEventListener('click', () => menu.toggle());
  // El inventario no tiene botón en pantalla: se abre desde el menú (su toggle es de la ventana).
  q('pause-bag').addEventListener('click', () => {
    menu.toggle(false);
    q('slot-bag').click();
  });

  // Un dedo sobre el mundo gira la cámara.
  let dragId = -1;
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (dragId >= 0) return;
    dragId = e.pointerId;
    lastX = e.clientX;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    addDragYaw(e.clientX - lastX);
    lastX = e.clientX;
  });
  for (const ev of ['pointerup', 'pointercancel'] as const) {
    canvas.addEventListener(ev, (e) => {
      if (e.pointerId === dragId) dragId = -1;
    });
  }
}
