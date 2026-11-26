import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const actions = {
  strike: 'Deal 3 damage.',
  dodge: 'Avoid damage and regain one charge, up to two.',
  pulse: 'Spend one charge to deal 6 damage.'
};
const rounds = new Map();
const page = readFileSync(new URL('./arena.html', import.meta.url));
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:' + port;
const ttl = 60 * 60 * 1000;

function state(run) {
  return {
    roundId: run.roundId,
    turn: run.turn,
    status: run.status,
    playerHealth: run.playerHealth,
    bossHealth: run.bossHealth,
    charges: run.charges,
    nextAttack: run.status === 'active' ? (run.turn % 3 === 0 ? 7 : 2) : null,
    availableActions: run.status !== 'active' ? [] : Object.keys(actions)
      .filter(action => action !== 'pulse' || run.charges > 0)
  };
}

function play(run, action) {
  const damage = state(run).nextAttack;
  if (action === 'dodge') run.charges = Math.min(2, run.charges + 1);
  if (action === 'strike') run.bossHealth = Math.max(0, run.bossHealth - 3);
  if (action === 'pulse') {
    run.bossHealth = Math.max(0, run.bossHealth - 6);
    run.charges -= 1;
  }
  if (run.bossHealth === 0) run.status = 'won';
  if (run.status === 'active' && action !== 'dodge') {
    run.playerHealth = Math.max(0, run.playerHealth - damage);
  }
  if (run.playerHealth === 0 || (run.turn === 18 && run.status === 'active')) {
    run.status = 'lost';
  }
  run.turn += 1;
}

const spec = {
  name: 'Lantern Arena',
  api: {
    baseUrl: origin,
    start: { method: 'POST', path: '/api/runs', save: { roundId: 'roundId', apiKey: 'apiKey' } },
    auth: { header: 'Authorization', value: 'Bearer {{apiKey}}' },
    state: { method: 'GET', path: '/api/runs/{{roundId}}' },
    actions: Object.entries(actions).map(([name, description]) => ({
      name, description, method: 'POST', path: '/api/runs/{{roundId}}/' + name,
      body: { turn: '{{turn}}' },
      params: { turn: { type: 'string', required: true, description: 'Copy turn from the current state.' } }
    })),
    finish: { path: 'status', equals: ['won', 'lost'] },
    result: { win: { path: 'status', equals: ['won'] } },
    watchUrl: origin + '/watch/{{roundId}}'
  }
};

function reply(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (req.method === 'GET' && (path === '/' || /^\/watch\/[\da-f-]+$/.test(path))) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "frame-ancestors 'self' https://app.bytearena.fun"
    });
    return res.end(page);
  }
  if (req.method === 'GET' && path === '/api/game-spec') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('# Lantern Arena\nDefeat the Glass Sentinel before turn 18 ends. Dodge heavy attacks, then spend charges on pulses. Runs expire after one hour and reset if the server restarts.\n\n```json\n' + JSON.stringify(spec, null, 2) + '\n```\n');
  }
  if (req.method === 'POST' && path === '/api/runs') {
    const now = Date.now();
    for (const [id, run] of rounds) {
      if (now >= run.expiresAt) rounds.delete(id);
    }
    if (rounds.size >= 1000) return reply(res, 503, { error: 'Arena full. Try again later.' });
    const run = { roundId: randomUUID(), apiKey: randomUUID(), expiresAt: now + ttl,
      playerHealth: 16, bossHealth: 22, charges: 1, turn: 1, status: 'active' };
    rounds.set(run.roundId, run);
    return reply(res, 201, { ...state(run), apiKey: run.apiKey });
  }
  const match = /^\/api\/runs\/([\da-f-]+)(?:\/(strike|dodge|pulse))?$/.exec(path);
  const run = match && rounds.get(match[1]);
  if (!run || run.expiresAt <= Date.now()) return reply(res, 404, { error: 'Run not found or expired.' });
  const action = match[2];
  if (req.method === 'GET' && !action) return reply(res, 200, state(run));
  if (req.method !== 'POST' || !action) return reply(res, 405, { error: 'Method not allowed.' });
  if (req.headers.authorization !== 'Bearer ' + run.apiKey) return reply(res, 403, { error: 'Invalid run credential.' });
  let body = '';
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      body += chunk;
      if (body.length > 2048) return reply(res, 413, { error: 'Payload too large.' });
    }
    const turn = JSON.parse(body)?.turn;
    if (turn !== run.turn && turn !== String(run.turn)) {
      return reply(res, 409, { ...state(run), error: 'Turn changed. Read state before retrying.' });
    }
  } catch {
    return reply(res, 400, { error: 'Send a JSON object containing the current turn.' });
  }
  if (!state(run).availableActions.includes(action)) {
    return reply(res, 409, { ...state(run), error: 'Action unavailable.' });
  }
  play(run, action);
  reply(res, 200, state(run));
}).listen(port, () => console.log('Lantern Arena: ' + origin));
