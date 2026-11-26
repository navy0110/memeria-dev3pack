// Tipos compartidos por cliente y (más adelante) servidor.
// Este módulo NO importa Three.js ni APIs del navegador: la lógica de juego debe
// poder ejecutarse en Node sin cambios.

export interface Vec2 {
  x: number;
  z: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CircleCollider {
  shape: 'circle';
  x: number;
  z: number;
  r: number;
  visual: string;
}

export interface BoxCollider {
  shape: 'box';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  visual: string;
}

export type Collider = CircleCollider | BoxCollider;

export type GroundKind = 'grass' | 'road' | 'stone' | 'swamp';

export interface Region {
  id: string;
  name: string;
  bounds: Bounds;
  safe: boolean;
  ground: GroundKind;
}

export interface WorldGeometry {
  bounds: Bounds;
  colliders: Collider[];
  regions: Region[];
}

/** Modelo del enemigo: oso, fantasma, toro con cuernos o golem de cristal. */
export type MobLook = 'beast' | 'specter' | 'bull' | 'golem';

export interface MobTemplate {
  id: string;
  name: string;
  look: MobLook;
  color: number;
  maxHp: number;
  damage: number;
  attackCooldown: number;
  attackRange: number;
  /** Segundos entre que el mob arma el golpe (aviso visual) y que pega. */
  windup: number;
  aggroRange: number;
  leashRange: number;
  speed: number;
  radius: number;
  /** Nivel del mob: decide cuánta XP rinde según el nivel del jugador y el color de su nombre. */
  level: number;
  /** Tamaño visual respecto del modelo base (1 por defecto). */
  scale?: number;
  /** Jefe de raid: escondido en el mapa, imposible en solitario, hay que ir en party. */
  raid?: boolean;
  /** XP base que da al morir contra un jugador de su mismo nivel. */
  xp: number;
  /** Monedas que suelta al morir: [mínimo, máximo]. */
  coins: [number, number];
  /** Ítems que puede soltar, cada uno con su probabilidad (0 a 1). */
  drops?: Array<{ item: string; chance: number }>;
}

export type ItemKind = 'consumable' | 'weapon' | 'armor' | 'material' | 'recipe';
export type EquipSlot = 'weapon' | 'armor';

/** Efectos de las armas especiales (los dibuja client/weapons.ts). */
export type WeaponFxKind = 'halo' | 'embers' | 'orbit' | 'rings' | 'crescent' | 'runes';

/** Cómo se ve un arma en la mano: la forma sale de la clase; esto la viste. Colores en 0xRRGGBB. */
export interface WeaponLook {
  /** Hoja, madera o gema principal. */
  blade: number;
  /** Guarda, remates y engarces. */
  trim: number;
  /** Color de brillo propio; sin él, el arma no emite luz. */
  glow?: number;
  /** Efectos animados; solo las armas especiales llevan varios. */
  fx?: WeaponFxKind[];
  /** Escala de todo el arma (1 por defecto). */
  size?: number;
}
export type Equipment = Partial<Record<EquipSlot, string>>;

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  desc: string;
  /** Símbolo que se dibuja en la casilla del inventario. */
  icon: string;
  color: string;
  /** Vida que devuelve al usarse (solo consumibles). */
  heal?: number;
  /** Casilla de equipo donde se coloca (solo armas y armaduras). */
  slot?: EquipSlot;
  /** Nivel mínimo para equiparlo. */
  levelReq?: number;
  /** Clases que pueden equiparlo; sin lista, todas. */
  classes?: string[];
  /** Daño plano que suma el arma (a la habilidad le suma la mitad). */
  damage?: number;
  /** Defensa de la armadura: el daño recibido se multiplica por 100 / (100 + 2 * defensa). */
  defense?: number;
  /** Precio de compra en monedas; sin precio, no se vende en tiendas. */
  buy?: number;
  /** Lo que paga cualquier tienda por él; sin precio, no se puede vender. */
  sell?: number;
  /** Precio en MMRIA (el token del juego). Estos ítems no se compran con monedas. */
  mmria?: number;
  rarity?: 'legendary';
  /** Aspecto del arma equipada y en la vista previa de la tienda. */
  look?: WeaponLook;
}

/** Tienda de un NPC: qué vende. Todo lo que tenga precio de venta se le puede vender. */
export interface ShopDef {
  npc: string;
  stock: string[];
  /** Si está, la tienda es una posada: cuesta esto por nivel descansar. */
  restPerLevel?: number;
}

export interface ItemStack {
  id: string;
  qty: number;
}

// Clase jugable (mascota). Pisa los números base de RULES para el jugador.
export interface PlayerClass {
  id: string;
  name: string;
  role: string;
  blurb: string;
  /** Línea del prólogo: por qué esta mascota llegó al pueblo. */
  calling: string;
  maxHp: number;
  maxMp: number;
  mpRegen: number;
  speed: number;
  /** Ataca a distancia con proyectil visible (mago, arquero). */
  ranged?: boolean;
  /** `windup`: segundos entre apretar la tecla y que el golpe conecta. */
  attack: { damage: number; range: number; cooldown: number; windup: number };
  skill: { name: string; damage: number; range: number; cost: number; cooldown: number; windup: number };
}

// Misión de cacería: matar `count` mobs de la plantilla `target`. La da y la cierra el mismo NPC.
export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  /** Misión que debe estar entregada antes de que esta se ofrezca. */
  requires?: string;
  target: string;
  targetName: string;
  count: number;
  /** Capítulo al que pertenece: rotula la misión en el rastreador. */
  chapter?: string;
  /** Ítems que entrega el NPC al cerrarla (las páginas del Ledger no dependen de la suerte). */
  rewardItems?: string[];
  /** Nivel recomendado; se muestra en el rastreador de misiones. */
  level: number;
  rewardXp: number;
  rewardCoins: number;
  offer: string;
  progress: string;
  complete: string;
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface QuestState {
  id: string;
  status: QuestStatus;
  progress: number;
}

/** Aspecto de un NPC: cada arquetipo del mundo memecoin tiene su modelo en el cliente. */
export type NpcLook =
  | 'elder'
  | 'scout'
  | 'innkeeper'
  | 'alchemist'
  | 'smith'
  | 'paper'
  | 'whale'
  | 'degen'
  | 'exit'
  | 'grocer'
  | 'mod'
  | 'founder';

export interface NpcDef {
  id: string;
  name: string;
  /** Oficio, se muestra junto al nombre. */
  title: string;
  look: NpcLook;
  lines: string[];
}

export type SpawnDef =
  | {
      type: 'mob';
      id: string;
      template: string;
      position: [number, number, number];
      respawnTime: number;
    }
  | {
      type: 'npc';
      id: string;
      npc: string;
      position: [number, number, number];
    };

export interface ZoneDef {
  id: string;
  name: string;
  geometry: WorldGeometry;
  playerStart: [number, number, number];
  spawns: SpawnDef[];
}

// Intención del jugador en un tick fijo. Ya viene en coordenadas de mundo
// (el cliente rota WASD según la cámara), así que el servidor no necesita cámara.
export interface Command {
  seq: number;
  moveX: number;
  moveZ: number;
  attack: boolean;
  skill: boolean;
  interact: boolean;
  /** Mend: curar a un compañero de la party. */
  mend: boolean;
}

// Hechos que ocurrieron durante un step. El cliente los traduce en feedback visual
// y de texto; el servidor los enviaría a los clientes.
export type GameEvent =
  | { type: 'swing'; sourceId: string; kind: 'attack' | 'skill'; windup: number; targetId?: string }
  | { type: 'strike'; sourceId: string; kind: 'attack' | 'skill'; targetId?: string }
  | { type: 'mobWindup'; id: string; duration: number }
  | { type: 'damage'; targetId: string; sourceId: string; amount: number; remote?: boolean }
  | { type: 'death'; id: string }
  | { type: 'respawn'; id: string }
  | { type: 'talk'; npcId: string; name: string; text: string }
  | { type: 'shop'; npcId: string; name: string; text: string }
  | { type: 'xp'; amount: number }
  | { type: 'drop'; drop: LootDrop }
  | { type: 'dropGone'; id: string }
  | { type: 'loot'; coins: number; items: string[]; tokens?: number }
  | { type: 'levelUp'; level: number }
  | { type: 'quest'; kind: 'accepted' | 'ready' | 'done'; title: string; xp?: number; coins?: number; items?: string[] }
  | { type: 'mend' }
  | { type: 'healed'; amount: number; from: string }
  | { type: 'playerDeath' }
  | { type: 'info'; text: string; error?: boolean };

/** Botín en el suelo: cae donde muere el mob y se recoge pasando cerca; si nadie lo toca, se pierde. */
export interface LootDrop extends Vec2 {
  id: string;
  coins: number;
  items: string[];
  /** Fichas MMRIA que trae (las pone el servidor; sin servidor no hay). */
  tokens?: number;
  /** Segundos que le quedan antes de desaparecer. */
  ttl: number;
}

export interface PlayerState extends Vec2 {
  id: string;
  name: string;
  facing: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attackCd: number;
  skillCd: number;
  /** Segundos que faltan para poder volver a usar Mend. */
  mendCd: number;
  /** Golpe o habilidad en curso: conecta cuando `t` llega a 0. */
  swing: { kind: 'attack' | 'skill'; t: number; targetId?: string } | null;
  kills: number;
  level: number;
  xp: number;
  /** XP para el próximo nivel; 0 en el nivel máximo. */
  xpToNext: number;
}

export interface MobState extends Vec2 {
  id: string;
  templateId: string;
  homeX: number;
  homeZ: number;
  facing: number;
  hp: number;
  alive: boolean;
  attackCd: number;
  /** > 0 mientras el mob arma el golpe. */
  windup: number;
  respawnTime: number;
  respawnLeft: number;
  /** Lado por el que rodea un obstáculo (lo recuerda para no zigzaguear). */
  steer?: -1 | 1;
}

export interface NpcState extends Vec2 {
  id: string;
  npcId: string;
  name: string;
  title: string;
  look: NpcLook;
  lines: string[];
  talkIndex: number;
}

/** Progreso de un jugador que se guarda entre sesiones. Sin posición: siempre se vuelve a la villa. */
export interface SaveData {
  v: 1;
  /** Héroe al que pertenece; un guardado de otra clase no se carga. */
  classId?: string;
  level: number;
  xp: number;
  coins: number;
  kills: number;
  inventory: ItemStack[];
  equipment?: Equipment;
  /** Consumibles asignados a las teclas 1 a 5. */
  hotbar?: Array<string | null>;
  quests: QuestState[];
  /** Cuándo se tomó la foto (ms): entre la copia local y la del servidor manda la más nueva. */
  at?: number;
}
