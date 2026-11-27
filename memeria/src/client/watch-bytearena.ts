import * as THREE from 'three';
import { getZone, ITEMS, MOB_TEMPLATES } from '../data';
import { CLASSES } from '../data/classes';
import { isFree } from '../shared/collision';
import type { createRun } from '../server/rugwyrm-arena';
import { FollowCamera } from './camera';
import { Entities } from './entities';
import { createWorldScene } from './scene';
import './watch-bytearena.css';

type Snapshot = ReturnType<ReturnType<typeof createRun>['state']>;

export async function watchByteArena(roundId: string): Promise<void> {
  const panel = document.createElement('section');
  panel.className = 'bytearena-watch';
  panel.innerHTML = `
    <a href="/">← Volver a Memeria</a>
    <h1>Rugwyrm · ByteArena</h1>
    <div id="watch-units" hidden>
      <label>Dogwifhat <progress id="watch-player"></progress></label>
      <label>Rugwyrm <progress id="watch-boss"></progress></label>
    </div>
    <p id="watch-status" role="status">Cargando partida…</p>
    <p id="watch-event"></p>
  `;
  document.body.replaceChildren(panel);
  const status = panel.querySelector<HTMLParagraphElement>('#watch-status')!;
  const eventLabel = panel.querySelector<HTMLParagraphElement>('#watch-event')!;
  const playerHp = panel.querySelector<HTMLProgressElement>('#watch-player')!;
  const bossHp = panel.querySelector<HTMLProgressElement>('#watch-boss')!;

  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(roundId)) {
    status.textContent = 'El enlace no contiene una partida válida.';
    return;
  }
  const path = '/api/runs/' + roundId;
  const readState = async () => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'La partida no existe o expiró.' : 'No se pudo consultar la partida.');
    const data = await response.json() as Snapshot;
    if (!data.player || !data.boss || !data.effects) throw new Error('El servidor no devolvió el estado de la partida.');
    return data;
  };

  let snapshot: Snapshot;
  try {
    snapshot = await readState();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'No se pudo abrir la partida.';
    return;
  }

  const zone = getZone('hodl-hollow');
  const { renderer, scene, camera, follow, atmosphere } = createWorldScene(zone);
  const cam = new FollowCamera(camera, 13);
  const player = { ...snapshot.player, id: 'player' };
  const boss = { ...snapshot.boss, id: 'boss-rugwyrm', templateId: 'rugwyrm', alive: snapshot.boss.hp > 0 };
  const rear = Math.atan2(player.x - boss.x, player.z - boss.z);
  cam.pitch = 0.62;
  cam.yaw = [0, 0.6, -0.6, 1.15, -1.15, 1.7, -1.7, Math.PI]
    .map(offset => rear + offset)
    .find(yaw => [3, 5, 7, 8].every(distance => isFree(
      player.x + Math.sin(yaw) * distance, player.z + Math.cos(yaw) * distance, 1.7, zone.geometry,
    ))) ?? rear - 1.15;
  const display = {
    player, mobs: [boss], npcs: [], itemDefs: ITEMS, equipment: { weapon: 'hunting-bow' },
    templates: { rugwyrm: { ...MOB_TEMPLATES.rugwyrm, maxHp: snapshot.boss.maxHp } },
    inSafeZone: false, time: 0,
  };
  const entities = new Entities(scene, camera, display, CLASSES.wif);
  const warning = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xff453a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  warning.rotation.x = -Math.PI / 2;
  scene.add(warning);
  panel.querySelector<HTMLElement>('#watch-units')!.hidden = false;

  function updateHud() {
    playerHp.max = snapshot.player.maxHp;
    playerHp.value = snapshot.player.hp;
    bossHp.max = snapshot.boss.maxHp;
    bossHp.value = snapshot.boss.hp;
    status.textContent = snapshot.status === 'won' ? 'Victoria. Rugwyrm cayó.'
      : snapshot.status === 'lost' ? 'Derrota.'
        : `Turno ${snapshot.turn} · ${snapshot.elapsed} s`;
    eventLabel.textContent = snapshot.events.join(' ');
  }
  updateHud();

  let stopped = false;
  let pollTimer: number | undefined;
  const poll = async () => {
    try {
      const next = await readState();
      if (stopped) return;
      if (snapshot.turn !== next.turn) {
        if (next.effects.swing) entities.startSwing(next.effects.swing);
        if (next.effects.playerHit) entities.flashHit(player.id);
        if (next.effects.bossHit) entities.flashHit(boss.id);
      }
      snapshot = next;
      updateHud();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'No se pudo actualizar la partida.';
      return;
    }
    if (snapshot.status === 'active') pollTimer = window.setTimeout(poll, 450);
  };
  if (snapshot.status === 'active') pollTimer = window.setTimeout(poll, 450);

  let currentFrame: number;
  let last = performance.now();
  function draw(now: number) {
    currentFrame = requestAnimationFrame(draw);
    if (document.hidden || now - last < 30) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    display.time += dt;
    const blend = 1 - Math.exp(-dt * 9);
    for (const [unit, target] of [[player, snapshot.player], [boss, snapshot.boss]] as const) {
      unit.x += (target.x - unit.x) * blend;
      unit.z += (target.z - unit.z) * blend;
      unit.facing = target.facing;
      unit.hp = target.hp;
    }
    boss.alive = boss.hp > 0;
    boss.windup = snapshot.boss.windup;
    warning.visible = boss.alive && boss.windup > 0 && snapshot.status === 'active';
    warning.position.set(boss.x, 0.06, boss.z);
    warning.scale.setScalar(snapshot.boss.dangerRange);
    const focusX = (player.x + boss.x) / 2;
    const focusZ = (player.z + boss.z) / 2;
    cam.update(focusX, focusZ, dt);
    follow(player.x, player.z);
    atmosphere.update(dt, camera, player.x, player.z);
    entities.sync(display, dt);
    renderer.render(scene, camera);
  }
  currentFrame = requestAnimationFrame(draw);
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(pollTimer);
    cancelAnimationFrame(currentFrame);
    renderer.dispose();
  }, { once: true });
}
