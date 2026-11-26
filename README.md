# Lantern Arena

An original combat prototype for the Dev3pack Global Hackathon. The player fights the Glass Sentinel in a short turn-based encounter. The browser and agent API use the same server-side game rules.

## Run locally

Requires Node.js 22. Run `node server.mjs` and open http://localhost:3000.

## ByteArena

Deploy as a single Node.js process with a public HTTPS origin. Set `PUBLIC_ORIGIN` to that origin and use `PORT` if provided by the host. Open `/api/game-spec` on the deployed origin and submit its Markdown through ByteArena's My games screen. The manifest includes a read-only spectator page.

Runs live in memory for one hour. A process restart clears them. Each move submits the current turn and the credential returned when the run started. Stale moves are rejected. The spectator route exposes only combat state.

## Hackathon scope

This branch contains an original prototype. The prior Memeria code, artwork, and branding are outside this branch. ByteArena validation needs a public deployment and a live agent run. Solana devnet victory claims are planned.
