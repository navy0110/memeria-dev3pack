import { isFree, insideBounds } from './collision';
import type { MobTemplate, NpcDef, ZoneDef } from './types';

// Chequeo de datos al cargar una zona: detecta spawns dentro de obstáculos,
// referencias rotas e ids repetidos. Devuelve la lista de problemas (vacía si todo está bien).
export function validateZone(
  zone: ZoneDef,
  templates: Record<string, MobTemplate>,
  npcDefs: Record<string, NpcDef>,
): string[] {
  const issues: string[] = [];
  const geo = zone.geometry;
  const seen = new Set<string>();

  for (const c of geo.colliders) {
    const ok =
      c.shape === 'circle'
        ? insideBounds(geo.bounds, c.x, c.z, c.r)
        : insideBounds(geo.bounds, c.minX, c.minZ) && insideBounds(geo.bounds, c.maxX, c.maxZ);
    if (!ok) issues.push(`colisionable fuera del mapa (${c.visual})`);
  }

  const [sx, , sz] = zone.playerStart;
  if (!isFree(sx, sz, 0.45, geo)) issues.push('inicio del jugador dentro de un obstáculo');

  for (const s of zone.spawns) {
    if (seen.has(s.id)) issues.push(`id de spawn repetido: ${s.id}`);
    seen.add(s.id);
    const [x, , z] = s.position;
    if (s.type === 'mob') {
      const tpl = templates[s.template];
      if (!tpl) {
        issues.push(`plantilla inexistente en ${s.id}: ${s.template}`);
        continue;
      }
      if (!isFree(x, z, tpl.radius, geo)) issues.push(`mob ${s.id} nace dentro de un obstáculo`);
    } else {
      if (!npcDefs[s.npc]) issues.push(`NPC inexistente en ${s.id}: ${s.npc}`);
      if (!isFree(x, z, 0.4, geo)) issues.push(`NPC ${s.id} nace dentro de un obstáculo`);
    }
  }
  return issues;
}
