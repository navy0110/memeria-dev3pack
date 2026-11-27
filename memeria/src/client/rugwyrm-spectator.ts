import * as THREE from 'three';
import { CLASSES } from '../data/classes';
import { ITEMS } from '../data/items';
import { MOB_TEMPLATES } from '../data/mobs';
import type { createRun } from '../server/rugwyrm-arena';
import { Entities } from './entities';
import { addGround, addTrees } from './scenery';

type Snapshot = ReturnType<ReturnType<typeof createRun>['state']>;

export function createSpectator(canvas: HTMLCanvasElement, first: Snapshot) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x52665b);
  scene.fog = new THREE.Fog(0x52665b, 24, 65);
  scene.add(new THREE.HemisphereLight(0xe5efcf, 0x374938, 2.1));
  const light = new THREE.DirectionalLight(0xffe3b4, 2.1);
  light.position.set(-9, 18, 12);
  scene.add(light);

  const bounds = first.zone;
  addGround(scene, {
    bounds,
    colliders: [],
    regions: [{ id: 'arena-marsh', name: 'Rug Pull Marsh', ground: 'swamp', safe: false, bounds }],
  });
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  addTrees(scene, Array.from({ length: 14 }, (_, i) => ({
    x: centerX + Math.cos(i * Math.PI / 7) * (19 + i % 3),
    z: centerZ + Math.sin(i * Math.PI / 7) * (19 + i % 3),
  })));

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 90);
  const player = { id: 'player', ...first.player };
  const boss = { id: 'boss-rugwyrm', templateId: 'rugwyrm', alive: first.boss.hp > 0, ...first.boss };
  const display = {
    player, mobs: [boss], npcs: [], equipment: { weapon: 'hunting-bow' },
    itemDefs: ITEMS, inSafeZone: false, time: 0,
    templates: { rugwyrm: { ...MOB_TEMPLATES.rugwyrm, maxHp: first.boss.maxHp } },
  };
  const entities = new Entities(scene, camera, display, CLASSES.wif);
  const warning = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xff7555, side: THREE.DoubleSide, transparent: true }),
  );
  warning.rotation.x = -Math.PI / 2;
  scene.add(warning);

  let target = first;
  let frame: number;
  let previous = performance.now();
  const focus = new THREE.Vector3();
  function draw(now: number) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    display.time += dt;
    const blend = 1 - Math.exp(-dt * 9);
    for (const [unit, next] of [[player, target.player], [boss, target.boss]] as const) {
      unit.x += (next.x - unit.x) * blend;
      unit.z += (next.z - unit.z) * blend;
      unit.facing = next.facing;
      unit.hp = next.hp;
    }
    boss.alive = target.boss.hp > 0;
    boss.windup = target.boss.windup;
    warning.visible = boss.alive && boss.windup > 0 && target.status === 'active';
    warning.position.set(boss.x, 0.045, boss.z);
    warning.scale.setScalar(target.boss.dangerRange);
    warning.material.opacity = 0.65 + 0.3 * Math.sin(display.time * 12);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    if (camera.aspect !== width / height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    focus.set((player.x + boss.x) / 2, 2.6, (player.z + boss.z) / 2);
    camera.position.copy(focus).add(new THREE.Vector3(14, 11, 16));
    camera.lookAt(focus);
    entities.sync(display, dt);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  return {
    update(next: Snapshot) {
      if (next.turn !== target.turn) {
        if (next.effects.swing) entities.startSwing(next.effects.swing);
        if (next.effects.playerHit) entities.flashHit(player.id);
        if (next.effects.bossHit) entities.flashHit(boss.id);
      }
      target = next;
    },
    dispose() {
      cancelAnimationFrame(frame);
      renderer.dispose();
    },
  };
}
