// Guardado del progreso (nivel, XP, monedas, inventario, misiones) por wallet.
// Por ahora vive en este navegador (localStorage); con servidor irá en la base, con la misma forma.
import type { SaveData } from '../shared/types';

const PREFIX = 'meme-rpg:save:';
const key = (owner: string | null): string => PREFIX + (owner ?? 'guest');

export function loadSave(owner: string | null): SaveData | null {
  try {
    const raw = localStorage.getItem(key(owner));
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data && data.v === 1 && typeof data.level === 'number' ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(owner: string | null, data: SaveData): void {
  try {
    localStorage.setItem(key(owner), JSON.stringify(data));
  } catch {
    /* sin almacenamiento: el progreso dura lo que dure la pestaña */
  }
}
