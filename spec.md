# Butterfly Duel v2 — Tiny Town Edition

A browser-based real-time 10-player game on procedurally generated tile maps, designed to be fun for ~one hour of play among a fixed group of friends.

This spec supersedes `butterfly_duel_spec.md` for v2 work. The original spec is preserved as historical context; where the two disagree, this file wins.

---

## 1. Goals, non-goals, and audience

**Audience.** Ten specific people, playing together over the public internet for roughly one hour at a time. Not a public release. We can ship rough edges that we wouldn't ship to strangers (e.g. a "rejoin code" the user types in if auto-reconnect fails).

**Goals.**
- Support **10 concurrent players** per match, each with a uniquely colored Kenney Tiny Town character.
- **Procedurally generated** tile-based maps from the Kenney Tiny Town tileset, fresh per match, so a 60-minute session has visual variety.
- **An hour of engagement.** Multiple short rounds (3 min each), rotating mutators, persistent session leaderboard, fast re-queue.
- **Graceful disconnect/reconnect** — players who lose wifi for 30–60 seconds get their slot back automatically, with their score and trail intact (slot, not trail position — see §6).
- **Cheap, simple hosting** — single small VM or PaaS instance, no horizontal scaling needed, deploy by `git push`.

**Non-goals.**
- Anti-cheat beyond the existing "server authoritative, clamp inputs" model. These are friends.
- Mobile / touch support (out of scope for v2; the existing virtual D-pad stub is not extended).
- Persistent accounts. Identity is per-browser; clearing storage = new player.
- Audio. Optional, deferred.
- Spectator mode. The reconnect flow makes it tempting, but skip for v2.

---

## 2. Hosting: Render free web service

**Decision:** deploy as a single Render free web service. Buildpack-driven (no Dockerfile needed), WebSockets supported natively, auto-deploy from a connected git repo.

### 2.1 What Render free gives us

| Resource | Free tier value | Verdict for this game |
|---|---|---|
| RAM | 512 MB | ~50× what one 10-player room needs |
| CPU | 0.1 CPU shared | 20 Hz tick costs <1 ms; we don't notice |
| WebSockets | Native, no config | Works |
| HTTPS | Automatic, managed cert | Works |
| Egress | Unmetered on free | Our ~250 MB/hour is nothing |
| Build minutes | 500/month | Trivial — Node install + nothing else |
| Service hours | 750/month | One service, ~24×31 = 744. Fits with single instance. |

### 2.2 The one gotcha: cold start

Render free services **spin down after 15 minutes of HTTP traffic inactivity**. The next request triggers a cold start, which takes **~30–60 seconds** for a Node app of this size. During a live match WebSocket traffic keeps the service warm, so spin-down only happens between sessions.

Mitigation:
- Tell the group: "first person to click 'create lobby' may wait ~45s while the server wakes up." This is socially fine for a planned session.
- The lobby screen shows a "Waking up the server…" message if the initial Socket.io handshake takes more than 2s.
- If anyone finds this annoying, a tiny external pinger (cron-job.org hitting `/health` every 10 minutes) keeps it warm — but eats your free service hours faster, so don't do it preemptively.

### 2.3 Deployment shape

- Single `node server/index.js` process, no external dependencies (no Redis, no DB).
- All state in memory. Rooms vanish when the service restarts or is redeployed. Players keep their `clientId` (see §6.1) and can rejoin a fresh lobby.
- `PORT` comes from `process.env.PORT` (Render sets this; defaults to 3000 locally) — already wired correctly in `server/index.js`.
- `NODE_ENV=production` set by Render automatically; Socket.io respects it.
- Static client served by Express from `/client` (already done; keep).

### 2.4 Concrete setup

Add to `package.json`:

```json
"engines": { "node": ">=18.0.0" }
```

Add a `render.yaml` at repo root (Render will offer to use it on first deploy):

```yaml
services:
  - type: web
    name: caught
    runtime: node
    plan: free
    region: oregon            # or whichever is closest to the players
    buildCommand: npm install
    startCommand: node server/index.js
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
```

Add a `/health` route to `server/index.js` (one line: `app.get('/health', (_, res) => res.send('ok'));`). Render polls it during deploys and uses it to confirm a healthy restart.

Deploy flow: connect the GitHub repo in Render dashboard → push to `main` → service auto-builds and goes live at `https://caught.onrender.com` (or your chosen name).

### 2.5 What we lose vs. a paid host

- Cold start, as above.
- No persistent disk (we don't need one).
- One instance only (we don't need more — 10 players fit comfortably).
- No custom domain on free tier (works fine with the `.onrender.com` URL for friends).

---

## 3. What exists vs. what changes

### 3.1 What's already built (v1, in `server/` and `client/`)

- Server-authoritative Socket.io game loop at 20 Hz (`gameLoop.js`).
- Lobby + room code creation and public queue (`index.js`, `matchmaking.js`).
- Player movement with axis-separated obstacle slide, trail-length speed penalty (`gameState._updatePlayer`).
- Butterfly wandering AI, proximity collection, banking, trail theft, Trillium power-ups.
- Three hand-authored maps (`server/maps/meadow.js`, `forest.js`, `arena.js`) plus a registry that can pick randomly.
- Canvas-based client with snapshot interpolation (`client/renderer.js`).
- A **stub** reconnect handler (`game:reconnect` on the server) — never invoked by the client, and broken anyway because it identifies the player by `socket.id`, which is regenerated on reconnect.

### 3.2 What changes in v2

| Area | v1 today | v2 target |
|---|---|---|
| Max players | 8 (4v4) | **10** (5v5; FFA mode optional, see §4.4) |
| Character art | Placeholder circles | **Kenney Tiny Town characters**, 10 colors, 4-direction (front / back / side L / side R), per-player |
| Map source | 3 hand-authored maps | **Procedurally generated** tile-based maps using Tiny Town tiles, seeded per match |
| Map collision | Circle obstacles + line-segment stream | **Tile grid** of `{passable, blocking, water-with-bridge}` cells. Circle obstacles deprecated. |
| Tile size | n/a | 32 game-units per tile (so 1600×1200 world = 50×37 tiles) |
| Player identity | `socket.id` only | **`clientId`** (persisted in `localStorage`) + per-session `sessionToken` |
| Reconnect | Stub, broken | **Full flow**: 60s hold window, auto-resume by `clientId`, manual rejoin-by-code fallback |
| Round structure | One 2-minute round, return to lobby | **Series of rounds** (default 5 × 3 min), persistent session leaderboard, mutators rotated each round |
| Mutators | None | **Per-round mutator** drawn from a small set (see §4.5) |
| `SPEED_NORMAL` | 500 (mismatched to 1600×1200 map) | **200** (spec value), with re-tuned trail penalty curve |
| `CLAUDE.md` divergences | `MAP_WIDTH`/`HEIGHT` claims, stale | Removed — map dimensions live on the map object only |

### 3.3 What stays exactly as-is

Don't rewrite for fun. Keep:
- 20 Hz tick rate, snapshot model, server authority.
- Trillium power-up effects (white/pink/red trillium).
- Trail-as-snake-tail mechanic, including `_trailPositions` walking `pathHistory`.
- Theft semantics (whole-trail transfer on theft-radius contact, same-team early-out, base immunity window).
- Socket event naming convention (`domain:action`).
- The "no build step" client. Plain ES modules served statically.

---

## 4. Game design changes

### 4.1 Player count and team structure

- **`MAX_PLAYERS` = 10.** Lobby caps at 10. Minimum to start = 2.
- **Default mode: 5v5.** Two teams, A (cool colors) and B (warm colors), assigned in the lobby. Host can drag players between teams; players can self-swap if their target team has ≤ their current team's count.
- Spawn positions: existing `spawnPositions(map, team, count)` already handles arbitrary `count` with a perpendicular offset. The 60-unit per-player perpendicular gap × 5 players = 240 units across, which fits next to bases on the 1600×1200 map. No change needed.

### 4.2 Character color assignment

10 unique colors from the Tiny Town set:
`blue`, `brown`, `gray`, `green`, `orange`, `pink`, `purple`, `red`, `turquoise`, `yellow`.

- Each player picks a color in the lobby; first-come-first-served. Default to "next unused color in order."
- Team is shown via a colored team-badge ring rendered under the sprite (team A: blue ring; team B: red ring). The sprite color stays the player's chosen color, so players still recognize themselves. This decouples "who am I" from "what team am I on" and avoids the 10-color → 2-team color clash.
- Sprite asset naming in `kenney_tiny-town/Characters/` is inconsistent (`greenabck.png`, `greyabck.png`, `grayfront.png` vs `greyside.png`). Build an explicit asset map in `client/sprites.js` rather than constructing filenames from color strings.

### 4.3 Round length, session structure

- **Round duration: 180 seconds** (was 120). With 10 players on a slightly bigger feeling map, 2 minutes feels short.
- **Session = series of 5 rounds.** Each round picks a fresh procgen seed and a different mutator (or "no mutator" as one of the options).
- **Persistent session leaderboard.** Tracks per-player: butterflies banked, butterflies stolen from, butterflies stolen, MVP rounds, total points. Shown between rounds and at session end.
- **Between rounds:** 20-second interstitial showing leaderboard + next mutator preview, with a "ready" button per player. Auto-advances when all ready or after 20s.
- **Session end:** Big leaderboard + "play another session" button. Same lobby, fresh rounds.

This is the engagement engine. One 3-minute round is over too fast; a 5-round series gives a natural arc with a clear winner and rematches.

### 4.4 Game modes

v2 ships **one mode**: Team Banks scaled to 5v5. Collect butterflies, bank at your team base, steal from opposing trails, highest team total at time-out wins. Mutators (§4.5) provide variety.

Free-For-All was considered and cut — not worth the second balancing problem for v2.

### 4.5 Mutators

Per-round mutators add variety without re-engineering. Each round, the server picks one (excluding the previous round's pick).

v2 ships **four mutators**:

| Mutator | Effect |
|---|---|
| **None** | Baseline rules. |
| **Butterfly Bloom** | `BUTTERFLY_TARGET_COUNT` = 60 (double). More chaos, more banking. |
| **Speed Demons** | `SPEED_NORMAL` × 1.3. Trail penalty unchanged. |
| **Sudden Death** | Round duration 90s, all point values × 2. |

Big Trail, Trillium Rush, and Foggy Meadow were considered and cut for v2 — Big Trail and Trillium Rush are too subtle to feel different from baseline, and Foggy Meadow needs renderer surgery that isn't justified for one mutator. Adding them later is a small change.

Mutator is shown on the interstitial screen and in the corner of the HUD during play.

### 4.6 Tuning fixes carried over from CLAUDE.md "known divergences"

- `SPEED_NORMAL`: set to **200** (matches spec, matches 1600×1200 map). Drop the inflated 500.
- Confirm there is no `MAP_WIDTH`/`MAP_HEIGHT` in `config.js` — width/height come from the map object. Update CLAUDE.md to remove the stale note.
- Trail speed penalty curve: keep the linear ramp from 1.0× at 0 butterflies to 0.7× at 10+, but cap trail length contribution to penalty at 15 (above that, no further slowdown). With more butterflies on the map and stealing, trails will often exceed 10.

---

## 5. Procedural map generation

### 5.1 Coordinate system

- **Game-unit world:** 1600 × 1200 game units, same as v1.
- **Tile grid:** 32 game units per tile → **50 columns × 37 rows** (1600 / 32 = 50; 1200 / 32 = 37.5 → 37 rows, with a 16-unit margin at the bottom).
- **Tile rendering:** Kenney Tiny Town tiles are 16×16 pixels. Render at 2× → 32 screen pixels per tile, mapped 1:1 to one game unit per pixel via the renderer's existing camera transform.

### 5.2 Tile catalog

The Tiny Town tilesheet has 132 tiles. We don't need a full inventory in the spec — author a `client/tiles.js` map keyed by purpose:

```
{
  grass:        [tile_0000, tile_0044, tile_0045, ...],   // ground variants
  grass_path:   [...],                                     // path/dirt overlays
  water:        [...],                                     // animated water tiles
  water_edge:   { N, S, E, W, NE, NW, SE, SW },           // shore tiles by direction
  bridge:       [...],                                     // bridges over water
  tree:         [...],                                     // blocking
  rock:         [...],                                     // blocking
  bush:         [...],                                     // non-blocking decor
  fence:        { H, V, corner_NE, ... },                 // blocking
  house:        [...],                                     // multi-tile blocking decor
  base_A_marker: tile_XXXX,                                // visible center of team A base
  base_B_marker: tile_XXXX,                                // visible center of team B base
  flower:       [...],                                     // power-up visuals
}
```

Filling this out is an art-pass task — pick reasonable tiles by eyeballing the tilesheet. The procgen treats tile semantics abstractly; the renderer maps semantic → tile ID at draw time.

### 5.3 Map cell model

Server-side, a map is represented as a 2D grid of cell records:

```js
{
  width: 50, height: 37,                    // tiles
  cells: Uint8Array(50 * 37),               // semantic ID per cell (see below)
  bases: { A: {tx, ty}, B: {tx, ty} },      // tile coords of base centers
  powerupSpawns: [{tx, ty}, ...],
  butterflyZones: [{tx, ty, w, h}, ...],
  seed: 'abc-123',
}
```

Cell semantic IDs (small enum, ≤ 256 values):

| ID | Name | Passable to player | Passable to butterfly | Render |
|---|---|---|---|---|
| 0 | grass | yes | yes | grass variant by hash(tx,ty) |
| 1 | path | yes | yes | path overlay on grass |
| 2 | water | no | no | water |
| 3 | bridge | yes | yes | bridge over water |
| 4 | tree | no | no (reflect) | tree |
| 5 | rock | no | no (reflect) | rock |
| 6 | bush | yes | yes | bush on grass |
| 7 | fence | no | no (reflect) | fence by neighborhood |
| 8 | base_A | yes (banking zone) | yes | base_A_marker |
| 9 | base_B | yes (banking zone) | yes | base_B_marker |

Paths are visual + connectivity guarantee only; no speed bonus. (Speed bonus considered and cut — adds a tuning knob with no clear gameplay value.)

### 5.4 Generation algorithm

Server-side, seeded by an alphanumeric seed string (e.g. the room code + round index). Pseudocode:

```
generate(seed):
  rng = mulberry32(hashStringToInt(seed))
  cells = fill(grass)
  carveBases(cells)
    A at (4, 18), B at (45, 18)               // fixed positions, mirrored across vertical axis
    paint 5x5 of base_A and base_B centered there
  carveRivers(cells, rng)
    0 or 1 rivers (50% chance), running roughly N-S or E-W with meander
    width 2-3 tiles, with 2-4 bridge tiles spaced along its length
    river must not touch either base 5x5 (regenerate the river if it does)
  scatterBlockingClusters(cells, rng)
    place 20-30 "cluster" seeds avoiding bases (>= 6 tiles from base center)
    each cluster grows a 1-4 tile blob of one of {tree, rock, fence}
    fence clusters form short straight runs (2-5 tiles) rather than blobs
  carvePaths(cells, rng)
    A* from base_A to base_B, treating only base_A/base_B/grass as walkable
    if no path exists, remove the lowest-priority blocker on the shortest blocked path
    paint the route as `path` tiles (overrides grass)
    do not paint over water — paths terminate at bridges
  scatterDecor(cells, rng)
    place 10-20 bush tiles on remaining grass
  placePowerupSpawns(rng)
    8 spawn points: divide the map into a 4x2 grid of cells (each ~12x18 tiles)
    pick one valid grass tile in each grid cell, avoiding the 7x7 zone around each base
  placeButterflyZones()
    derived, not random: 3 zones — center band (cols 20-29, rows 12-24), and one slim band on each side near the middle
  return { cells, bases, powerupSpawns, butterflyZones, seed }
```

**Connectivity invariant.** After generation, the map MUST have at least one path from base_A to base_B walkable by a `PLAYER_RADIUS` body. `carvePaths` guarantees this by construction. If the resulting path's tile count exceeds some threshold (say, 120 tiles), regenerate the map with a fresh seed nonce — meaning we hit a pathological clutter and it'd be unfun.

**Determinism.** Pure function of `seed`. Server generates, sends `{ seed, cells }` to clients in `game:start`. Clients render directly from `cells` — they don't re-generate. (Sending the grid as 1850 bytes is trivial.) Seed format: `"${roomCode}-${roundIndex}"`. Lets us reproduce any specific map for debugging.

### 5.5 Collision against tiles

Replace `resolveObstacleSlide` with a tile-aware version:

```
playerCollidesAt(x, y, radius, map):
  tx0 = floor((x - radius) / TILE_SIZE)
  ty0 = floor((y - radius) / TILE_SIZE)
  tx1 = floor((x + radius) / TILE_SIZE)
  ty1 = floor((y + radius) / TILE_SIZE)
  for tx in tx0..tx1:
    for ty in ty0..ty1:
      cell = map.cells[ty * width + tx]
      if cellIsBlocking(cell) and circleOverlapsRect(x, y, radius, tx*TILE_SIZE, ty*TILE_SIZE, TILE_SIZE, TILE_SIZE):
        return true
  return false
```

`resolveObstacleSlide` keeps the same axis-separated try-full-then-try-x-then-try-y shape — only the inner collision check changes. Butterflies use the same function with `BUTTERFLY_RADIUS = 6`.

The existing `clampToMap` is fine — keep it; it operates on `map.width`/`map.height` in game units which we'll continue to set on the map object.

### 5.6 Base zones

- Bases are no longer "circle of radius 120 around base center." They are now defined as **the 5x5 tile patch of `base_A`/`base_B` cells** (160×160 game units, area 25,600 vs. the old circle's ~45,000). Slightly smaller, but with the new mode of approach (paths leading to base), it's fine.
- Banking trigger: any player standing on a `base_X` cell where `X == player.team` instantly banks their trail.
- Theft immunity (`BASE_IMMUNITY_SEC = 2`) triggers on entering any base patch, friend or foe.

---

## 6. Disconnect, reconnect, and identity

This is the area v1 doesn't handle at all. Spec it carefully.

### 6.1 Identity model

Two IDs, both opaque strings.

- **`clientId`**: stable identity for a browser. Generated client-side as a UUIDv4 on first visit, stored in `localStorage` under `caught.clientId`. Sent with every connection. Persists across sessions, page reloads, and browser restarts. Survives disconnects.
- **`socket.id`**: ephemeral per-connection ID assigned by Socket.io. Used for low-level routing within a connection. **Never used as a player identity** in v2 — replace every existing `socket.id` reference in `gameState.js` / `index.js` with `player.clientId`.

A **room-side player record** keys on `clientId`. The current connection's `socket.id` is stored as a field on the player record; updated when a player reconnects with a fresh socket.

### 6.2 Session resume flow

On every fresh socket connection, client emits:

```
session:hello { clientId, displayName?, lastRoomCode? }
```

Server responds with one of:

| Server response | When |
|---|---|
| `session:resumed { roomCode, role: 'in_game'|'in_lobby', snapshot }` | The `clientId` matches a held disconnected player in a still-alive room. Restore them. |
| `session:fresh` | No matching held slot. Treat as a new visitor; client shows menu. |

On `session:resumed`, the client jumps directly into the appropriate UI:
- `in_lobby` → show lobby screen with current state.
- `in_game` → show HUD + canvas, render the snapshot immediately, resume input.

The `snapshot` payload mirrors a `game:tick` plus the static map (`{ map, teamAssignments }`) so the client has everything it needs without waiting for the next tick.

### 6.3 Hold-and-replace behavior

When a player's socket disconnects:

1. Mark `player.disconnected = true`, record `player.disconnectAt = now`.
2. Drop the player's trail butterflies to the map as free butterflies (existing v1 behavior — keep).
3. Hold the slot for **`DISCONNECT_HOLD_SEC = 60`** seconds (was 15). 60s is friendlier for a typical home-wifi blip.
4. During the hold window:
   - The player is rendered ghosted at their last position, with a small "reconnecting…" indicator above them.
   - Their score contribution to the team total is preserved (banked butterflies have already counted; nothing to restore).
   - They cannot be theft targets (no trail to steal anyway, but make this explicit — disconnected players are immune).
   - The team is short-handed.
5. If the player reconnects within the window with a matching `clientId`, restore them at their last server-known position. Input resumes. Ghost indicator clears.
6. If the window expires, remove the slot entirely and the team is permanently down a player for the rest of the round. Their session stats are kept; if they later reconnect, they join the next round normally.

### 6.4 Reconnect UI on the client

- A persistent connection-status indicator in the corner of the HUD (green dot connected, yellow "reconnecting" while Socket.io's own retry is running, red "disconnected — try refreshing" if Socket.io gives up).
- If `game:tick` hasn't arrived in **2 seconds** while `inGame === true`, show a translucent "Reconnecting…" overlay with a countdown of "X seconds until your slot is released."
- Socket.io's built-in reconnect: enable with `reconnectionAttempts: Infinity`, `reconnectionDelayMax: 3000`. The client doesn't manually retry.
- "Manual rejoin" fallback: from the menu, a "Rejoin in-progress game" button. Asks for a room code, sends `session:hello` with that code as `lastRoomCode`. This covers cases where the user closes the tab.

### 6.5 Lobby disconnects

Same hold model as in-game but simpler: when a player disconnects from a lobby (not yet in a game), mark them as `disconnected`, hold the slot for 60s. The slot keeps their chosen color reserved. If they reconnect within the window, restore them to the lobby. If host disconnects, promote next-joined player to host immediately (v1 behavior).

### 6.6 Other failure modes

| Failure | Behavior |
|---|---|
| Host disconnects in lobby | Promote next-joined player to host. Existing v1 logic — keep. |
| Host disconnects mid-game | No-op; host is only meaningful in lobby. |
| All players disconnect mid-game | Room enters `phase: 'paused'` after 30s of zero connected players. Held for `DISCONNECT_HOLD_SEC`. If any player returns, resume. If timer expires, end the round with a draw and tear down. |
| Server restart | All rooms vanish. Clients show "the server restarted — please rejoin." Players reuse their `clientId`; lobby remembers their `displayName` so they don't re-enter it. |
| Player joins twice from two tabs | Second tab takes over; first tab gets `session:replaced` and shows "you opened this in another tab." |
| Player names clash | Allow it. Add a `#NN` suffix server-side when displaying duplicates. |
| `dx`/`dy` out of range | Already clamped to `[-1, 1]`. Keep silent clamp. |
| Tick payload size | At 10 players × ~10 trail butterflies, payload is well under 4KB/tick. No compression needed. |
| Idle player | After 60s of zero `player:input` while in-game, server stops their movement (clears `dx,dy`); they stay in the game but stop drifting. No kick — they might just be AFK by choice. |

---

## 7. Networking & socket events

### 7.1 Event changes from v1

New or changed events; everything else is unchanged.

**Client → Server:**

| Event | Payload | Notes |
|---|---|---|
| `session:hello` | `{ clientId, displayName?, lastRoomCode? }` | NEW. Sent on every connect. Replaces the implicit `socket.id` identity. |
| `lobby:create` | `{ playerName, preferredColor? }` | `preferredColor` added. |
| `lobby:join` | `{ roomCode, playerName, preferredColor? }` | `preferredColor` added. |
| `lobby:set_color` | `{ color }` | NEW. Player changes their character color in lobby; rejected if taken. |
| `lobby:set_team` | `{ team: 'A'|'B' }` | NEW. Self-swap subject to balance rule. |
| `lobby:set_mutator_pool` | `{ mutators: string[] }` | NEW. Host-only. Configures which mutators are eligible this session. |
| `series:ready_next` | — | NEW. Player ready for next round. |

**Server → Client:**

| Event | Payload | Notes |
|---|---|---|
| `session:resumed` | `{ roomCode, role, snapshot }` | NEW. |
| `session:fresh` | — | NEW. |
| `session:replaced` | — | NEW. |
| `game:start` | `{ map: { seed, width, height, cells, bases, powerupSpawns }, teamAssignments, mutator, roundIndex, totalRounds }` | `cells` is the tile grid (Uint8Array as base64 or just a regular array — 1850 entries is fine as JSON). `obstacles`/`stream` fields are removed. |
| `series:standings` | `{ standings: [{ clientId, name, banked, stolen, lost, mvps, total }], nextMutator, nextSeed, roundIndex }` | NEW. Interstitial. |
| `series:end` | `{ standings, sessionWinner }` | NEW. |
| `player:disconnected` | `{ clientId, holdUntil }` | NEW. For ghosted-rendering UI. |
| `player:reconnected` | `{ clientId }` | NEW. |

### 7.2 Tick payload changes

`game:tick` keeps its shape but `players[].id` is now `clientId`, not socket id. Clients track local identity by `clientId` (stored at app boot).

### 7.3 Input rate

20 Hz player input, 20 Hz server tick, 60 Hz client render with linear interpolation between the two most recent ticks. Same as v1.

### 7.4 Bandwidth back-of-envelope

10 players, 20 Hz, ~10 trail entries each, plus 30–60 butterflies:

- Per tick: ~10 × (player fields ~80B + 10 trail positions × 16B) + 60 × 24B = ~3.5 KB JSON
- Per second per client: ~70 KB. Per second per server: ~700 KB total to all clients.
- For an hour-long session, ~250 MB egress total. Well within any free tier.

---

## 8. Client architecture

### 8.1 New / changed client modules

```
client/
├── index.html
├── main.js              # unchanged surface, updated socket handlers
├── input.js             # unchanged
├── renderer.js          # significantly extended: tilemap render, sprite render
├── ui.js                # extended: color picker, leaderboard, mutator preview, reconnect overlay
├── tiles.js             # NEW. Tile semantic → tile-image map. Loads tilesheet.
├── sprites.js           # NEW. Character color/orientation → sprite-image map.
├── identity.js          # NEW. clientId persistence, name persistence.
└── procgen.js           # OPTIONAL. Mirrors server procgen if we want client-side regen from seed. Not required for v2.
```

### 8.2 Renderer changes

- Load the tilesheet (`kenney_tiny-town/Tilemap/tilemap_packed.png`) and the per-character sprite sheets once at app start.
- Draw order per frame: tile background → bushes/flowers (non-blocking decor) → butterflies (free, then trails) → players (sorted by Y) → HUD.
- Sprite orientation:
  - `front` = facing camera (moving down / negative Y? — pick a convention)
  - `back` = away from camera
  - `side` = right; flip horizontally for left
  - Pick orientation from the player's `angle` field: 4 quadrants centered on cardinal directions.
- A simple 2-frame walk cycle (alternate between two crops of the sprite if the sheet has multiple frames; otherwise a small vertical bob for now). The Tiny Town character files appear to be single-frame per orientation — bob will do.

### 8.3 UI additions

- **Lobby:**
  - Color picker grid (10 swatches, taken ones grayed out).
  - Team swap button next to each player row.
  - Mutator-pool checklist (host-only).
- **Between rounds:**
  - Leaderboard table.
  - Next mutator card with name + 1-line description.
  - "Ready for next round" button per player, with checkmarks visible.
- **HUD:**
  - Existing score + timer + power-up bar.
  - Current mutator badge (top-center, under timer).
  - Connection-status dot.
  - Reconnect overlay when applicable.
- **End-of-session screen:**
  - Final session standings.
  - "Play another series" → returns everyone to lobby with same room code; round count and mutator pool retained.

---

## 9. Server architecture

### 9.1 New / changed server modules

```
server/
├── index.js            # session:hello flow, color/team selection, series orchestration
├── gameLoop.js         # unchanged
├── gameState.js        # clientId-keyed players, mutator effects, base-tile detection
├── butterfly.js        # tile-aware obstacle bounce
├── powerups.js         # unchanged (respawn rate becomes mutator-dependent)
├── theft.js            # unchanged
├── collision.js        # REWRITTEN as tile-aware; circle obstacle path deprecated
├── matchmaking.js      # KEEPS only the room-code generator; public queue deleted
├── identity.js         # NEW. Maps clientId → { roomCode, slot }. Validates session:hello.
├── series.js           # NEW. Orchestrates the 5-round series + interstitial + standings.
├── mutators.js         # NEW. Mutator definitions, per-round application.
├── procgen/
│   ├── index.js        # generate(seed)
│   ├── rng.js          # seeded mulberry32 + string hash
│   ├── carve.js        # base, river, blocker, path carving
│   └── tiles.js        # cell IDs enum, blocking checks
└── config.js
```

### 9.2 Removed / deprecated

- `server/maps/meadow.js`, `forest.js`, `arena.js`, `index.js`: deleted. Replaced by `procgen/`.
- `lobby:set_map` event and the `mapId` lobby field: removed. Mutator selection takes their place.
- `MAP_FACTORIES` and `resolveMap`: gone.
- `joinQueue`, `leaveQueue` in `matchmaking.js`, plus `queue:join`/`queue:leave` events: deleted. We're 10 friends with a shared room code, not a public queue.

### 9.3 Config

`server/config.js` gains:

```
MAX_PLAYERS: 10,
SPEED_NORMAL: 200,                 // corrected from 500
TILE_SIZE: 32,
MAP_TILES_W: 50,
MAP_TILES_H: 37,
DISCONNECT_HOLD_SEC: 60,           // up from 15
ROUND_DURATION: 180,               // up from 120
SERIES_ROUNDS: 5,
INTERSTITIAL_SEC: 20,
SESSION_AFK_SEC: 60,
```

`MAGNET_RADIUS` should be reviewed — at 500 it's enormous (1/3 of map width). The original spec implies 150. Restore to **150** unless gameplay testing says otherwise.

---

## 10. Build order

Each step is independently shippable; the game stays playable end-to-end after each.

1. **Bump `MAX_PLAYERS` to 10**, fix `SPEED_NORMAL` to 200, fix `MAGNET_RADIUS` to 150, update lobby cap check (`>= 8` → `>= MAX_PLAYERS`). One PR. ½ day.
2. **Identity layer.** `client/identity.js` generates and persists `clientId`. Server `session:hello`. Refactor `gameState.js` to key players by `clientId` instead of `socket.id`. Reconnect not wired yet — just identity plumbing. 1 day.
3. **Reconnect flow.** Full hold-and-replace, `session:resumed` with snapshot, client overlay UI, 60s window. End-to-end test: hard-reload mid-game, verify resume. 1 day.
4. **Tile collision.** Build new `collision.js`, port butterfly bounce, keep existing maps temporarily as tile maps (hand-author one map's tile array to validate). Delete circle obstacle code path. 1–2 days.
5. **Procgen.** Implement `procgen/` modules end-to-end. Replace map registry with `generate(seed)` call at game start. Send `{ seed, cells }` in `game:start`. 2 days.
6. **Sprites + tiles in renderer.** Load tilesheet, draw tile background, load character sprites by color/orientation, replace placeholder circles. 1–2 days.
7. **Color picker, team swap UI.** Lobby UI extensions. ½ day.
8. **Series + mutators.** `series.js` and `mutators.js`. Interstitial UI. Per-round standings tracking. 2 days.
9. **Polish pass.** Connection-status dot, AFK handling, edge cases from §6.5. ½–1 day.
10. **Deploy to Render.** Add `engines.node` to `package.json`, `/health` route, `render.yaml` at repo root. Connect repo in Render dashboard, push to `main`. Smoke-test with 2 browsers from different networks; confirm WebSocket upgrade and cold-start time. ½ day.

Total rough estimate: **10–13 working days** end-to-end for one person. Halve if you cut FFA, fog mutator, AFK polish, and ship with 3 mutators instead of 7.

---

## 11. Operational notes

- **Auto-deploy is a footgun.** Render auto-deploys on push to `main`. A push during a live game kills the running process and ends the session. Either disable auto-deploy in the Render dashboard and deploy manually, or coordinate pushes around sessions.
- **Cold starts.** Tell the group the first joiner may wait ~45s while the service wakes from idle. The lobby screen shows "Waking up the server…" during that wait.
- **No anti-cheat.** Server is authoritative, but we don't validate physics tightly. Friends, not strangers.
- **Asset attribution.** Kenney's Tiny Town is CC0; no attribution required, but `client/assets/kenney/README.txt` should credit kenney.nl anyway.

## 12. Parking lot

Things deliberately not addressed in v2 — write down so we don't lose them:

- **Audio.** No sound effects. Banking chime, theft whoosh, ambient forest loop would help a lot but is a separate art-asset task.
- **Touch / mobile.** v1 spec mentioned a virtual D-pad; v2 doesn't extend it. Players use a real keyboard.
- **Replays / spectator.** Recording a session's ticks and playing back would be charming but isn't budgeted.
- **Custom maps / seed pinning.** A "host can pin a known-good seed" feature is one-line if a favorite map emerges.
- **More mutators.** Big Trail, Trillium Rush, Foggy Meadow are designed but unshipped (see §4.5).
- **FFA mode.** Designed but unshipped.

---

## 13. Tuning constants (single source of truth)

Centralize in `server/config.js`. Client reads its needs from `game:start` and other server events.

| Constant | Value | Notes |
|---|---|---|
| `TICK_RATE` | 20 | unchanged |
| `ROUND_DURATION` | 180 | up from 120 |
| `SERIES_ROUNDS` | 5 | new |
| `INTERSTITIAL_SEC` | 20 | new |
| `MAX_PLAYERS` | 10 | up from 8 |
| `SPEED_NORMAL` | 200 | corrected from 500 |
| `SPEED_MAX_PENALTY` | 0.7 | unchanged |
| `TRAIL_SPACING` | 30 | unchanged |
| `COLLECTION_RADIUS` | 40 | unchanged |
| `THEFT_RADIUS` | 20 | unchanged |
| `BUTTERFLY_SPEED` | 60 | unchanged |
| `BUTTERFLY_TARGET_COUNT` | 30 | unchanged; mutator can override |
| `BUTTERFLY_RESPAWN_DELAY_SEC` | 2 | unchanged |
| `POWERUP_RESPAWN_SEC` | 10 | unchanged; mutator can override |
| `MAGNET_RADIUS` | 150 | corrected from 500 |
| `BASE_IMMUNITY_SEC` | 2 | unchanged |
| `DISCONNECT_HOLD_SEC` | 60 | up from 15 |
| `SESSION_AFK_SEC` | 60 | new |
| `TILE_SIZE` | 32 | new (game units per tile) |
| `MAP_TILES_W` | 50 | new |
| `MAP_TILES_H` | 37 | new |
| `COUNTDOWN_SEC` | 3 | unchanged |
