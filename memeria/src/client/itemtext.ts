// Texto de estadísticas de un ítem de equipo, compartido por el inventario y la tienda.
// Lo que el héroe no cumple (nivel, clase) sale en rojo.
import type { GameState } from '../shared/game';
import type { ItemDef } from '../shared/types';
import { t } from '../i18n';

export function statHtml(def: ItemDef, game: GameState): string {
  const parts: string[] = [];
  if (def.damage !== undefined) parts.push(t('+{n} damage', { n: def.damage }));
  if (def.defense !== undefined) parts.push(t('{n} defense', { n: def.defense }));
  if (def.heal !== undefined) parts.push(t('heals {n} HP', { n: def.heal }));
  if (def.levelReq !== undefined) {
    const ok = def.levelReq <= game.player.level;
    parts.push(`<span class="${ok ? '' : 'bad'}">${t('Lv {n}', { n: def.levelReq })}</span>`);
  }
  if (def.classes) {
    const ok = def.classes.includes(game.cls.id);
    parts.push(`<span class="${ok ? '' : 'bad'}">${t('{role} only', { role: ok ? game.cls.role : t('Other class') })}</span>`);
  }
  return parts.join(' · ');
}

/** Para la tienda: equipo de otra clase no se muestra (no te sirve y llena la lista). */
export function usableByClass(def: ItemDef, game: GameState): boolean {
  return !def.classes || def.classes.includes(game.cls.id);
}
