import { steerBody } from './movement';
import type { MobState, MobTemplate, Vec2, WorldGeometry } from './types';

export interface MobContext {
  player: Vec2;
  playerAlive: boolean;
  playerInSafe: boolean;
  geo: WorldGeometry;
  dt: number;
}

/**
 * IA de un mob vivo: patrulla quieta en su casa, persigue si el jugador entra en
 * aggro (y no está en zona segura), vuelve si se aleja demasiado.
 * Devuelve el daño que el mob le hace al jugador en este tick (0 si no ataca).
 * Determinista: no usa aleatoriedad ni tiempo real.
 */
export function stepMob(mob: MobState, tpl: MobTemplate, ctx: MobContext): number {
  const { dt, geo } = ctx;
  if (mob.attackCd > 0) mob.attackCd = Math.max(0, mob.attackCd - dt);

  const toPx = ctx.player.x - mob.x;
  const toPz = ctx.player.z - mob.z;
  const dist = Math.hypot(toPx, toPz);
  const homeX = mob.homeX - mob.x;
  const homeZ = mob.homeZ - mob.z;
  const homeDist = Math.hypot(homeX, homeZ);

  const engage =
    ctx.playerAlive && !ctx.playerInSafe && dist < tpl.aggroRange && homeDist < tpl.leashRange;

  // Armando el golpe: queda quieto mirando al jugador y pega al terminar, si sigue cerca.
  if (mob.windup > 0) {
    mob.facing = Math.atan2(toPx, toPz);
    mob.windup = Math.max(0, mob.windup - dt);
    if (mob.windup > 0) return 0;
    mob.attackCd = tpl.attackCooldown;
    return ctx.playerAlive && !ctx.playerInSafe && dist <= tpl.attackRange * 1.35 ? tpl.damage : 0;
  }

  if (engage) {
    mob.facing = Math.atan2(toPx, toPz);
    if (dist > tpl.attackRange) {
      const step = (tpl.speed * dt) / dist;
      steerBody(mob, toPx * step, toPz * step, tpl.radius, geo);
    } else if (mob.attackCd === 0) {
      mob.windup = tpl.windup;
    }
  } else if (homeDist > 0.2) {
    const step = (tpl.speed * dt) / homeDist;
    mob.facing = Math.atan2(homeX, homeZ);
    steerBody(mob, homeX * step, homeZ * step, tpl.radius, geo);
  }
  return 0;
}
