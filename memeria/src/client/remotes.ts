// Otros jugadores conectados: se dibujan con su mascota y su nombre, y caminan hacia la última
// posición que mandaron. Es solo presencia visual; no tienen colisión ni combate para este cliente.
import * as THREE from 'three';
import { buildMascot, type Mascot } from './mascots';
import type { Labels, NameLabel } from './labels';
import type { Peer } from './net';

const WALK_FREQ = 9;
const ARM_IDLE = -0.8;
const STALE_S = 8;
const SNAP_DIST = 12;

interface Remote {
  mascot: Mascot;
  label: NameLabel;
  cls: string;
  skin: number;
  name: string;
  lvl: number;
  tx: number;
  tz: number;
  tr: number;
  phase: number;
  idle: number;
}

export class Remotes {
  private readonly all = new Map<string, Remote>();
  /** Quiénes están en mi party: el nombre se pinta distinto para encontrarlos de lejos. */
  private partyIds = new Set<string>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly labels: Labels,
  ) {}

  /** El modelo de un jugador remoto, para colgarle una burbuja. */
  anchorOf(id: string): THREE.Object3D | undefined {
    return this.all.get(id)?.mascot.root;
  }

  get count(): number {
    return this.all.size;
  }

  /** Dónde está un jugador remoto ahora (la posición suavizada que se ve en pantalla). */
  positionOf(id: string): { x: number; z: number } | undefined {
    const r = this.all.get(id);
    return r ? { x: r.mascot.root.position.x, z: r.mascot.root.position.z } : undefined;
  }

  /** Los jugadores que se ven ahora, para armar la lista de invitación. */
  list(): Array<{ id: string; name: string; cls: string; lvl: number }> {
    return [...this.all].map(([id, r]) => ({ id, name: r.name, cls: r.cls, lvl: r.lvl }));
  }

  setParty(ids: Iterable<string>): void {
    this.partyIds = new Set(ids);
    for (const [id, r] of this.all) r.label.el.classList.toggle('party', this.partyIds.has(id));
  }

  upsert(p: Peer): void {
    let r = this.all.get(p.id);
    if (r && (r.cls !== p.cls || r.skin !== p.skin)) {
      this.remove(p.id);
      r = undefined;
    }
    if (!r) {
      const mascot = buildMascot(p.cls, p.skin);
      mascot.armR.rotation.x = ARM_IDLE;
      mascot.weapon.rotation.x = mascot.holdRot;
      mascot.root.position.set(p.x, 0, p.z);
      mascot.root.rotation.y = p.r;
      this.scene.add(mascot.root);
      const label = this.labels.addName(mascot.root, p.name, 2.5, 'name ally');
      r = { mascot, label, cls: p.cls, skin: p.skin, name: p.name, lvl: p.lvl ?? 1, tx: p.x, tz: p.z, tr: p.r, phase: 0, idle: 0 };
      this.all.set(p.id, r);
    }
    this.labels.setText(r.label, p.name);
    r.label.el.classList.toggle('party', this.partyIds.has(p.id));
    r.name = p.name;
    r.lvl = p.lvl ?? r.lvl;
    r.tx = p.x;
    r.tz = p.z;
    r.tr = p.r;
    r.idle = 0;
  }

  remove(id: string): void {
    const r = this.all.get(id);
    if (!r) return;
    this.scene.remove(r.mascot.root);
    this.labels.removeName(r.label);
    // Las mascotas usan geometrías y materiales propios: se liberan al irse.
    r.mascot.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    this.all.delete(id);
  }

  clear(): void {
    for (const id of [...this.all.keys()]) this.remove(id);
  }

  update(dt: number, t: number): void {
    for (const [id, r] of this.all) {
      r.idle += dt;
      if (r.idle > STALE_S) {
        this.remove(id);
        continue;
      }
      const m = r.mascot;
      const pos = m.root.position;
      const dx = r.tx - pos.x;
      const dz = r.tz - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SNAP_DIST) pos.set(r.tx, 0, r.tz);
      else {
        const k = 1 - Math.exp(-dt * 10);
        pos.x += dx * k;
        pos.z += dz * k;
      }
      let dr = r.tr - m.root.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      m.root.rotation.y += dr * (1 - Math.exp(-dt * 12));

      const moving = dist > 0.08;
      if (moving) r.phase += dt * WALK_FREQ;
      const swing = moving ? 0.7 : 0;
      m.legL.rotation.x = Math.sin(r.phase) * swing;
      m.legR.rotation.x = -Math.sin(r.phase) * swing;
      m.armL.rotation.x = -Math.sin(r.phase) * swing;
      m.armR.rotation.x = moving ? ARM_IDLE + Math.sin(r.phase) * swing * 0.4 : ARM_IDLE;
      m.upper.position.y = moving ? Math.abs(Math.sin(r.phase)) * 0.08 : 0;
      m.tick(t);
    }
  }
}
