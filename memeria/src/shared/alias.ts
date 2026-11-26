import { t } from '../i18n';
// Nombre que el jugador elige para su héroe. Sin nombre, se muestra la wallet abreviada.
// OJO: es solo del cliente. Mientras no haya servidor con base de datos, los nombres no son únicos ni están
// reservados: dos personas pueden llamarse igual y un cliente modificado puede mandar cualquier texto.
export const ALIAS_MIN = 3;
export const ALIAS_MAX = 16;

const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u;
const RESERVED = new Set(['admin', 'administrator', 'mod', 'moderator', 'staff', 'system', 'memeria', 'mmria', 'support', 'team']);

/** Devuelve el nombre normalizado, o un texto con el motivo del rechazo. */
export function checkAlias(raw: string): { ok: true; alias: string } | { ok: false; error: string } {
  const alias = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (alias.length < ALIAS_MIN || alias.length > ALIAS_MAX) return { ok: false, error: t('Use {min} to {max} characters.', { min: ALIAS_MIN, max: ALIAS_MAX }) };
  if (!ALLOWED.test(alias)) return { ok: false, error: t('Letters, numbers, spaces and _ - . only.') };
  // «7xKX...9AbC» imitaría la wallet abreviada de otro jugador.
  if (/\.{2,}/.test(alias)) return { ok: false, error: t('Letters, numbers, spaces and _ - . only.') };
  if (RESERVED.has(alias.toLowerCase())) return { ok: false, error: t('That name is reserved.') };
  return { ok: true, alias };
}
