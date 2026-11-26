// Traduce una sola vez, al cargar, los textos de los datos del juego (ítems, mobs, NPCs, misiones,
// clases, zonas, skins). Así ningún sitio que los dibuja tiene que acordarse de llamar a t().
import { lang, t } from './index';

interface Named {
  name?: string;
  title?: string;
  desc?: string;
}

export function localizeData(data: {
  items: Record<string, Named>;
  mobs: Record<string, Named>;
  npcs: Record<string, Named & { lines: string[] }>;
  quests: Record<string, { title: string; chapter?: string; targetName: string; offer: string; progress: string; complete: string }>;
  classes: Record<string, { role: string; blurb: string; calling: string; skill: { name: string } }>;
  skins: Array<{ name: string }>;
  zones: Array<{ name: string; geometry: { regions: Array<{ name: string }> } }>;
}): void {
  if (lang === 'en') return;
  for (const i of Object.values(data.items)) {
    i.name = t(i.name!);
    i.desc = t(i.desc!);
  }
  for (const m of Object.values(data.mobs)) m.name = t(m.name!);
  for (const n of Object.values(data.npcs)) {
    n.name = t(n.name!);
    n.title = t(n.title!);
    n.lines = n.lines.map((l) => t(l));
  }
  for (const q of Object.values(data.quests)) {
    q.title = t(q.title);
    if (q.chapter) q.chapter = t(q.chapter);
    q.targetName = t(q.targetName);
    q.offer = t(q.offer);
    q.progress = t(q.progress);
    q.complete = t(q.complete);
  }
  for (const c of Object.values(data.classes)) {
    c.role = t(c.role);
    c.blurb = t(c.blurb);
    c.calling = t(c.calling);
    c.skill.name = t(c.skill.name);
  }
  for (const s of data.skins) s.name = t(s.name);
  for (const z of data.zones) {
    z.name = t(z.name);
    for (const r of z.geometry.regions) r.name = t(r.name);
  }
}
