# Memeria · Dev3pack

[Memeria](memeria/README.md) is a web RPG set in Hodl Hollow. This repository contains the complete authorized source snapshot of the game and the Rugwyrm encounter built for Dev3pack.

## Demo

- [Public Rugwyrm arena](https://memeria-dev3pack-arena.lovechainart.workers.dev/)
- [ByteArena game manifest](https://memeria-dev3pack-arena.lovechainart.workers.dev/api/game-spec)

The public demo is an isolated encounter that uses Memeria's combat engine, Rugwyrm AI, and Dogwifhat class. The boss has 160 HP for a short demo. Our test agent completed it through the public API. Registration and testing with the official ByteArena agent are pending.

## Run Memeria and the arena locally

Use Node.js 24 or later and pnpm 10. Run these commands from the repository root in PowerShell.

```powershell
Push-Location memeria
pnpm install --frozen-lockfile
pnpm build
node scripts/build-rugwyrm.mjs
Pop-Location
$env:ARENA = 'rugwyrm'
$env:PORT = '3010'
node server.mjs
```

Open [the local arena](http://127.0.0.1:3010) to play the encounter. In a second terminal, start the test agent with `node rugwyrm-agent.mjs`. Its output includes a spectator link.

To play the original game or watch the agent inside the original world, start the Memeria client in another terminal.

```powershell
Set-Location memeria
$env:MEMERIA_ARENA_ORIGIN = 'http://127.0.0.1:3010'
pnpm dev
```

Open the Vite URL to play Memeria. Add `?bytearena=<roundId>` to that URL to watch a run in Hodl Hollow. Use the UUID from the agent's spectator link. Vite forwards `/api/runs` to the local arena. A hosted Memeria client requires the corresponding route to the arena Worker.

## Cloudflare

The arena Worker is configured in [wrangler.arena.jsonc](memeria/wrangler.arena.jsonc). Build with `node scripts/build-rugwyrm.mjs` from `memeria/` and deploy with `pnpm exec wrangler deploy --config wrangler.arena.jsonc` to an authorized Cloudflare account. The arena uses one Durable Object per run and expires runs after an hour. The full game has a separate [Worker configuration](memeria/wrangler.jsonc) and requires a dedicated D1 binding.

## Credits and license

Ignacio Bavala created the original Memeria game. This copy is based on revision `5be039522e256f8eb75144d733134ecab84f86e1`. The [authorization](PERMISSION.md) covers the full game within its stated scope, and the [MIT notice](memeria/LICENSE) preserves Ignacio's copyright. Third-party music is outside this snapshot.

The Dev3pack work adds the Rugwyrm encounter API, the ByteArena manifest, the Cloudflare Worker, the test agent, and the spectator mode inside Memeria. The earlier Glass Sentinel prototype is also available by running `node server.mjs` with `ARENA` unset. Solana devnet victory records are pending.
