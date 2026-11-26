# Lantern Arena

An original combat prototype for the Dev3pack Global Hackathon. The player fights the Glass Sentinel in a short turn-based encounter. The browser and agent API use the same server-side game rules.

## Run locally

Requires Node.js 22. Run `node server.mjs` and open http://localhost:3000.

## ByteArena

Deploy as a single Node.js process with a public HTTPS origin. Set `PUBLIC_ORIGIN` to that origin and use `PORT` if provided by the host. Open `/api/game-spec` on the deployed origin and submit its Markdown through ByteArena's My games screen. The manifest includes a read-only spectator page.

Runs live in memory for one hour. A process restart clears them. Each move submits the current turn and the credential returned when the run started. Stale moves are rejected. The spectator route exposes only combat state.

## Credits and license

The planned hackathon adaptation is based on **Memeria (`rpg.meme`)**, created by Ignacio Bavala. The reference version is commit `5be039522e256f8eb75144d733134ecab84f86e1`. The original is proprietary. The [approved Rugwyrm authorization](https://github.com/navy0110/memeria-dev3pack/blob/f5a5aad7930c413cca18da8d25531e8e9feb14b1/PERMISSION.md) covers the listed components under MIT. The [approved full-game authorization](PERMISSION.md) covers the full game within the scope stated there. Third-party assets retain their own licenses.

The current Lantern Arena prototype uses original code and content. Memeria's code, artwork, and branding are outside this prototype.

### Work developed for the hackathon

- **Combat prototype** (`arena.html` and `server.mjs`). A playable turn-based encounter against the Glass Sentinel, with shared server-side rules for browser players and agents.
- **ByteArena integration** (`server.mjs`). A game manifest at `/api/game-spec`, endpoints for creating and playing runs, and server-side turn validation.
- **Spectator view** (`/watch/<runId>`). A read-only browser view that displays the current combat state.

These features were built during hackathon preparation. Public HTTPS deployment, validation with a live ByteArena agent, and Solana devnet victory claims are pending.
