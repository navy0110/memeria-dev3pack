import type { ZoneDef } from '../shared/types';
import { ITEMS } from './items';
import { MOB_TEMPLATES } from './mobs';
import { NPC_DEFS } from './npcs';
import { HODL_HOLLOW } from './zones/hodl-hollow';
import { localizeData } from '../i18n/localize';
import { CLASSES } from './classes';
import { QUESTS } from './quests';
import { SKINS } from './skins';

// Registro central de datos. Agregar una zona nueva = agregar un archivo en zones/
// y registrarlo acá. Multiplayer usará los mismos datos en el servidor.
const ZONES: Record<string, ZoneDef> = {
  [HODL_HOLLOW.id]: HODL_HOLLOW,
};

localizeData({
  items: ITEMS,
  mobs: MOB_TEMPLATES,
  npcs: NPC_DEFS,
  quests: QUESTS,
  classes: CLASSES,
  skins: SKINS,
  zones: Object.values(ZONES),
});

export function getZone(id: string): ZoneDef {
  const z = ZONES[id];
  if (!z) throw new Error(`Zona desconocida: ${id}`);
  return z;
}

export { CLASSES, CLASS_LIST } from './classes';
export { ITEMS, MOB_TEMPLATES, NPC_DEFS };
export { QUESTS } from './quests';
export { SHOPS } from './shops';
