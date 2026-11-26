// Idiomas: inglés (el original) y español. Las claves del diccionario son el texto en inglés,
// así que un texto sin traducir se muestra en inglés en vez de romperse.
// Cambiar de idioma recarga la página: los datos del juego se traducen una sola vez al cargar.
// Este archivo no toca el DOM porque también lo importa el Worker (siempre en inglés); lo del navegador está en dom.ts.
import { ES } from './es';

export type Lang = 'en' | 'es';
export const LANG_KEY = 'memeria.lang';

interface Env {
  localStorage?: { getItem(k: string): string | null };
  navigator?: { language?: string };
}

function detect(): Lang {
  try {
    const env = globalThis as Env;
    const saved = env.localStorage?.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'es') return saved;
    return env.navigator?.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export const lang: Lang = detect();

/** Traduce `en` y rellena `{nombre}` con `vars`. Sin traducción devuelve el inglés. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = lang === 'es' ? (ES[en] ?? en) : en;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}
