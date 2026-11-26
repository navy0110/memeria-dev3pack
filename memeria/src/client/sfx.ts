// Sonidos de interfaz sintetizados con WebAudio (sin archivos): los "blips" de menú de los
// JRPG clásicos (la música vive en music.ts y comparte el AudioContext). El AudioContext se crea con el primer
// gesto del usuario (política de autoplay del navegador). La tecla M silencia todo.

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('meme-rpg-muted') === '1';
} catch {
  /* sin localStorage: queda sin silenciar */
}

/** ¿El audio ya se desbloqueó con un gesto? Sin crear el contexto. */
export const audioReady = (): boolean => ctx?.state === 'running';

/** AudioContext compartido (lo usa también la música). Null hasta el primer gesto o sin soporte. */
export function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

for (const ev of ['keydown', 'mousedown', 'touchstart'] as const) {
  window.addEventListener(ev, () => audio(), { once: false, passive: true });
}

interface Note {
  /** Hz */
  f: number;
  /** segundos desde el inicio de la secuencia */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Hz final (deslizamiento) */
  to?: number;
}

function play(notes: Note[]): void {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.005;
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = n.type ?? 'square';
    o.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
    const peak = (n.gain ?? 0.05) * 1;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    o.connect(g).connect(a.destination);
    o.start(t0 + n.at);
    o.stop(t0 + n.at + n.dur + 0.02);
  }
}

export const sfx = {
  /** Mover el cursor entre opciones: blip corto y agudo. */
  cursor: () => play([{ f: 1320, at: 0, dur: 0.045, gain: 0.04 }]),
  /** Confirmar: dos notas que suben. */
  confirm: () =>
    play([
      { f: 880, at: 0, dur: 0.07, gain: 0.05 },
      { f: 1320, at: 0.07, dur: 0.14, gain: 0.05 },
      { f: 1760, at: 0.07, dur: 0.14, type: 'triangle', gain: 0.03 },
    ]),
  /** Cancelar / volver: dos notas que bajan. */
  cancel: () =>
    play([
      { f: 880, at: 0, dur: 0.06, gain: 0.045 },
      { f: 587, at: 0.06, dur: 0.12, gain: 0.045 },
    ]),
  /** Abrir una ventana: barrido corto hacia arriba con un brillo. */
  open: () =>
    play([
      { f: 520, to: 1040, at: 0, dur: 0.1, type: 'triangle', gain: 0.05 },
      { f: 1568, at: 0.09, dur: 0.1, gain: 0.025 },
    ]),
  /** Acción no permitida: zumbido grave doble (el "buzzer" clásico). */
  error: () =>
    play([
      { f: 160, at: 0, dur: 0.09, gain: 0.06 },
      { f: 160, at: 0.12, dur: 0.12, gain: 0.06 },
    ]),
  /** Misión o aviso: campanita de tres notas. */
  chime: () =>
    play([
      { f: 988, at: 0, dur: 0.12, type: 'triangle', gain: 0.05 },
      { f: 1319, at: 0.1, dur: 0.12, type: 'triangle', gain: 0.05 },
      { f: 1976, at: 0.2, dur: 0.28, type: 'triangle', gain: 0.05 },
    ]),
  /** Subida de nivel: arpegio ascendente. */
  levelUp: () =>
    play(
      [523, 659, 784, 1047, 1319].map((f, i) => ({ f, at: i * 0.09, dur: i === 4 ? 0.4 : 0.12, type: 'square' as const, gain: 0.045 })),
    ),
};

const muteListeners: Array<(m: boolean) => void> = [];
export const onMuteChange = (cb: (m: boolean) => void): void => void muteListeners.push(cb);

/** Alterna el silencio; devuelve el estado nuevo. */
export function toggleMute(): boolean {
  muted = !muted;
  muteListeners.forEach((cb) => cb(muted));
  try {
    localStorage.setItem('meme-rpg-muted', muted ? '1' : '0');
  } catch {
    /* ignorar */
  }
  if (!muted) sfx.confirm();
  return muted;
}

export const isMuted = (): boolean => muted;
