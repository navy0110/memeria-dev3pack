import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3010');
const response = await fetch(new URL('/api/runs', base), { method: 'POST' });
assert.equal(response.status, 201);
const { apiKey, ...initial } = await response.json();
const path = '/api/runs/' + initial.roundId;
console.log('Spectator:', new URL('/watch/' + initial.roundId, base).href);

let state = initial;
while (state.status === 'active') {
  const { boss, distance, availableActions } = state;
  let action = 'wait';
  const escapeTime = Math.max(0, (boss.dangerRange + 0.2 - distance) / 6.2);
  if (boss.windup > 0 && escapeTime > 0 && boss.windup <= 0.55 + escapeTime) {
    action = 'retreat';
  } else if (distance <= 6 && availableActions.includes('skill')) {
    action = 'skill';
  } else if (distance <= 6.5 && availableActions.includes('strike')) {
    action = 'strike';
  } else if (distance > 6.5) {
    action = 'approach';
  }
  const move = await fetch(new URL(path + '/' + action, base), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turn: state.turn }),
  });
  assert.equal(move.status, 200);
  state = await move.json();
  for (const event of state.events) console.log(event);
  if (!process.env.ARENA_FAST) await sleep(750);
}

const publicState = await fetch(new URL(path, base));
assert.deepEqual(await publicState.json(), state);
console.log('Result:', state.status, 'after', state.elapsed, 'simulated seconds.');
assert.equal(state.status, 'won');
