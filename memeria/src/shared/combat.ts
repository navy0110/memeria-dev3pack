// Reglas de selección de objetivos. El daño y la muerte se aplican en game.ts
// para que queden registrados como eventos.

export interface Targetable {
  x: number;
  z: number;
  alive: boolean;
}

/** Objetivo vivo más cercano dentro de rango, o null. Sin alocar memoria. */
export function nearestTarget<T extends Targetable>(x: number, z: number, range: number, list: T[]): T | null {
  let best: T | null = null;
  let bestD2 = range * range;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t.alive) continue;
    const dx = t.x - x;
    const dz = t.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) {
      best = t;
      bestD2 = d2;
    }
  }
  return best;
}
