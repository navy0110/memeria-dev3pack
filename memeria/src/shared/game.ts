import { stepMob } from './ai';
import { t } from '../i18n';
import { nearestTarget } from './combat';
import { regionAt } from './collision';
import { moveIntent } from './movement';
import { PARTY } from './party';
import { DROP_LIFE, HOTBAR_SLOTS, PICKUP_RADIUS, RULES, xpForKill, xpForLevel } from './rules';
import type {
  Command,
  GameEvent,
  LootDrop,
  Vec2,
  EquipSlot,
  Equipment,
  ItemDef,
  ItemStack,
  MobState,
  MobTemplate,
  NpcDef,
  NpcState,
  PlayerClass,
  PlayerState,
  QuestDef,
  QuestState,
  SaveData,
  ShopDef,
  ZoneDef,
  WorldGeometry,
} from './types';

/** Conexión al servidor de la zona. Con `live`, los mobs y el botín los manda el servidor y acá solo se reportan golpes. */
export interface WorldLink {
  readonly live: boolean;
  hit(mobId: string, amount: number): void;
  pickup(dropId: string): void;
  /** Mend a un compañero de la party (el servidor valida y reparte la curación). */
  heal(targetId: string): void;
}

/** Un mob tal como lo manda el servidor: [id, x, z, mirando, vida, aviso del golpe, vivo]. */
export type WireMob = [string, number, number, number, number, number, 0 | 1];

// Estado autoritativo de una zona. Un step(cmd, dt) avanza el mundo un tick.
// No conoce el render ni el input: el cliente le entrega Commands y lee events.
// En multiplayer, el servidor corre exactamente esta clase y los clientes
// corren una copia para predicción.
export class GameState {
  readonly zoneId: string;
  readonly geo: WorldGeometry;
  readonly player: PlayerState;
  readonly mobs: MobState[] = [];
  /** Botín en el suelo, a la espera de que alguien pase cerca. */
  readonly drops: LootDrop[] = [];
  private dropSeq = 0;
  readonly npcs: NpcState[] = [];
  readonly events: GameEvent[] = [];
  readonly templates: Record<string, MobTemplate>;
  readonly cls: PlayerClass;
  readonly quests: QuestState[] = [];
  readonly questDefs: Record<string, QuestDef>;
  readonly itemDefs: Record<string, ItemDef>;
  readonly inventory: ItemStack[] = [];
  readonly equipment: Equipment = {};
  readonly shops: Record<string, ShopDef>;
  /** NPC de la tienda abierta; null si no hay ninguna. Se cierra solo al alejarse. */
  shopNpcId: string | null = null;
  coins = 0;
  /** Fichas MMRIA: las lleva el servidor (acá solo se muestran), no entran al guardado. */
  tokens = 0;
  /** ¿El servidor tiene abiertas las compras con MMRIA real? */
  payments = false;
  /** Consumibles asignados a las teclas 1 a 5 (id del ítem, o null si la casilla está libre). */
  readonly hotbar: Array<string | null> = Array.from({ length: HOTBAR_SLOTS }, () => null);
  /** Servidor de la zona; null o sin conexión, el mundo corre local (modo sin conexión). */
  net: WorldLink | null = null;
  /** Hechos que llegaron por la red entre ticks; entran a `events` en el próximo step. */
  private readonly inbox: GameEvent[] = [];
  /** Muertes en las que participamos y todavía no se cobraron: se cobran dentro de un step, donde los eventos llegan al cliente. */
  private readonly kills: string[] = [];
  private readonly targets = new Map<string, Vec2>();
  private readonly pickupAsked = new Map<string, number>();
  private readonly start: [number, number, number];
  private readonly zoneName: string;
  time = 0;

  constructor(
    zone: ZoneDef,
    templates: Record<string, MobTemplate>,
    npcDefs: Record<string, NpcDef>,
    cls: PlayerClass,
    questDefs: Record<string, QuestDef> = {},
    itemDefs: Record<string, ItemDef> = {},
    shops: Record<string, ShopDef> = {},
  ) {
    this.cls = cls;
    this.shops = shops;
    this.itemDefs = itemDefs;
    this.questDefs = questDefs;
    for (const q of Object.values(questDefs)) {
      this.quests.push({ id: q.id, status: q.requires ? 'locked' : 'available', progress: 0 });
    }
    this.zoneId = zone.id;
    this.zoneName = zone.name;
    this.geo = zone.geometry;
    this.templates = templates;
    this.start = zone.playerStart;

    this.player = {
      id: 'player',
      name: cls.name,
      x: zone.playerStart[0],
      z: zone.playerStart[2],
      facing: 0,
      hp: cls.maxHp,
      maxHp: cls.maxHp,
      mp: cls.maxMp,
      maxMp: cls.maxMp,
      attackCd: 0,
      skillCd: 0,
      mendCd: 0,
      swing: null,
      kills: 0,
      level: 1,
      xp: 0,
      xpToNext: xpForLevel(1),
    };

    for (const s of zone.spawns) {
      if (s.type === 'mob') {
        const tpl = templates[s.template];
        if (!tpl) throw new Error(`Plantilla de mob desconocida: ${s.template}`);
        const [x, , z] = s.position;
        this.mobs.push({
          id: s.id,
          templateId: tpl.id,
          x,
          z,
          homeX: x,
          homeZ: z,
          facing: 0,
          hp: tpl.maxHp,
          alive: true,
          attackCd: 0,
          windup: 0,
          respawnTime: s.respawnTime,
          respawnLeft: 0,
        });
      } else {
        const def = npcDefs[s.npc];
        if (!def) throw new Error(`NPC desconocido: ${s.npc}`);
        const [x, , z] = s.position;
        this.npcs.push({ id: s.id, npcId: def.id, name: def.name, title: def.title, look: def.look, lines: def.lines, x, z, talkIndex: 0 });
      }
    }
  }

  get zoneLabel(): string {
    return regionAt(this.geo, this.player.x, this.player.z)?.name ?? this.zoneName;
  }

  get inSafeZone(): boolean {
    return regionAt(this.geo, this.player.x, this.player.z)?.safe ?? false;
  }

  nameOf(id: string): string {
    if (id === this.player.id) return this.player.name;
    const mob = this.mobs.find((m) => m.id === id);
    if (mob) return this.templates[mob.templateId].name;
    const npc = this.npcs.find((n) => n.id === id);
    return npc ? npc.name : id;
  }

  nearbyNpc(): NpcState | null {
    const r2 = RULES.interactRange * RULES.interactRange;
    let best: NpcState | null = null;
    let bestD2 = r2;
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      const dx = n.x - this.player.x;
      const dz = n.z - this.player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) {
        best = n;
        bestD2 = d2;
      }
    }
    return best;
  }

  /** ¿El mundo lo está llevando el servidor? */
  get online(): boolean {
    return !!this.net?.live;
  }

  step(cmd: Command, dt: number): void {
    this.events.length = 0;
    if (this.inbox.length) this.events.push(...this.inbox.splice(0));
    for (const id of this.kills.splice(0)) this.creditKill(id);
    this.time += dt;
    const p = this.player;

    if (cmd.moveX !== 0 || cmd.moveZ !== 0) {
      moveIntent(p, cmd.moveX, cmd.moveZ, this.cls.speed, dt, RULES.player.radius, this.geo);
      // Durante el windup de un golpe la mira queda fija: si girabas rápido, el proyectil salía hacia donde
      // terminabas mirando y no hacia donde apuntaste al apretar.
      if (p.swing?.kind !== 'attack') p.facing = Math.atan2(cmd.moveX, cmd.moveZ);
    }

    p.attackCd = Math.max(0, p.attackCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.mendCd = Math.max(0, p.mendCd - dt);
    p.mp = Math.min(p.maxMp, p.mp + this.cls.mpRegen * dt);

    this.tickSwing(dt);

    if (cmd.attack) this.playerAttack();
    if (cmd.skill) this.playerSkill();
    if (cmd.mend) this.playerMend();
    if (cmd.interact) this.playerInteract();

    if (this.online) this.followServerMobs(dt);
    else this.updateMobs(dt);
    this.updateDrops(dt);
    this.checkShopRange();

    if (p.hp <= 0) this.playerDied();
  }

  private playerAttack(): void {
    const p = this.player;
    if (p.attackCd > 0 || p.swing) return;
    p.attackCd = this.cls.attack.cooldown;
    // El objetivo se fija al apretar; el golpe conecta `windup` segundos después.
    const target = nearestTarget(p.x, p.z, this.cls.attack.range, this.mobs);
    if (target) p.facing = Math.atan2(target.x - p.x, target.z - p.z);
    p.swing = { kind: 'attack', t: this.cls.attack.windup, targetId: target?.id };
    this.events.push({ type: 'swing', sourceId: p.id, kind: 'attack', windup: this.cls.attack.windup, targetId: target?.id });
  }

  private playerSkill(): void {
    const p = this.player;
    if (p.swing) return;
    if (p.skillCd > 0) {
      this.events.push({ type: 'info', error: true, text: t('{name} ready in {n}s', { name: this.cls.skill.name, n: Math.ceil(p.skillCd) }) });
      return;
    }
    if (p.mp < this.cls.skill.cost) {
      this.events.push({ type: 'info', error: true, text: t('Not enough MP') });
      return;
    }
    p.mp -= this.cls.skill.cost;
    p.skillCd = this.cls.skill.cooldown;
    p.swing = { kind: 'skill', t: this.cls.skill.windup };
    this.events.push({ type: 'swing', sourceId: p.id, kind: 'skill', windup: this.cls.skill.windup });
  }

  /** A quién curaría Mend ahora (lo decide el cliente según su party); null si no hay nadie a quien curar. */
  mendTarget: () => string | null = () => null;

  /** Mend: cura a un compañero de la party. Gasta MP y tiene su propio enfriamiento; no interrumpe el combate. */
  private playerMend(): void {
    const p = this.player;
    if (!this.online) {
      this.events.push({ type: 'info', error: true, text: t('Mend needs a party, and a party needs the server.') });
      return;
    }
    if (p.mendCd > 0) {
      this.events.push({ type: 'info', error: true, text: t('Mend ready in {n}s', { n: Math.ceil(p.mendCd) }) });
      return;
    }
    if (p.mp < PARTY.mend.cost) {
      this.events.push({ type: 'info', error: true, text: t('Not enough MP') });
      return;
    }
    const id = this.mendTarget();
    if (!id) {
      this.events.push({ type: 'info', error: true, text: t('Nobody in your party needs healing within reach.') });
      return;
    }
    p.mp -= PARTY.mend.cost;
    p.mendCd = PARTY.mend.cooldown;
    this.net!.heal(id);
    this.events.push({ type: 'mend' });
  }

  /** El servidor rechazó el Mend: se devuelve el MP y el enfriamiento. */
  refundMend(): void {
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + PARTY.mend.cost);
    this.player.mendCd = 0;
  }

  /** Un compañero nos curó. */
  applyHeal(amount: number, from: string): void {
    const p = this.player;
    if (p.hp <= 0) return;
    const healed = Math.min(amount, p.maxHp - p.hp);
    if (healed <= 0) return;
    p.hp += healed;
    this.inbox.push({ type: 'healed', amount: Math.round(healed), from });
  }

  /** Avanza el golpe en curso y lo resuelve cuando termina el windup. */
  private tickSwing(dt: number): void {
    const p = this.player;
    const s = p.swing;
    if (!s) return;
    s.t -= dt;
    if (s.t > 0) return;
    p.swing = null;
    if (s.kind === 'attack') this.resolveAttack(s.targetId);
    else this.resolveSkill();
  }

  private resolveAttack(lockedId?: string): void {
    const p = this.player;
    const range = this.cls.attack.range;
    let target: MobState | null = null;
    const locked = lockedId ? this.mobs.find((m) => m.id === lockedId) : undefined;
    if (locked?.alive && Math.hypot(locked.x - p.x, locked.z - p.z) <= range * 1.3) target = locked;
    target ??= nearestTarget(p.x, p.z, range, this.mobs);
    this.events.push({ type: 'strike', sourceId: p.id, kind: 'attack', targetId: target?.id });
    if (target) p.facing = Math.atan2(target.x - p.x, target.z - p.z);
    if (!target) {
      this.events.push({ type: 'info', text: t('You swing at nothing') });
      return;
    }
    this.hurtMob(target, this.scaled(this.cls.attack.damage + this.weaponDamage), p.id);
  }

  private resolveSkill(): void {
    const p = this.player;
    this.events.push({ type: 'strike', sourceId: p.id, kind: 'skill' });
    let hits = 0;
    const r2 = this.cls.skill.range * this.cls.skill.range;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (!m.alive) continue;
      const dx = m.x - p.x;
      const dz = m.z - p.z;
      if (dx * dx + dz * dz <= r2) {
        hits++;
        this.hurtMob(m, this.scaled(this.cls.skill.damage + Math.round(this.weaponDamage / 2)), p.id);
      }
    }
    if (hits === 0) this.events.push({ type: 'info', text: t('{name} hit nothing', { name: this.cls.skill.name }) });
  }

  private playerInteract(): void {
    const npc = this.nearbyNpc();
    if (!npc) {
      this.events.push({ type: 'info', error: true, text: t('There is no one nearby to talk to') });
      return;
    }
    const quest = this.questFor(npc.npcId);
    if (quest) {
      this.talkQuest(npc, quest);
      return;
    }
    if (this.shops[npc.npcId]) {
      this.shopNpcId = npc.id;
      const text = npc.lines[npc.talkIndex % npc.lines.length];
      npc.talkIndex++;
      this.events.push({ type: 'shop', npcId: npc.id, name: npc.name, text });
      return;
    }
    const text = npc.lines[npc.talkIndex % npc.lines.length];
    npc.talkIndex++;
    this.events.push({ type: 'talk', npcId: npc.id, name: npc.name, text });
  }

  /** Daño base escalado por nivel. */
  private scaled(base: number): number {
    return Math.round(base * (1 + RULES.progression.damagePerLevel * (this.player.level - 1)));
  }

  private gear(slot: EquipSlot): ItemDef | undefined {
    const id = this.equipment[slot];
    return id ? this.itemDefs[id] : undefined;
  }

  /** Daño plano que suma el arma equipada. */
  get weaponDamage(): number {
    return this.gear('weapon')?.damage ?? 0;
  }

  /** Defensa total de la armadura equipada. */
  get defense(): number {
    return this.gear('armor')?.defense ?? 0;
  }

  /** Daño de un golpe normal con el arma puesta y el nivel actual (para mostrar en pantalla). */
  get attackPower(): number {
    return this.scaled(this.cls.attack.damage + this.weaponDamage);
  }

  /** Por qué este ítem no se puede equipar ahora, o null si se puede. */
  equipProblem(def: ItemDef): string | null {
    if (!def.slot) return `${def.name} cannot be equipped`;
    if (def.classes && !def.classes.includes(this.cls.id)) return `${def.name} is not for a ${this.cls.role}`;
    if ((def.levelReq ?? 1) > this.player.level) return `${def.name} needs level ${def.levelReq}`;
    return null;
  }

  equip(itemId: string): string | null {
    const def = this.itemDefs[itemId];
    if (!def || !this.inventory.some((i) => i.id === itemId)) return null;
    const problem = this.equipProblem(def);
    if (problem) return problem;
    this.equipment[def.slot!] = itemId;
    return t('You equip {name}', { name: def.name });
  }

  unequip(slot: EquipSlot): string | null {
    const def = this.gear(slot);
    if (!def) return null;
    delete this.equipment[slot];
    return t('You take off {name}', { name: def.name });
  }

  isEquipped(itemId: string): boolean {
    return this.equipment.weapon === itemId || this.equipment.armor === itemId;
  }

  /** Tienda abierta (su definición y el NPC), o null. */
  get openShop(): { def: ShopDef; npc: NpcState } | null {
    const npc = this.npcs.find((n) => n.id === this.shopNpcId);
    const def = npc ? this.shops[npc.npcId] : undefined;
    return npc && def ? { def, npc } : null;
  }

  closeShop(): void {
    this.shopNpcId = null;
  }

  private checkShopRange(): void {
    const shop = this.openShop;
    if (!shop) return;
    const reach = RULES.interactRange * 1.5;
    if (Math.hypot(shop.npc.x - this.player.x, shop.npc.z - this.player.z) > reach) this.shopNpcId = null;
  }

  /** Compra un ítem de la tienda abierta. Devuelve el mensaje, o null si no hay tienda. */
  buy(itemId: string): string | null {
    const shop = this.openShop;
    const def = this.itemDefs[itemId];
    if (!shop || !def || !shop.def.stock.includes(itemId) || def.buy === undefined) return null;
    if (def.slot && this.inventory.some((i) => i.id === itemId)) return t('You already own {name}', { name: def.name });
    if (this.coins < def.buy) return t('Not enough coins for {name} ({n})', { name: def.name, n: def.buy });
    this.coins -= def.buy;
    this.addItem(itemId);
    return t('You buy {name} for {n} coins', { name: def.name, n: def.buy });
  }

  /** Descansar en la posada abierta: cuesta monedas por nivel y devuelve vida y maná. */
  rest(): string | null {
    const shop = this.openShop;
    const per = shop?.def.restPerLevel;
    if (!shop || per === undefined) return null;
    const p = this.player;
    if (p.hp >= p.maxHp && p.mp >= p.maxMp) return t('You are already fully rested');
    const cost = per * p.level;
    if (this.coins < cost) return t('Not enough coins to rest ({n})', { n: cost });
    this.coins -= cost;
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    return t('You rest at the inn for {n} coins. Health and mana restored', { n: cost });
  }

  /** Vende un ítem a la tienda abierta. */
  sell(itemId: string): string | null {
    const def = this.itemDefs[itemId];
    const stack = this.inventory.find((i) => i.id === itemId);
    if (!this.openShop || !def || !stack || def.sell === undefined) return null;
    if (this.isEquipped(itemId)) return t('Take off {name} before selling it', { name: def.name });
    stack.qty--;
    if (stack.qty <= 0) this.inventory.splice(this.inventory.indexOf(stack), 1);
    this.coins += def.sell;
    return t('You sell {name} for {n} coins', { name: def.name, n: def.sell });
  }

  /** Misión de este NPC que toca atender ahora: lista para entregar, activa u ofrecible. */
  private questFor(npcDefId: string): QuestState | null {
    const mine = this.quests.filter((q) => this.questDefs[q.id].giver === npcDefId);
    return (
      mine.find((q) => q.status === 'ready') ??
      mine.find((q) => q.status === 'active') ??
      mine.find((q) => q.status === 'available') ??
      null
    );
  }

  private talkQuest(npc: NpcState, quest: QuestState): void {
    const def = this.questDefs[quest.id];
    const say = (text: string): void => {
      this.events.push({ type: 'talk', npcId: npc.id, name: npc.name, text });
    };
    if (quest.status === 'available') {
      quest.status = 'active';
      say(def.offer);
      this.events.push({ type: 'quest', kind: 'accepted', title: def.title });
    } else if (quest.status === 'active') {
      say(t('{text} ({n}/{total})', { text: def.progress, n: quest.progress, total: def.count }));
    } else {
      quest.status = 'done';
      say(def.complete);
      this.coins += def.rewardCoins;
      const items = (def.rewardItems ?? []).filter((id) => this.itemDefs[id]);
      for (const id of items) this.addItem(id);
      this.events.push({ type: 'quest', kind: 'done', title: def.title, xp: def.rewardXp, coins: def.rewardCoins, items });
      this.gainXp(def.rewardXp);
      for (const q of this.quests) {
        if (q.status === 'locked' && this.questDefs[q.id].requires === def.id) q.status = 'available';
      }
    }
  }

  /** Misión en curso (la primera activa o lista para entregar), para el HUD. */
  get trackedQuest(): { def: QuestDef; state: QuestState } | null {
    const q = this.quests.find((s) => s.status === 'active' || s.status === 'ready');
    return q ? { def: this.questDefs[q.id], state: q } : null;
  }

  private gainXp(amount: number): void {
    const p = this.player;
    if (p.level >= RULES.progression.maxLevel) return;
    p.xp += amount;
    this.events.push({ type: 'xp', amount });
    while (p.level < RULES.progression.maxLevel && p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level++;
      p.xpToNext = p.level >= RULES.progression.maxLevel ? 0 : xpForLevel(p.level);
      this.applyLevelStats();
      p.hp = p.maxHp;
      p.mp = p.maxMp;
      this.events.push({ type: 'levelUp', level: p.level });
    }
    if (p.level >= RULES.progression.maxLevel) p.xp = 0;
  }

  /** Foto del progreso para guardarlo. */
  snapshot(): SaveData {
    const p = this.player;
    return {
      v: 1,
      classId: this.cls.id,
      level: p.level,
      xp: p.xp,
      coins: this.coins,
      kills: p.kills,
      inventory: this.inventory.map((i) => ({ ...i })),
      equipment: { ...this.equipment },
      hotbar: [...this.hotbar],
      quests: this.quests.map((q) => ({ ...q })),
      at: Date.now(),
    };
  }

  /**
   * Carga un progreso guardado. Descarta lo que ya no existe en los datos (ítems o misiones
   * borrados) y acota el nivel, para que un guardado viejo no rompa una versión nueva.
   */
  restore(data: SaveData): void {
    const p = this.player;
    const max = RULES.progression.maxLevel;
    p.level = Math.max(1, Math.min(max, Math.floor(data.level) || 1));
    p.xp = p.level >= max ? 0 : Math.max(0, Math.min(Math.floor(data.xp) || 0, xpForLevel(p.level) - 1));
    p.xpToNext = p.level >= max ? 0 : xpForLevel(p.level);
    p.kills = Math.max(0, Math.floor(data.kills) || 0);
    this.applyLevelStats();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    this.coins = Math.max(0, Math.floor(data.coins) || 0);
    this.inventory.length = 0;
    for (const s of data.inventory ?? []) {
      if (this.itemDefs[s.id] && s.qty > 0) this.inventory.push({ id: s.id, qty: Math.floor(s.qty) });
    }
    // El equipo guardado solo vale si el ítem existe, sigue en la mochila y este héroe puede llevarlo.
    for (const key of Object.keys(this.equipment) as EquipSlot[]) delete this.equipment[key];
    for (const id of Object.values(data.equipment ?? {})) {
      const def = this.itemDefs[id];
      if (def?.slot && this.inventory.some((i) => i.id === id) && !this.equipProblem(def)) this.equipment[def.slot] = id;
    }
    this.hotbar.fill(null);
    (data.hotbar ?? []).slice(0, HOTBAR_SLOTS).forEach((id, i) => {
      if (id && this.itemDefs[id]?.heal !== undefined) this.hotbar[i] = id;
    });
    // Guardados de antes de la barra: los consumibles que ya tenías quedan a mano.
    for (const s of this.inventory) this.autoHotbar(s.id);
    for (const saved of data.quests ?? []) {
      const q = this.quests.find((x) => x.id === saved.id);
      if (!q) continue;
      q.status = saved.status;
      q.progress = Math.max(0, Math.min(this.questDefs[q.id].count, Math.floor(saved.progress) || 0));
    }
    // Si se agregó una misión nueva encadenada a una ya entregada, queda ofrecible.
    for (const q of this.quests) {
      const req = this.questDefs[q.id].requires;
      if (q.status === 'locked' && req && this.quests.find((x) => x.id === req)?.status === 'done') q.status = 'available';
    }
  }

  private applyLevelStats(): void {
    const p = this.player;
    const g = RULES.progression;
    p.maxHp = Math.round(this.cls.maxHp * (1 + g.hpPerLevel * (p.level - 1)));
    p.maxMp = Math.round(this.cls.maxMp * (1 + g.mpPerLevel * (p.level - 1)));
  }

  addItem(id: string, qty = 1): void {
    const stack = this.inventory.find((i) => i.id === id);
    if (stack) stack.qty += qty;
    else this.inventory.push({ id, qty });
    this.autoHotbar(id);
  }

  /** Entrega un ítem comprado con MMRIA (o recupera los de compras anteriores al entrar). Un ítem de equipo no se repite. */
  grant(itemId: string): void {
    const def = this.itemDefs[itemId];
    if (!def || (def.slot && (this.inventory.some((i) => i.id === itemId)))) return;
    this.addItem(itemId);
  }

  /** Un consumible nuevo ocupa la primera casilla libre de la barra, si todavía no está en ella. */
  private autoHotbar(id: string): void {
    if (this.itemDefs[id]?.heal === undefined || this.hotbar.includes(id)) return;
    const free = this.hotbar.indexOf(null);
    if (free >= 0) this.hotbar[free] = id;
  }

  /** Asigna un consumible a una casilla (0 a 4). Si ya estaba en otra, se mueve. */
  assignHotbar(slot: number, id: string): string | null {
    const def = this.itemDefs[id];
    if (!def || def.heal === undefined || slot < 0 || slot >= HOTBAR_SLOTS) return null;
    const prev = this.hotbar.indexOf(id);
    if (prev >= 0) this.hotbar[prev] = this.hotbar[slot];
    this.hotbar[slot] = id;
    return `${def.name} is now on key ${slot + 1}`;
  }

  /** Usa el consumible de una casilla de la barra. */
  useHotbar(slot: number): string | null {
    const id = this.hotbar[slot];
    if (!id) return null;
    if (!this.inventory.some((i) => i.id === id)) return t('You are out of {name}', { name: this.itemDefs[id]?.name ?? id });
    return this.useItem(id);
  }

  /** Usa un ítem del inventario. Devuelve el mensaje para mostrar, o null si no se pudo usar. */
  useItem(id: string): string | null {
    const stack = this.inventory.find((i) => i.id === id);
    const def = this.itemDefs[id];
    if (!stack || !def || def.heal === undefined) return null;
    const p = this.player;
    if (p.hp >= p.maxHp) return t('Your health is already full');
    const healed = Math.min(def.heal, p.maxHp - p.hp);
    p.hp += healed;
    stack.qty--;
    if (stack.qty <= 0) this.inventory.splice(this.inventory.indexOf(stack), 1);
    return `You use ${def.name} and recover ${Math.round(healed)} HP`;
  }

  private rollLoot(tpl: MobTemplate, at: Vec2): void {
    const coins = tpl.coins[0] + Math.floor(Math.random() * (tpl.coins[1] - tpl.coins[0] + 1));
    const items: string[] = [];
    for (const d of tpl.drops ?? []) {
      if (Math.random() < d.chance) items.push(d.item);
    }
    // Cae un poco al costado del cuerpo para que no quede tapado por el mob que respawnea.
    const a = Math.random() * Math.PI * 2;
    const drop: LootDrop = {
      id: `drop-${++this.dropSeq}`,
      x: at.x + Math.cos(a) * 0.7,
      z: at.z + Math.sin(a) * 0.7,
      coins,
      items,
      ttl: DROP_LIFE,
    };
    this.drops.push(drop);
    this.events.push({ type: 'drop', drop });
  }

  /** Vence el botín viejo y recoge el que está a mano. */
  private updateDrops(dt: number): void {
    if (this.online) {
      // El servidor decide quién se queda con la bolsa: acá solo se la pide al pasar cerca (y no más de 2 veces por segundo).
      for (const d of this.drops) {
        if (this.player.hp <= 0 || Math.hypot(d.x - this.player.x, d.z - this.player.z) >= PICKUP_RADIUS) continue;
        if (this.time - (this.pickupAsked.get(d.id) ?? -1) < 0.5) continue;
        this.pickupAsked.set(d.id, this.time);
        this.net!.pickup(d.id);
      }
      return;
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.ttl -= dt;
      const near = this.player.hp > 0 && Math.hypot(d.x - this.player.x, d.z - this.player.z) < PICKUP_RADIUS;
      if (!near && d.ttl > 0) continue;
      this.drops.splice(i, 1);
      this.events.push({ type: 'dropGone', id: d.id });
      if (!near) continue;
      this.coins += d.coins;
      for (const id of d.items) this.addItem(id);
      this.events.push({ type: 'loot', coins: d.coins, items: d.items });
    }
  }

  private hurtMob(mob: MobState, amount: number, sourceId: string): void {
    if (this.online) {
      // El golpe se muestra al instante; la vida del mob, su muerte y el botín los resuelve el servidor.
      this.events.push({ type: 'damage', targetId: mob.id, sourceId, amount });
      this.net!.hit(mob.id, amount);
      return;
    }
    mob.hp = Math.max(0, mob.hp - amount);
    this.events.push({ type: 'damage', targetId: mob.id, sourceId, amount });
    if (mob.hp > 0) return;
    mob.alive = false;
    mob.respawnLeft = mob.respawnTime;
    this.events.push({ type: 'death', id: mob.id });
    this.creditKill(mob.templateId);
    this.rollLoot(this.templates[mob.templateId], mob);
  }

  /** Cobra una muerte: contador, XP y avance de las misiones de cacería. */
  private creditKill(templateId: string): void {
    const tpl = this.templates[templateId];
    if (!tpl) return;
    this.player.kills++;
    this.gainXp(xpForKill(tpl.xp, tpl.level, this.player.level));
    for (const q of this.quests) {
      const def = this.questDefs[q.id];
      if (q.status !== 'active' || def.target !== templateId) continue;
      q.progress = Math.min(def.count, q.progress + 1);
      if (q.progress >= def.count) {
        q.status = 'ready';
        this.events.push({ type: 'quest', kind: 'ready', title: def.title });
      }
    }
  }

  // ---- Mundo compartido: lo que llega del servidor ----

  /** Estado de los mobs mandado por el servidor. Con `snap` los pone de golpe en su lugar (primera foto). */
  applyMobs(list: WireMob[], snap = false): void {
    for (const [id, x, z, facing, hp, windup, alive] of list) {
      const m = this.mobs.find((o) => o.id === id);
      if (!m) continue;
      const wasAlive = m.alive;
      const wasWinding = m.windup > 0;
      m.facing = facing;
      m.hp = hp;
      m.windup = windup;
      m.alive = alive === 1;
      this.targets.set(id, { x, z });
      if (snap || !wasAlive || !m.alive) {
        m.x = x;
        m.z = z;
      }
      if (wasAlive && !m.alive) this.inbox.push({ type: 'death', id });
      if (!wasAlive && m.alive) this.inbox.push({ type: 'respawn', id });
      if (!wasWinding && windup > 0 && m.alive) this.inbox.push({ type: 'mobWindup', id, duration: this.templates[m.templateId].windup });
    }
  }

  /** Los mobs se deslizan hacia lo que dice el servidor (llega 10 veces por segundo). */
  private followServerMobs(dt: number): void {
    const k = 1 - Math.exp(-dt * 14);
    for (const m of this.mobs) {
      const t = this.targets.get(m.id);
      if (!t || !m.alive) continue;
      if (Math.hypot(t.x - m.x, t.z - m.z) > 8) {
        m.x = t.x;
        m.z = t.z;
      } else {
        m.x += (t.x - m.x) * k;
        m.z += (t.z - m.z) * k;
      }
    }
  }

  /** Reemplaza el botín del suelo por el del servidor (al conectar o reconectar). */
  applyDrops(list: LootDrop[]): void {
    for (const d of this.drops.splice(0)) this.inbox.push({ type: 'dropGone', id: d.id });
    for (const d of list) this.applyDrop(d);
  }

  applyDrop(d: LootDrop): void {
    if (this.drops.some((o) => o.id === d.id)) return;
    const drop = { ...d };
    this.drops.push(drop);
    this.inbox.push({ type: 'drop', drop });
  }

  applyDropGone(id: string): void {
    const i = this.drops.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.drops.splice(i, 1);
    this.pickupAsked.delete(id);
    this.inbox.push({ type: 'dropGone', id });
  }

  /** El servidor nos dio la bolsa. `balance` es el saldo de fichas que quedó en su base. */
  applyLoot(coins: number, items: string[], tokens = 0, balance?: number): void {
    this.coins += coins;
    for (const id of items) if (this.itemDefs[id]) this.addItem(id);
    if (balance !== undefined) this.tokens = balance;
    this.inbox.push({ type: 'loot', coins, items, tokens });
  }

  /** Le pegó otro jugador: se ve el número sobre el mob. */
  applyRemoteHit(mobId: string, amount: number): void {
    this.inbox.push({ type: 'damage', targetId: mobId, sourceId: 'remote', amount, remote: true });
  }

  /** Participamos en la muerte de un mob. */
  applyKill(templateId: string): void {
    this.kills.push(templateId);
  }

  /** Un mob nos mordió (lo decidió el servidor). Se descuenta con nuestra defensa. */
  applyMobStrike(mobId: string, damage: number): void {
    if (this.player.hp <= 0 || this.inSafeZone) return;
    const taken = Math.max(1, Math.round((damage * 100) / (100 + 2 * this.defense)));
    this.player.hp = Math.max(0, this.player.hp - taken);
    this.inbox.push({ type: 'damage', targetId: this.player.id, sourceId: mobId, amount: taken });
  }

  private updateMobs(dt: number): void {
    const p = this.player;
    const inSafe = this.inSafeZone;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (!m.alive) {
        m.respawnLeft -= dt;
        if (m.respawnLeft <= 0) {
          m.alive = true;
          m.hp = this.templates[m.templateId].maxHp;
          m.x = m.homeX;
          m.z = m.homeZ;
          m.attackCd = 0;
          m.windup = 0;
          this.events.push({ type: 'respawn', id: m.id });
        }
        continue;
      }
      const tpl = this.templates[m.templateId];
      const wasWinding = m.windup > 0;
      const dmg = stepMob(m, tpl, {
        player: p,
        playerAlive: p.hp > 0,
        playerInSafe: inSafe,
        geo: this.geo,
        dt,
      });
      if (!wasWinding && m.windup > 0) this.events.push({ type: 'mobWindup', id: m.id, duration: tpl.windup });
      if (dmg > 0 && p.hp > 0) {
        const taken = Math.max(1, Math.round((dmg * 100) / (100 + 2 * this.defense)));
        p.hp = Math.max(0, p.hp - taken);
        this.events.push({ type: 'damage', targetId: p.id, sourceId: m.id, amount: taken });
      }
    }
  }

  private playerDied(): void {
    const p = this.player;
    p.x = this.start[0];
    p.z = this.start[2];
    // Penalidad de morir: se pierde una décima parte de las monedas.
    this.coins -= Math.floor(this.coins * 0.1);
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.attackCd = 0;
    p.skillCd = 0;
    p.mendCd = 0;
    p.swing = null;
    this.events.push({ type: 'playerDeath' });
  }
}

