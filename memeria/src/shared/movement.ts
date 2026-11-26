import { isFree } from './collision';
import type { Vec2, WorldGeometry } from './types';

/** Cuerpo que esquiva obstáculos: recuerda de qué lado los rodea para no oscilar. */
export interface SteerBody extends Vec2 {
  steer?: -1 | 1;
}

// Giros que prueba un cuerpo bloqueado, de menor a mayor (radianes).
const STEER_ANGLES = [0.5, 1.0, 1.6, 2.2];

// Movimiento separado por ejes: primero X, luego Z. Si un eje queda bloqueado,
// el otro sigue funcionando, así el cuerpo "desliza" contra paredes y pilares.
export function moveBody(body: Vec2, dx: number, dz: number, radius: number, geo: WorldGeometry): void {
  const nx = body.x + dx;
  if (isFree(nx, body.z, radius, geo)) body.x = nx;
  const nz = body.z + dz;
  if (isFree(body.x, nz, radius, geo)) body.z = nz;
}

/** Intención de movimiento (longitud máxima 1) convertida en desplazamiento de un tick. */
export function moveIntent(
  body: Vec2,
  mx: number,
  mz: number,
  speed: number,
  dt: number,
  radius: number,
  geo: WorldGeometry,
): void {
  const len = Math.hypot(mx, mz);
  if (len === 0) return;
  const scale = (len > 1 ? 1 / len : 1) * speed * dt;
  moveBody(body, mx * scale, mz * scale, radius, geo);
}

/**
 * Avanza hacia (dx, dz) rodeando lo que se interpone. `moveBody` solo desliza por ejes, y contra un
 * árbol justo entre el cuerpo y su objetivo los dos ejes quedan bloqueados: el mob se quedaba
 * empujando. Acá, si el paso directo no entra, se prueba girarlo hacia un lado (el último que
 * funcionó, así no zigzaguea) hasta casi dar la vuelta.
 */
export function steerBody(body: SteerBody, dx: number, dz: number, radius: number, geo: WorldGeometry): void {
  if (!isFree(body.x, body.z, radius, geo)) {
    unstick(body, radius, geo);
    return;
  }
  const nx = body.x + dx;
  const nz = body.z + dz;
  if (isFree(nx, nz, radius, geo)) {
    body.x = nx;
    body.z = nz;
    return;
  }
  const side: -1 | 1 = body.steer ?? 1;
  const sides: Array<-1 | 1> = [side, side === 1 ? -1 : 1];
  for (const a of STEER_ANGLES) {
    for (const s of sides) {
      const c = Math.cos(a * s);
      const sn = Math.sin(a * s);
      const tx = body.x + dx * c - dz * sn;
      const tz = body.z + dx * sn + dz * c;
      if (isFree(tx, tz, radius, geo)) {
        body.x = tx;
        body.z = tz;
        body.steer = s;
        return;
      }
    }
  }
}

/** El cuerpo quedó adentro de un colisionable (respawn o empujón): lo saca al hueco libre más cercano. */
function unstick(body: SteerBody, radius: number, geo: WorldGeometry): void {
  for (let ring = 1; ring <= 10; ring++) {
    const d = ring * 0.4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = body.x + Math.cos(a) * d;
      const z = body.z + Math.sin(a) * d;
      if (isFree(x, z, radius, geo)) {
        body.x = x;
        body.z = z;
        return;
      }
    }
  }
}
