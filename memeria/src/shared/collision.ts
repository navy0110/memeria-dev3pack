import type { Bounds, Collider, Region, Vec2, WorldGeometry } from './types';

// Colisiones 2D en el plano XZ: círculos contra círculos y cajas alineadas a los ejes.
// Sin motor de física: con decenas de colisionables, un recorrido lineal es suficiente
// y es determinista. Si el número crece, se puede reemplazar por una grilla espacial
// sin tocar a quien llama.

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function insideBounds(b: Bounds, x: number, z: number, margin = 0): boolean {
  return x >= b.minX + margin && x <= b.maxX - margin && z >= b.minZ + margin && z <= b.maxZ - margin;
}

export function overlapsCollider(x: number, z: number, r: number, c: Collider): boolean {
  if (c.shape === 'circle') {
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = r + c.r;
    return dx * dx + dz * dz < rr * rr;
  }
  const dx = x - clamp(x, c.minX, c.maxX);
  const dz = z - clamp(z, c.minZ, c.maxZ);
  return dx * dx + dz * dz < r * r;
}

/** Un círculo de radio r en (x, z) cabe en el mundo sin tocar colisiones. */
export function isFree(x: number, z: number, r: number, geo: WorldGeometry): boolean {
  if (!insideBounds(geo.bounds, x, z, r)) return false;
  const cs = geo.colliders;
  for (let i = 0; i < cs.length; i++) {
    if (overlapsCollider(x, z, r, cs[i])) return false;
  }
  return true;
}

export function regionAt(geo: WorldGeometry, x: number, z: number): Region | undefined {
  const rs = geo.regions;
  for (let i = 0; i < rs.length; i++) {
    if (insideBounds(rs[i].bounds, x, z)) return rs[i];
  }
  return undefined;
}

export function distance(a: Vec2, bx: number, bz: number): number {
  return Math.hypot(a.x - bx, a.z - bz);
}
