// Botín en el suelo: una bolsita que flota con una columna de luz tenue y un rótulo con lo que trae.
// Se crea con el evento `drop` y se saca con `dropGone` (recogido o vencido). El juego decide todo;
// esto solo lo dibuja.
import * as THREE from 'three';
import type { LootDrop } from '../shared/types';
import type { Labels, NameLabel } from './labels';

const SACK = new THREE.SphereGeometry(0.28, 10, 8);
const NECK = new THREE.CylinderGeometry(0.07, 0.12, 0.16, 8);
const KNOT = new THREE.TorusGeometry(0.09, 0.025, 6, 10);
const BEAM = new THREE.CylinderGeometry(0.16, 0.34, 2.6, 10, 1, true);
const RING = new THREE.RingGeometry(0.42, 0.55, 24);
const SACK_MAT = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1, flatShading: true });
const KNOT_MAT = new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.6, flatShading: true });

interface View {
  root: THREE.Group;
  bag: THREE.Group;
  beam: THREE.MeshBasicMaterial;
  ring: THREE.MeshBasicMaterial;
  label: NameLabel;
  phase: number;
}

export class LootView {
  private readonly views = new Map<string, View>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly labels: Labels,
    private readonly nameOf: (itemId: string) => string,
  ) {}

  add(d: LootDrop): void {
    if (this.views.has(d.id)) return;
    // Dorado si solo hay monedas; celeste si trae algún ítem, para distinguirlo de lejos.
    const color = d.tokens ? 0xffe680 : d.items.length ? 0x7fe0ff : 0xffd35a;
    const root = new THREE.Group();
    root.position.set(d.x, 0, d.z);

    const bag = new THREE.Group();
    const body = new THREE.Mesh(SACK, SACK_MAT);
    body.scale.set(1, 0.85, 1);
    const neck = new THREE.Mesh(NECK, SACK_MAT);
    neck.position.y = 0.26;
    const knot = new THREE.Mesh(KNOT, KNOT_MAT);
    knot.position.y = 0.2;
    knot.rotation.x = Math.PI / 2;
    bag.add(body, neck, knot);
    root.add(bag);

    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(BEAM, beamMat);
    beam.position.y = 1.3;
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(RING, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    root.add(beam, ring);
    this.scene.add(root);

    const parts = [...(d.tokens ? [`${d.tokens} MMRIA`] : []), ...(d.coins ? [`${d.coins} coins`] : []), ...d.items.map(this.nameOf)];
    const label = this.labels.addName(root, parts.join(' · '), 0.9, `name loot${d.items.length ? ' item' : ''}${d.tokens ? ' token' : ''}`);
    this.views.set(d.id, { root, bag, beam: beamMat, ring: ringMat, label, phase: Math.random() * 6 });
  }

  remove(id: string): void {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.remove(v.root);
    this.labels.removeName(v.label);
    v.beam.dispose();
    v.ring.dispose();
    this.views.delete(id);
  }

  update(t: number): void {
    for (const v of this.views.values()) {
      v.bag.position.y = 0.3 + Math.sin(t * 2.4 + v.phase) * 0.08;
      v.bag.rotation.y = t * 0.9 + v.phase;
      v.ring.opacity = 0.45 + Math.sin(t * 3 + v.phase) * 0.25;
    }
  }
}
