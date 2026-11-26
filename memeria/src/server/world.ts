// Mundo compartido: los mobs y el botín viven acá, una sola vez para todos los jugadores de la zona.
// No conoce WebSockets ni Cloudflare (así se prueba en Node). El cliente sigue siendo dueño de su héroe
// (vida, XP, inventario); el servidor decide qué hacen los mobs, cuánta vida les queda y quién se
// queda con el botín. Reutiliza `stepMob`, la misma IA que corre el cliente sin conexión.
import { CLASSES, MOB_TEMPLATES } from '../data';
import { HODL_HOLLOW } from '../data/zones/hodl-hollow';
import { regionAt } from '../shared/collision';
import { stepMob } from '../shared/ai';
import { BOSS_IDS } from '../shared/emotes';
import { DROP_LIFE, PICKUP_RADIUS, RULES, TOKEN } from '../shared/rules';
import type { LootDrop, MobState } from '../shared/types';

/** Un mob en el cable: [id, x, z, mirando, vida, aviso del golpe, vivo (1/0)]. */
export type WireMob = [string, number, number, number, number, number, 0 | 1];

export interface WorldPlayer {
  id: string;
  cls: string;
  x: number;
  z: number;
}

export interface MobStrike {
  playerId: string;
  mobId: string;
  damage: number;
}

export interface Kill {
  mobId: string;
  templateId: string;
  /** Quiénes le pegaron: cada uno cobra la XP y el avance de misión. */
  credit: string[];
}

export type HitResult = { ok: false } | { ok: true; dmg: number; hp: number; kill: Kill | null; drop: LootDrop | null };

const r2 = (n: number): number => Math.round(n * 100) / 100;
const MAX_WEAPON_BONUS = 30;
const MAX_LEVEL_SCALE = 1 + RULES.progression.damagePerLevel * (RULES.progression.maxLevel - 1);

const toWire = (m: MobState): WireMob => [m.id, r2(m.x), r2(m.z), r2(m.facing), Math.round(m.hp), r2(m.windup), m.alive ? 1 : 0];

export class MobWorld {
  readonly mobs: MobState[] = [];
  readonly drops: LootDrop[] = [];
  private readonly byId = new Map<string, MobState>();
  private readonly credit = new Map<string, Set<string>>();
  private readonly sent = new Map<string, string>();
  private dropSeq = 0;
  /** Cubo de golpes por jugador: una habilidad en área puede pegarle a varios mobs en el mismo instante. */
  private readonly bucket = new Map<string, { n: number; at: number }>();

  constructor() {
    for (const s of HODL_HOLLOW.spawns) {
      if (s.type !== 'mob') continue;
      const tpl = MOB_TEMPLATES[s.template];
      const [x, , z] = s.position;
      const m: MobState = {
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
      };
      this.mobs.push(m);
      this.byId.set(m.id, m);
    }
  }

  /** Foto completa, para quien recién entra. */
  snapshot(): WireMob[] {
    return this.mobs.map(toWire);
  }

  /** Avanza el mundo `dt` segundos. Devuelve a quién muerde cada mob y qué mobs cambiaron desde el último envío. */
  tick(dt: number, players: WorldPlayer[]): { strikes: MobStrike[]; changed: WireMob[]; gone: string[] } {
    const strikes: MobStrike[] = [];
    const geo = HODL_HOLLOW.geometry;
    // Quiénes están fuera de la zona segura: a los de adentro los mobs no los persiguen.
    const exposed = players.filter((p) => !(regionAt(geo, p.x, p.z)?.safe ?? false));

    for (const m of this.mobs) {
      const tpl = MOB_TEMPLATES[m.templateId];
      if (!m.alive) {
        m.respawnLeft -= dt;
        if (m.respawnLeft <= 0) {
          m.alive = true;
          m.hp = tpl.maxHp;
          m.x = m.homeX;
          m.z = m.homeZ;
          m.attackCd = 0;
          m.windup = 0;
          this.credit.delete(m.id);
        }
        continue;
      }
      let target: WorldPlayer | null = null;
      let best = Infinity;
      for (const p of exposed) {
        const d = (p.x - m.x) ** 2 + (p.z - m.z) ** 2;
        if (d < best) {
          best = d;
          target = p;
        }
      }
      const dmg = stepMob(m, tpl, {
        player: target ?? { x: m.homeX, z: m.homeZ },
        playerAlive: !!target,
        playerInSafe: false,
        geo,
        dt,
      });
      if (dmg > 0 && target) strikes.push({ playerId: target.id, mobId: m.id, damage: dmg });
    }

    // Botín vencido.
    const gone: string[] = [];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      this.drops[i].ttl -= dt;
      if (this.drops[i].ttl <= 0) gone.push(this.drops.splice(i, 1)[0].id);
    }

    const changed: WireMob[] = [];
    for (const m of this.mobs) {
      const w = toWire(m);
      const key = w.join(',');
      if (this.sent.get(m.id) === key) continue;
      this.sent.set(m.id, key);
      changed.push(w);
    }
    return { strikes, changed, gone };
  }

  /** Un jugador dice que le pegó a un mob. Se comprueba lo que se puede: distancia, tope de daño y ritmo. */
  hit(p: WorldPlayer, mobId: string, amount: number, now: number): HitResult {
    const m = this.byId.get(mobId);
    const cls = CLASSES[p.cls];
    if (!m?.alive || !cls || !Number.isFinite(amount) || amount < 1) return { ok: false };

    // Ritmo: 6 golpes por segundo con ráfaga de 12 (una habilidad en área toca a varios a la vez).
    const b = this.bucket.get(p.id) ?? { n: 12, at: now };
    b.n = Math.min(12, b.n + ((now - b.at) / 1000) * 6);
    b.at = now;
    if (b.n < 1) return { ok: false };
    b.n -= 1;
    this.bucket.set(p.id, b);

    const reach = Math.max(cls.attack.range, cls.skill.range) * 1.3 + 3;
    if (Math.hypot(m.x - p.x, m.z - p.z) > reach) return { ok: false };
    const cap = Math.ceil((Math.max(cls.attack.damage, cls.skill.damage) + MAX_WEAPON_BONUS) * MAX_LEVEL_SCALE) + 1;
    const dmg = Math.min(Math.round(amount), cap);

    let who = this.credit.get(m.id);
    if (!who) this.credit.set(m.id, (who = new Set()));
    who.add(p.id);

    m.hp = Math.max(0, m.hp - dmg);
    if (m.hp > 0) return { ok: true, dmg, hp: m.hp, kill: null, drop: null };

    m.alive = false;
    m.windup = 0;
    m.respawnLeft = m.respawnTime;
    const kill: Kill = { mobId: m.id, templateId: m.templateId, credit: [...who] };
    this.credit.delete(m.id);
    return { ok: true, dmg, hp: 0, kill, drop: this.rollLoot(m) };
  }

  /** Quien llega primero se queda con la bolsa. */
  pickup(p: WorldPlayer, dropId: string): LootDrop | null {
    const i = this.drops.findIndex((d) => d.id === dropId);
    if (i < 0) return null;
    const d = this.drops[i];
    if (Math.hypot(d.x - p.x, d.z - p.z) > PICKUP_RADIUS + 2.5) return null;
    this.drops.splice(i, 1);
    return d;
  }

  forget(playerId: string): void {
    this.bucket.delete(playerId);
    for (const who of this.credit.values()) who.delete(playerId);
  }

  private rollLoot(m: MobState): LootDrop {
    const tpl = MOB_TEMPLATES[m.templateId];
    const coins = tpl.coins[0] + Math.floor(Math.random() * (tpl.coins[1] - tpl.coins[0] + 1));
    const items: string[] = [];
    for (const d of tpl.drops ?? []) if (Math.random() < d.chance) items.push(d.item);
    // Las fichas MMRIA solo las tira el servidor: los jefes siempre, el resto por suerte según su nivel.
    let tokens = 0;
    if (BOSS_IDS.has(m.templateId)) tokens = TOKEN.bossDrop[0] + Math.floor(Math.random() * (TOKEN.bossDrop[1] - TOKEN.bossDrop[0] + 1));
    else if (Math.random() < TOKEN.chance(tpl.level)) tokens = TOKEN.amount(tpl.level);
    const a = Math.random() * Math.PI * 2;
    const drop: LootDrop = { id: `d${++this.dropSeq}`, x: r2(m.x + Math.cos(a) * 0.7), z: r2(m.z + Math.sin(a) * 0.7), coins, items, ttl: DROP_LIFE, ...(tokens > 0 ? { tokens } : {}) };
    this.drops.push(drop);
    return drop;
  }
}
