// Música de fondo: un tema para la villa y otro para el campo, con cruce de 1,5 s al cambiar
// de zona. Usa pistas CC0 de public/music (ver CREDITS.txt, fuera de git); si no se pueden
// cargar, cae a un respaldo sintetizado con WebAudio (arpegio en Do mayor / bajo en La menor).
import { audio, isMuted, onMuteChange } from './sfx';

export type Mood = 'hero' | 'town' | 'field' | 'battle' | 'ruins';
const MOODS: Mood[] = ['hero', 'town', 'field', 'battle', 'ruins'];
/** El respaldo sintetizado solo tiene dos temas. */
const synthOf = (m: Mood): 'town' | 'field' => (m === 'town' ? 'town' : 'field');

interface Bar {
  /** Fundamental del bajo (MIDI) */
  bass: number;
  /** Notas del acorde (MIDI) para arpegio y colchón */
  chord: number[];
  /** Melodía en corcheas (8 por compás); 0 = silencio */
  mel: number[];
}

interface Theme {
  bpm: number;
  bars: Bar[];
}

const TOWN: Theme = {
  bpm: 92,
  bars: [
    { bass: 48, chord: [60, 64, 67], mel: [76, 0, 79, 0, 84, 0, 79, 76] },
    { bass: 47, chord: [59, 62, 67], mel: [74, 0, 79, 0, 83, 0, 79, 74] },
    { bass: 45, chord: [57, 60, 64], mel: [72, 0, 76, 0, 81, 0, 76, 72] },
    { bass: 52, chord: [59, 64, 67], mel: [71, 0, 76, 0, 79, 0, 76, 71] },
    { bass: 53, chord: [57, 60, 65], mel: [72, 0, 77, 0, 81, 0, 77, 72] },
    { bass: 52, chord: [55, 60, 64], mel: [72, 0, 76, 0, 79, 0, 84, 0] },
    { bass: 50, chord: [57, 62, 65], mel: [74, 0, 77, 0, 81, 0, 77, 74] },
    { bass: 43, chord: [55, 59, 62], mel: [79, 0, 83, 0, 86, 0, 0, 0] },
  ],
};

const FIELD: Theme = {
  bpm: 126,
  bars: [
    { bass: 45, chord: [57, 60, 64], mel: [81, 0, 0, 76, 0, 79, 81, 0] },
    { bass: 41, chord: [57, 60, 65], mel: [77, 0, 0, 81, 0, 79, 77, 0] },
    { bass: 48, chord: [55, 60, 64], mel: [79, 0, 0, 84, 0, 83, 79, 0] },
    { bass: 43, chord: [55, 59, 62], mel: [74, 0, 79, 0, 83, 0, 81, 79] },
    { bass: 45, chord: [57, 60, 64], mel: [81, 0, 0, 84, 0, 81, 76, 0] },
    { bass: 41, chord: [57, 60, 65], mel: [77, 0, 81, 0, 84, 0, 81, 77] },
    { bass: 50, chord: [57, 62, 65], mel: [74, 0, 77, 0, 81, 0, 77, 74] },
    { bass: 52, chord: [56, 59, 64], mel: [76, 0, 80, 0, 83, 0, 80, 76] },
  ],
};

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface Track {
  theme: Theme;
  gain: GainNode;
  /** Instante (AudioContext) del siguiente paso a agendar */
  next: number;
  step: number;
  on: boolean;
  /** Después de este instante deja de agendar (cola del fundido) */
  until: number;
}

let bus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let timer: number | null = null;
let mood: Mood | null = null;
/** Tema ya aplicado al audio; evita rehacer el trabajo en cada llamada. */
let applied: Mood | null = null;
let waiting = false;
const tracks: Partial<Record<'town' | 'field', Track>> = {};

const VOLUME = 0.55;

// --- Pistas de archivo ---
// La villa alterna entre dos temas según la sesión.
const FILES: Record<Mood, string> = {
  hero: '/music/hero.mp3', // landing: "Heroes Theme" (CC BY 3.0, ver CREDITS.txt)
  town: Math.random() < 0.5 ? '/music/town.mp3' : '/music/town-alt.mp3',
  field: '/music/field.ogg',
  battle: '/music/battle.mp3',
  ruins: '/music/ruins.ogg',
};
const FILE_GAIN = 0.7;
const buffers: Partial<Record<Mood, AudioBuffer | null>> = {};
const loading: Partial<Record<Mood, Promise<AudioBuffer | null>>> = {};
const playing: Partial<Record<Mood, { src: AudioBufferSourceNode; gain: GainNode }>> = {};

function loadFile(a: AudioContext, key: Mood): Promise<AudioBuffer | null> {
  loading[key] ??= fetch(FILES[key])
    .then((r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').match(/audio|ogg|mpeg|octet/i)) throw new Error(`${r.status}`);
      return r.arrayBuffer();
    })
    .then((data) => a.decodeAudioData(data))
    .then((b) => (buffers[key] = b))
    .catch((e) => {
      console.warn(`[music] ${FILES[key]} no disponible, uso el respaldo sintetizado:`, e);
      return (buffers[key] = null);
    });
  return loading[key]!;
}

function fadeFile(a: AudioContext, key: Mood, want: boolean): void {
  const cur = playing[key];
  if (want && !cur) {
    const src = a.createBufferSource();
    src.buffer = buffers[key]!;
    src.loop = true;
    const gain = a.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(bus!);
    src.start();
    gain.gain.setTargetAtTime(FILE_GAIN, a.currentTime, 0.5);
    playing[key] = { src, gain };
  } else if (!want && cur) {
    cur.gain.gain.setTargetAtTime(0, a.currentTime, 0.45);
    cur.src.stop(a.currentTime + 2.5);
    delete playing[key];
  }
}

function setup(a: AudioContext): void {
  if (bus) return;
  bus = a.createGain();
  bus.gain.value = isMuted() ? 0 : VOLUME;
  bus.connect(a.destination);
  noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  onMuteChange((m) => {
    const ac = audio();
    if (bus && ac) bus.gain.setTargetAtTime(m ? 0 : VOLUME, ac.currentTime, 0.08);
  });
}

function note(a: AudioContext, dest: AudioNode, m: number, t: number, dur: number, type: OscillatorType, peak: number, lp = 0, attack = 0.01): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(mtof(m), t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out: AudioNode = o;
  if (lp) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    o.connect(f);
    out = f;
  }
  out.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hit(a: AudioContext, dest: AudioNode, t: number, kind: 'kick' | 'snare' | 'hat'): void {
  if (kind === 'kick') {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.2);
    return;
  }
  const s = a.createBufferSource();
  s.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = kind === 'hat' ? 7000 : 1800;
  const g = a.createGain();
  const dur = kind === 'hat' ? 0.04 : 0.12;
  g.gain.setValueAtTime(kind === 'hat' ? 0.035 : 0.09, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.02);
}

/** Agenda un paso (corchea) del tema. */
function schedule(a: AudioContext, tr: Track, t: number, isTown: boolean): void {
  const bar = tr.theme.bars[Math.floor(tr.step / 8) % tr.theme.bars.length];
  const i = tr.step % 8;
  const eighth = 60 / tr.theme.bpm / 2;
  const d = tr.gain;
  if (isTown) {
    // Bajo en pulso de blancas, arpegio de arpa, melodía suave y colchón en cada compás.
    if (i === 0 || i === 4) note(a, d, bar.bass, t, eighth * 3.6, 'triangle', 0.1, 0, 0.015);
    const arp = [0, 1, 2, 3, 2, 1, 2, 1][i];
    note(a, d, arp === 3 ? bar.chord[0] + 12 : bar.chord[arp], t, eighth * 2.2, 'sine', 0.05, 0, 0.006);
    if (bar.mel[i]) note(a, d, bar.mel[i], t, eighth * 2.4, 'triangle', 0.075, 0, 0.02);
    if (i === 0) for (const c of bar.chord) note(a, d, c - 12, t, eighth * 7.6, 'sine', 0.03, 0, 0.25);
  } else {
    if (i === 0 || i === 4) hit(a, d, t, 'kick');
    if (i === 2 || i === 6) hit(a, d, t, 'snare');
    if (i % 2 === 1) hit(a, d, t, 'hat');
    const b = bar.bass + [0, 0, 12, 0, 0, 12, 0, 7][i];
    note(a, d, b, t, eighth * 0.85, 'sawtooth', 0.075, 520, 0.004);
    if (bar.mel[i]) note(a, d, bar.mel[i], t, eighth * 1.9, 'sawtooth', 0.04, 2400, 0.01);
    if (i === 0) for (const c of bar.chord) note(a, d, c - 12, t, eighth * 7.6, 'triangle', 0.025, 0, 0.1);
  }
}

function tick(): void {
  const a = audio();
  if (!a || !bus) return;
  for (const key of ['town', 'field'] as const) {
    const tr = tracks[key];
    if (!tr) continue;
    if (!tr.on && a.currentTime > tr.until) continue;
    while (tr.next < a.currentTime + 0.25) {
      if (tr.next >= a.currentTime - 0.05) schedule(a, tr, tr.next, key === 'town');
      tr.next += 60 / tr.theme.bpm / 2;
      tr.step++;
    }
  }
}

function track(a: AudioContext, key: 'town' | 'field'): Track {
  let tr = tracks[key];
  if (!tr) {
    const gain = a.createGain();
    gain.gain.value = 0;
    gain.connect(bus!);
    tr = { theme: key === 'town' ? TOWN : FIELD, gain, next: a.currentTime + 0.1, step: 0, on: false, until: 0 };
    tracks[key] = tr;
  }
  return tr;
}

/** Cambia de tema con un cruce de 1,5 s. Si el audio aún no se desbloqueó, lo intenta después. */
export function setMood(next: Mood): void {
  if (next === mood && (applied === next || waiting)) return;
  mood = next;
  const a = audio();
  if (!a || a.state !== 'running') {
    if (waiting) return;
    waiting = true;
    // Todavía no hubo un gesto del usuario: reintenta con el primero.
    const retry = (): void => {
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      waiting = false;
      // Espera a que el contexto realmente arranque (resume() es asíncrono) antes de reintentar.
      const ac = audio();
      void (ac ? ac.resume() : Promise.resolve()).catch(() => {}).then(() => {
        if (mood) setMood(mood);
      });
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
    return;
  }
  setup(a);
  // Primero solo la pista que suena.
  void loadFile(a, next).then(() => {
    if (mood === next) {
      apply(a, next);
      applied = next;
    }
    // La landing no precarga las pistas del juego (15 MB): solo al entrar, para que los cruces ya las tengan.
    if (next !== 'hero') for (const m of MOODS) if (m !== 'hero') void loadFile(a, m);
  });
}

function apply(a: AudioContext, next: Mood): void {
  for (const key of MOODS) if (buffers[key]) fadeFile(a, key, key === next);
  // Respaldo sintetizado: solo para los temas cuyo archivo no cargó.
  const synthWanted = buffers[next] ? null : synthOf(next);
  for (const key of ['town', 'field'] as const) {
    const tr = track(a, key);
    const want = key === synthWanted;
    if (want === tr.on && timer !== null) continue;
    if (want && !tr.on) {
      tr.step = 0;
      tr.next = a.currentTime + 0.1;
    }
    tr.on = want;
    tr.until = a.currentTime + 2;
    tr.gain.gain.cancelScheduledValues(a.currentTime);
    tr.gain.gain.setTargetAtTime(want ? 1 : 0, a.currentTime, want ? 0.5 : 0.45);
  }
  if (timer === null) timer = window.setInterval(tick, 60);
}
