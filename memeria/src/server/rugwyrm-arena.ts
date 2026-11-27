import { CLASSES } from '../data/classes';
import { MOB_TEMPLATES } from '../data/mobs';
import { HODL_HOLLOW } from '../data/zones/hodl-hollow';
import { GameState } from '../shared/game';
import type { ZoneDef } from '../shared/types';

const original = MOB_TEMPLATES.rugwyrm;
const bossTemplate = { ...original, maxHp: 160, drops: [] };
const playerClass = CLASSES.wif;
const timeLimit = 90;
const tick = 0.05;

export const actions = {
  strike: 'Shoot an arrow. Range 6.5.',
  skill: 'Cast Hat Trick. Range 6, costs 25 MP.',
  approach: 'Move toward Rugwyrm for up to half a second, stopping at bow range.',
  retreat: 'Move away from Rugwyrm for half a second.',
  wait: 'Let half a second pass.',
};

type Action = keyof typeof actions;
type Status = 'active' | 'won' | 'lost';

const spawn = HODL_HOLLOW.spawns.find(s => s.type === 'mob' && s.template === 'rugwyrm');
if (!spawn || spawn.type !== 'mob') throw new Error('Missing Rugwyrm spawn');
const [x, , z] = spawn.position;
const zone: ZoneDef = {
  id: 'rugwyrm-arena',
  name: 'Rug Pull Marsh',
  playerStart: [x, 0, z + 7],
  geometry: {
    bounds: { minX: x - 18, maxX: x + 18, minZ: z - 18, maxZ: z + 18 },
    colliders: [],
    regions: [],
  },
  spawns: [spawn],
};

export function createRun() {
  const game = new GameState(zone, { rugwyrm: bossTemplate }, {}, playerClass);
  const boss = game.mobs[0];
  const player = game.player;
  let status: Status = 'active';
  let turn = 1;
  let defeated = false;
  let events: string[] = [];
  let effects: { swing?: number; playerHit?: boolean; bossHit?: boolean } = {};

  function availableActions(): Action[] {
    if (status !== 'active') return [];
    const allowed: Action[] = ['approach', 'retreat', 'wait'];
    if (!player.swing && player.attackCd <= tick) allowed.push('strike');
    if (!player.swing && player.skillCd <= tick && player.mp >= playerClass.skill.cost) allowed.push('skill');
    return allowed;
  }

  return {
    state() {
      return {
        turn, status, events, effects, zone: zone.geometry.bounds,
        elapsed: Number(game.time.toFixed(2)),
        distance: Math.hypot(player.x - boss.x, player.z - boss.z),
        player: { name: playerClass.name, x: player.x, z: player.z, facing: player.facing,
          hp: defeated ? 0 : player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp },
        boss: { name: bossTemplate.name, x: boss.x, z: boss.z, facing: boss.facing,
          hp: Math.max(0, boss.hp), maxHp: bossTemplate.maxHp, windup: boss.windup,
          dangerRange: bossTemplate.attackRange * 1.35 },
        availableActions: availableActions(),
      };
    },
    play(action: Action) {
      events = [];
      effects = {};
      for (let i = 0; i < 10 && status === 'active'; i++) {
        const dx = boss.x - player.x;
        const dz = boss.z - player.z;
        const distance = Math.hypot(dx, dz);
        const direction = action === 'approach' && distance > 5.8 ? 1 : action === 'retreat' ? -1 : 0;
        const moveX = distance > 0 ? direction * dx / distance : direction;
        const moveZ = distance > 0 ? direction * dz / distance : 0;
        game.step({ seq: turn * 10 + i, moveX, moveZ, attack: i === 0 && action === 'strike',
          skill: i === 0 && action === 'skill', interact: false, mend: false }, tick);
        for (const event of game.events) {
          if (event.type === 'damage') {
            if (event.targetId === player.id) effects.playerHit = true;
            else if (event.targetId === boss.id) effects.bossHit = true;
            events.push(event.targetId === player.id ? `Rugwyrm hits for ${event.amount}.` : `Rugwyrm takes ${event.amount} damage.`);
          }
          if (event.type === 'swing' && event.sourceId === player.id) effects.swing = event.windup;
          if (event.type === 'mobWindup') events.push('Rugwyrm prepares a heavy attack.');
          if (event.type === 'playerDeath') defeated = true;
        }
        if (defeated) status = 'lost';
        else if (!boss.alive) status = 'won';
        else if (game.time >= timeLimit - tick / 2) status = 'lost';
      }
      turn++;
    },
  };
}
