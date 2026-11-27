import { DurableObject } from 'cloudflare:workers';
import { actions, createRun } from './rugwyrm-arena';

interface Env {
  ARENAS: DurableObjectNamespace<RugwyrmRun>;
  ASSETS: Fetcher;
}

type Action = Parameters<ReturnType<typeof createRun>['play']>[0];
type RunRecord = { credential: string; expiresAt: number; actions: Action[] };
const ttl = 60 * 60 * 1000;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function manifest(origin: string) {
  const spec = {
    name: 'Memeria · Rugwyrm Arena',
    api: {
      baseUrl: origin,
      start: { method: 'POST', path: '/api/runs', save: { roundId: 'roundId', apiKey: 'apiKey' } },
      auth: { header: 'Authorization', value: 'Bearer {{apiKey}}' },
      state: { method: 'GET', path: '/api/runs/{{roundId}}' },
      actions: Object.entries(actions).map(([name, description]) => ({
        name, description, method: 'POST', path: '/api/runs/{{roundId}}/' + name,
        body: { turn: '{{turn}}' },
        params: { turn: { type: 'string', required: true, description: 'Copy turn from the current state.' } },
      })),
      finish: { path: 'status', equals: ['won', 'lost'] },
      result: { win: { path: 'status', equals: ['won'] } },
      watchUrl: origin + '/watch/{{roundId}}',
    },
  };
  return new Response(
    '# Memeria · Rugwyrm Arena\nDefeat Rugwyrm in 90 simulated seconds. Each action advances half a second. Retreat out of the danger ring before the heavy attack lands.\n\n```json\n'
      + JSON.stringify(spec, null, 2) + '\n```\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}

export class RugwyrmRun extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const [, , , roundId, action] = new URL(request.url).pathname.split('/');
    if (request.method === 'POST' && !action) {
      const record: RunRecord = { credential: crypto.randomUUID(), expiresAt: Date.now() + ttl, actions: [] };
      await this.ctx.storage.put('run', record);
      await this.ctx.storage.setAlarm(record.expiresAt);
      return json({ roundId, ...createRun().state(), apiKey: record.credential }, 201);
    }

    let turn: unknown;
    if (request.method === 'POST') {
      if (!Object.hasOwn(actions, action)) return json({ error: 'Action not found.' }, 404);
      const reader = request.body?.getReader();
      const bytes = new Uint8Array(2048);
      let size = 0;
      if (!reader) return json({ error: 'Send the current turn.' }, 400);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (size + value.length > bytes.length) {
            await reader.cancel();
            return json({ error: 'Payload too large.' }, 413);
          }
          bytes.set(value, size);
          size += value.length;
        }
        turn = JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)))?.turn;
      } catch {
        return json({ error: 'Send a JSON object containing the current turn.' }, 400);
      }
    } else if (request.method !== 'GET' || action) {
      return json({ error: 'Method not allowed.' }, 405);
    }

    return this.ctx.storage.transaction(async txn => {
      const record = await txn.get<RunRecord>('run');
      if (!record || record.expiresAt <= Date.now()) return json({ error: 'Run not found or expired.' }, 404);
      if (action && request.headers.get('Authorization') !== 'Bearer ' + record.credential) {
        return json({ error: 'Invalid run credential.' }, 403);
      }
      const encounter = createRun();
      for (const previous of record.actions) encounter.play(previous);
      const current = { roundId, ...encounter.state() };
      if (!action) return json(current);
      if (turn !== current.turn && turn !== String(current.turn)) return json({ ...current, error: 'Turn changed.' }, 409);
      if (!current.availableActions.includes(action as Action)) return json({ ...current, error: 'Action unavailable.' }, 409);
      encounter.play(action as Action);
      record.actions.push(action as Action);
      await txn.put('run', record);
      return json({ roundId, ...encounter.state() });
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'GET' && path === '/api/game-spec') return manifest(url.origin);
    if (request.method === 'POST' && path === '/api/runs') {
      const runId = crypto.randomUUID();
      return env.ARENAS.getByName(runId).fetch(new URL('/api/runs/' + runId, url), { method: 'POST' });
    }
    const match = /^\/api\/runs\/([\da-f-]{36})(?:\/([a-z]+))?$/.exec(path);
    if (match && !(request.method === 'POST' && !match[2])) return env.ARENAS.getByName(match[1]).fetch(request);
    if (request.method === 'GET' && (path === '/' || /^\/watch\/[\da-f-]{36}$/.test(path))) {
      const asset = await env.ASSETS.fetch(new URL('/index.html', url));
      const headers = new Headers(asset.headers);
      headers.set('Content-Security-Policy', "frame-ancestors 'self' https://app.bytearena.fun");
      return new Response(asset.body, { status: asset.status, headers });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
