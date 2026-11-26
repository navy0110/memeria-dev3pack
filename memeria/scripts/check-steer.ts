// Prueba de que los mobs rodean los árboles: tsx scripts/check-steer.ts
import assert from 'node:assert/strict';
import { stepMob } from '../src/shared/ai';
import { isFree } from '../src/shared/collision';
import { MOB_TEMPLATES } from '../src/data';
import { HODL_HOLLOW } from '../src/data/zones/hodl-hollow';
import type { MobState } from '../src/shared/types';

const geo = HODL_HOLLOW.geometry;
const trees = geo.colliders.filter((c) => c.shape === 'circle');
let tried = 0;
let stuck = 0;
for (const tplId of ['bear', 'ghost', 'grizzly', 'golem']) {
  const tpl = MOB_TEMPLATES[tplId];
  if (!tpl) continue;
  for (const t of trees) {
    if (t.shape !== 'circle') continue;
    // El mob y el objetivo quedan a lados opuestos del árbol, en línea recta con su centro.
    for (const [ax, az] of [[1, 0], [0, 1], [0.7071, 0.7071]]) {
      const d = t.r + tpl.radius + 2;
      const mob: MobState = { id: 'm', templateId: tplId, x: t.x - ax * d, z: t.z - az * d, homeX: t.x - ax * d, homeZ: t.z - az * d, facing: 0, hp: 1, alive: true, attackCd: 0, windup: 0, respawnTime: 1, respawnLeft: 0 };
      const player = { x: t.x + ax * d, z: t.z + az * d };
      if (!isFree(mob.x, mob.z, tpl.radius, geo) || !isFree(player.x, player.z, 0.5, geo)) continue;
      // El objetivo está a ~2*d de distancia: solo cuenta si el mob lo ve (aggro) y no se suelta (leash).
      if (2 * d >= tpl.aggroRange || d >= tpl.leashRange) continue;
      tried++;
      for (let i = 0; i < 300; i++) stepMob(mob, tpl, { player, playerAlive: true, playerInSafe: false, geo, dt: 0.05 });
      if (Math.hypot(mob.x - player.x, mob.z - player.z) > tpl.attackRange + 0.6) stuck++;
    }
  }
}
console.log(`árboles probados: ${tried}, mobs trabados: ${stuck}`);
assert.ok(tried > 50, 'hay casos para probar');
assert.ok(stuck / tried < 0.03, `demasiados mobs trabados: ${stuck}/${tried}`);
