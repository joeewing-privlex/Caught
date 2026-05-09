# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Butterfly Duel — a browser-based real-time 4v4 multiplayer game. Children with butterfly nets race across a Pacific Northwest map, collecting wandering butterflies into a snake-tail trail, banking them at their team base, and stealing trails from opposing players. The full design (mechanics, tunables, socket protocol, build order) lives in `butterfly_duel_spec.md` — treat it as the source of truth for product behavior.

## Commands

- `npm start` — run the server (`node server/index.js`, serves client + Socket.io on port 3000, override with `PORT`).
- `npm run dev` — same, under `nodemon` for autoreload.
- No lint, type-check, or test setup exists. There is no test runner configured; do not invent `npm test`.

The client is plain ES modules served statically from `/client` by Express — no build step, just reload the browser.

## Architecture

### Server (Node + Express + Socket.io, authoritative)

`server/index.js` is the connection/lobby orchestrator. It owns lobbies (pre-game state) and routes Socket.io events; once a lobby starts a match it constructs a `GameRoom` and hands it to the game loop.

`server/gameLoop.js` runs a single `setInterval` at `TICK_RATE` (20 Hz) that calls `update(dt)` on every active `GameRoom`, broadcasts a full `game:tick` snapshot to that room, and removes rooms whose phase becomes `'ended'`.

`server/gameState.js` is the heart of the simulation. `GameRoom` holds players, free butterflies, flowers, scores, timer. `update()` orders work as: timer → respawn queues → disconnect cleanup → butterfly AI → player movement & collection → cross-player theft checks → top up free butterfly count. Player movement does input-clamp → speed factor (trail-length penalty + power-ups) → `resolveObstacleSlide` → `clampToMap` → record `pathHistory` → collect-on-proximity → bank-on-base → flower pickup. The trail is a chain of butterfly objects rendered along a sampled `pathHistory`; `_trailPositions(player)` walks that history at `TRAIL_SPACING` increments to produce the per-butterfly positions used both for theft detection and the tick payload.

`server/collision.js` defines static map geometry: a list of circular `OBSTACLES` plus a diagonal stream modelled mathematically (`streamCenterX(y)` + `STREAM_HALF_WIDTH`) with three `CROSSING_YS` gaps. `resolveObstacleSlide` does axis-separated sliding (try full move → try x only → try y only → stop). The stream is sent to clients as parameters, not tiles.

`server/butterfly.js`, `powerups.js`, `theft.js` are small focused modules called from `gameState.update`. Theft (`theft.js`) early-outs on same team, victim shielded, or thief inside base immunity (`immuneUntil`).

`server/matchmaking.js` is dual-purpose: 6-char alphanumeric room-code generation (Crockford-ish alphabet, dedup against an in-memory set) and a public queue that fires either at `PUBLIC_MATCH_IDEAL` players or after `PUBLIC_MATCH_WAIT_SEC` if at least `PUBLIC_MATCH_MIN` are waiting; teams are assigned by alternating queue order.

`server/config.js` is the central tunables file referenced by the spec — change values here, not in module bodies.

### Client (vanilla JS, Canvas)

`client/main.js` wires socket events to UI / renderer / input modules and tracks local-player identity (`myId`, `myTeam`). `client/renderer.js` interpolates between the two most recent `game:tick` snapshots for 60 fps drawing. `client/input.js` samples WASD/arrow input and emits `player:input { dx, dy }` at 20 Hz. `client/ui.js` owns the menu/lobby/HUD/end screens. The map's static geometry (obstacles, stream params, bases) is sent once in `game:start`; per-tick payloads only carry dynamic state.

### Authority and trust

The server is fully authoritative. Clients send only normalized direction vectors; positions, collisions, banking, theft, scoring, and timer are all computed server-side. Never trust client-supplied positions when adding features.

## Conventions

- Game tunables live in `server/config.js`. New magic numbers should be added there if the spec assigns them a name.
- Socket event names use `domain:action` (`lobby:create`, `game:tick`, `player:banked`). Match this when adding events.
- `gameState.js` mutates player/butterfly/flower objects in place (no immutable copies). Keep that pattern for hot-loop code.
- Render-only data (e.g. `trailPositions`) is computed in `getTickState()` — keep heavy per-tick derived fields there, not stored on the live objects.

## Known divergences from the spec

If you touch related code, sanity-check against `butterfly_duel_spec.md` rather than assuming current values are correct:

- `server/config.js` has `MAP_WIDTH: 16000`, `MAP_HEIGHT: 12000`, `SPEED_NORMAL: 500`, but the spec specifies `1600 / 1200 / 200` and the actual map content (obstacles, bases at x=160 / x=1440, stream coords) is laid out for the 1600×1200 world. `clampToMap` uses the inflated config values, so players can currently wander far outside the playable region. Treat this as a real bug, not intentional.
- `server/index.js` registers a `game:reconnect` event but no client emits it; the 15-second disconnect-hold reconnect flow described in the spec is not fully wired up on the client side.
