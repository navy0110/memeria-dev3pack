import * as THREE from 'three';
import type { GameState } from '../shared/game';
import type { MobState, NpcState, PlayerClass } from '../shared/types';
import { buildMascot, type Mascot } from './mascots';
import { buildMob, type MobModel } from './mobmodels';
import { buildNpc, type NpcModel } from './npcmodels';

type EntitySceneState = Pick<GameState, 'npcs' | 'templates' | 'equipment' | 'itemDefs' | 'time' | 'inSafeZone'> & {
  player: Pick<GameState['player'], 'id' | 'x' | 'z' | 'facing'>;
  mobs: Pick<MobState, 'id' | 'templateId' | 'x' | 'z' | 'facing' | 'alive' | 'hp' | 'windup'>[];
};

const FLASH_TIME = 0.15;
const DRAW_DIST = 80;
// Golpe del jugador: preparación (windup, la fija la clase), golpe rápido y recuperación.
// El golpe conecta justo cuando termina la preparación (el sim emite 'strike' en ese instante).
const STRIKE_TIME = 0.12;
const RECOVER_TIME = 0.28;
const WIND_ARM = -3.0;
const LUNGE = 0.5;
const IDLE_ARM = -0.8;
const WALK_FREQ = 10;
const WALK_AMP = 0.75;
const HIT_COLOR = new THREE.Color(0xff3030);

interface Visual {
  root: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  baseEmissive: THREE.Color[];
  flash: number;
}

interface NpcVisual extends Visual {
  model: NpcModel;
  ref: NpcState;
  facing: number;
}

interface MobVisual extends Visual {
  bar: THREE.Mesh;
  ref: EntitySceneState['mobs'][number];
  height: number;
  winding: boolean;
  lunge: number;
  model: MobModel;
  prevX: number;
  prevZ: number;
  phase: number;
}

// Vistas de las entidades. Se crean una sola vez; sync() solo mueve, rota y
// muestra u oculta. No se crea ningún objeto nuevo por frame.
export class Entities {
  readonly player: Visual;
  private readonly mascot: Mascot;
  private weaponDrawn = true;
  private weaponId: string | undefined;
  private drawTimer = 0;
  private armReady = 1;
  private swingT = -1;
  private swingWind = 0.3;
  private caster: boolean;
  private walkPhase = 0;
  /** Rumbo que se dibuja: persigue a `facing` en vez de saltar de golpe al girar rápido. */
  private yaw = 0;
  private prevX: number;
  private prevZ: number;
  private readonly npcs = new Map<string, NpcVisual>();
  private readonly mobs = new Map<string, MobVisual>();
  private readonly anchors = new Map<string, THREE.Object3D>();

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    game: EntitySceneState,
    cls: PlayerClass,
    skin = 0,
  ) {
    // Jugador: la mascota elegida, armada con cajas.
    this.mascot = buildMascot(cls.id, skin);
    this.caster = cls.ranged ?? false;
    const playerRoot = this.mascot.root;
    this.mascot.armR.rotation.x = IDLE_ARM;
    this.mascot.weapon.rotation.x = this.mascot.holdRot;
    playerRoot.position.set(game.player.x, 0, game.player.z);
    this.prevX = game.player.x;
    this.prevZ = game.player.z;
    this.yaw = game.player.facing;
    scene.add(playerRoot);

    this.player = visual(playerRoot, this.mascot.mats);
    this.anchors.set(game.player.id, playerRoot);

    for (const npc of game.npcs) {
      const model = buildNpc(npc.look);
      const { root, mats } = model;
      root.position.set(npc.x, 0, npc.z);
      scene.add(root);
      const v: NpcVisual = { ...visual(root, mats), model, ref: npc, facing: 0 };
      this.npcs.set(npc.id, v);
      this.anchors.set(npc.id, v.root);
    }

    for (const m of game.mobs) {
      const tpl = game.templates[m.templateId];
      const model = buildMob(tpl.look, tpl.color);
      const { root, mats } = model;
      root.scale.setScalar(tpl.scale ?? 1);
      root.position.set(m.x, 0, m.z);
      scene.add(root);
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x4ade80, depthTest: false, transparent: true }),
      );
      bar.renderOrder = 1;
      scene.add(bar);
      this.mobs.set(m.id, { ...visual(root, mats), bar, ref: m, height: model.height * (tpl.scale ?? 1), winding: false, lunge: 0, model, prevX: m.x, prevZ: m.z, phase: Math.random() * 6 });
      this.anchors.set(m.id, root);
    }
  }

  /** Objeto donde anclar etiquetas y textos flotantes de una entidad. */
  anchorOf(id: string): THREE.Object3D | undefined {
    return this.anchors.get(id);
  }

  /** Altura del modelo de un mob (para ubicar etiquetas). */
  heightOf(id: string): number {
    const mob = this.mobs.get(id);
    if (mob) return mob.height;
    return this.npcs.get(id)?.model.height ?? 2;
  }

  /** Flash rojo de golpe sobre la entidad. */
  flashHit(id: string): void {
    if (id === 'player') {
      this.player.flash = FLASH_TIME;
      return;
    }
    const v = this.mobs.get(id) ?? this.npcs.get(id);
    if (v) v.flash = FLASH_TIME;
  }

  /** Arranca la animación de golpe o conjuro; conecta tras `windup` segundos. */
  startSwing(windup: number): void {
    this.swingT = 0;
    this.swingWind = windup;
  }

  /** Caminar de las patas del oso y flotar del fantasma, según lo que se movió. */
  private animateMob(v: MobVisual, x: number, z: number, dt: number): void {
    const speed = dt > 0 ? Math.hypot(x - v.prevX, z - v.prevZ) / dt : 0;
    v.prevX = x;
    v.prevZ = z;
    const moving = speed > 0.3;
    v.phase += dt * (moving ? 3 + speed * 2.2 : 1.6);
    const { legs, bob, sway } = v.model;
    if (legs.length > 0) {
      const k = moving ? 0.7 : 0;
      legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(v.phase + (i === 1 || i === 2 ? Math.PI : 0)) * k;
      });
      bob.position.y = moving ? Math.abs(Math.sin(v.phase)) * 0.06 : Math.sin(v.phase) * 0.015;
    } else {
      bob.position.y = 0.35 + Math.sin(v.phase) * 0.14;
      sway.forEach((s, i) => {
        s.rotation.z = Math.sin(v.phase * 0.9 + i) * 0.05;
      });
    }
  }

  /** En la ciudad el arma va a la espalda; se saca al salir o al atacar. */
  private updateWeapon(safe: boolean, swinging: boolean, dt: number): void {
    if (swinging) this.drawTimer = 1.2;
    else this.drawTimer = Math.max(0, this.drawTimer - dt);
    const draw = !safe || this.drawTimer > 0;
    if (draw !== this.weaponDrawn) {
      this.weaponDrawn = draw;
      const m = this.mascot;
      if (draw) {
        m.armR.add(m.weapon);
        m.weapon.position.set(0, -0.75, 0.05);
        m.weapon.rotation.set(m.holdRot, 0, 0);
        m.weapon.scale.setScalar(1);
      } else {
        // `stow` está pensado para el origen en el hombro: se corre medio brazo por el pivote de la mano.
        m.upper.add(m.weapon);
        m.weapon.rotation.set(0, 0, m.stow.rotZ);
        m.weapon.scale.setScalar(m.stow.scale);
        m.weapon.position.set(m.stow.x, m.stow.y, m.stow.z).add(new THREE.Vector3(0, -0.75, 0.05).applyEuler(m.weapon.rotation).multiplyScalar(m.stow.scale));
      }
    }
    // Con el arma guardada el brazo cuelga relajado.
    const target = draw ? 1 : 0;
    this.armReady += Math.sign(target - this.armReady) * Math.min(Math.abs(target - this.armReady), dt * 5);
  }

  sync(game: EntitySceneState, dt: number): void {
    const p = game.player;
    let lunge = 0;
    const swinging = this.swingT >= 0;
    this.updateWeapon(game.inSafeZone, swinging, dt);
    // El arma equipada se ve en la mano; sus efectos se animan con el reloj del juego.
    if (game.equipment.weapon !== this.weaponId) {
      this.weaponId = game.equipment.weapon;
      this.mascot.setWeapon(this.weaponId ? (game.itemDefs[this.weaponId]?.look ?? null) : null);
    }
    this.mascot.tick(game.time);
    const idleArm = 0.05 + (IDLE_ARM - 0.05) * this.armReady;
    if (swinging && !this.caster) {
      const su = (this.swingT - this.swingWind) / STRIKE_TIME;
      if (su > 0 && su < 1.8) lunge = Math.sin(Math.min(1, su / 1.8) * Math.PI) * LUNGE;
    }
    this.player.root.position.set(p.x + Math.sin(p.facing) * lunge, 0, p.z + Math.cos(p.facing) * lunge);
    // Giro suave por el camino corto; durante un golpe alcanza enseguida la mira del sim, así el arma apunta donde sale el golpe.
    const dYaw = Math.atan2(Math.sin(p.facing - this.yaw), Math.cos(p.facing - this.yaw));
    this.yaw += dYaw * Math.min(1, dt * (swinging ? 45 : 22));
    this.player.root.rotation.y = this.yaw;

    // Caminar: las piernas y el brazo libre se balancean con la distancia recorrida.
    const moved = Math.hypot(p.x - this.prevX, p.z - this.prevZ);
    this.prevX = p.x;
    this.prevZ = p.z;
    const moving = dt > 0 && moved / dt > 0.5;
    if (moving) this.walkPhase += dt * WALK_FREQ;
    const k = moving ? WALK_AMP : 0;
    const m = this.mascot;
    m.legL.rotation.x = Math.sin(this.walkPhase) * k;
    m.legR.rotation.x = -Math.sin(this.walkPhase) * k;
    m.armL.rotation.x = -Math.sin(this.walkPhase) * k;
    m.upper.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : 0;

    if (swinging) {
      this.swingT += dt;
      const t = this.swingT;
      const w = this.swingWind;
      const endT = w + STRIKE_TIME + RECOVER_TIME;
      let arm: number;
      let lean: number;
      if (t < w) {
        // preparación: el arma sube y el cuerpo se echa hacia atrás
        const u = 1 - Math.pow(1 - t / w, 2);
        arm = idleArm + (WIND_ARM - idleArm) * u;
        lean = -0.28 * u;
      } else if (t < w + STRIKE_TIME) {
        const u = (t - w) / STRIKE_TIME;
        arm = WIND_ARM + (m.strikeArm - WIND_ARM) * u;
        lean = -0.28 + 0.6 * u;
      } else if (t < endT) {
        const u = (t - w - STRIKE_TIME) / RECOVER_TIME;
        arm = m.strikeArm + (idleArm - m.strikeArm) * u;
        lean = 0.32 * (1 - u);
      } else {
        this.swingT = -1;
        arm = idleArm;
        lean = 0;
      }
      m.armR.rotation.x = arm;
      m.upper.rotation.x = lean;
    } else {
      m.armR.rotation.x = moving ? idleArm + Math.sin(this.walkPhase) * k * 0.4 : idleArm;
      m.upper.rotation.x = 0;
    }
    tickFlash(this.player, dt);

    for (const m of game.mobs) {
      const v = this.mobs.get(m.id);
      if (!v) continue;
      // Lejos de la cámara ni se dibujan: con el mapa grande son ~30 modelos de decenas de piezas.
      const near = m.alive && Math.hypot(m.x - p.x, m.z - p.z) < DRAW_DIST;
      v.root.visible = near;
      v.bar.visible = near;
      if (!near) continue;
      const tpl = game.templates[m.templateId];
      const maxHp = tpl.maxHp;
      const ratio = m.hp / maxHp;
      // Aviso del golpe: se agranda y echa atrás; al pegar, se lanza hacia adelante.
      let lunge = 0;
      let tilt = 0;
      let grow = 1;
      if (m.windup > 0) {
        const u = 1 - m.windup / tpl.windup;
        tilt = -0.45 * u;
        grow = 1 + 0.22 * u;
        v.lunge = 0;
        v.winding = true;
      } else if (v.winding) {
        v.winding = false;
        v.lunge = 0.0001;
      }
      if (v.lunge > 0) {
        v.lunge += dt;
        if (v.lunge >= 0.2) v.lunge = 0;
        else lunge = Math.sin((v.lunge / 0.2) * Math.PI) * 0.7;
      }
      v.root.position.set(m.x + Math.sin(m.facing) * lunge, 0, m.z + Math.cos(m.facing) * lunge);
      v.root.rotation.order = 'YXZ';
      v.root.rotation.set(tilt, m.facing, 0);
      v.root.scale.setScalar((tpl.scale ?? 1) * grow);
      this.animateMob(v, m.x, m.z, dt);
      v.bar.position.set(m.x - (1 - ratio) / 2, v.height + 0.25, m.z);
      v.bar.scale.x = ratio;
      v.bar.quaternion.copy(this.camera.quaternion);
      tickFlash(v, dt);
    }

    for (const v of this.npcs.values()) {
      // En reposo y, si el jugador está cerca, se dan vuelta a mirarlo.
      v.model.idle(game.time);
      const dx = p.x - v.ref.x;
      const dz = p.z - v.ref.z;
      if (dx * dx + dz * dz < 36) {
        let d = Math.atan2(dx, dz) - v.facing;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        v.facing += d * Math.min(1, dt * 6);
        v.root.rotation.y = v.facing;
      }
      tickFlash(v, dt);
    }
  }
}

function visual(root: THREE.Group, mats: THREE.MeshStandardMaterial[]): Visual {
  return {
    root,
    mats,
    baseEmissive: mats.map((m) => m.emissive.clone()),
    flash: 0,
  };
}

function tickFlash(v: Visual, dt: number): void {
  if (v.flash <= 0) return;
  v.flash = Math.max(0, v.flash - dt);
  const k = (v.flash / FLASH_TIME) * 0.8;
  for (let i = 0; i < v.mats.length; i++) {
    v.mats[i].emissive.copy(v.baseEmissive[i]).lerp(HIT_COLOR, k);
  }
}
