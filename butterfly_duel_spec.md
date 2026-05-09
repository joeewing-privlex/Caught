# Butterfly Duel — Build Specification

A browser-based real-time multiplayer game: two teams of children race across a Pacific Northwest wilderness map collecting butterflies, banking them at home base, and stealing them from opponents.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 Canvas (vanilla JS) |
| Realtime | Node.js + Socket.io |
| Backend | Node.js (Express + Socket.io) |

Single monorepo: `/server` and `/client` folders.

---

## Core Game Mechanics

### Players
- Controls a child character with a butterfly net.
- Input: WASD or Arrow Keys. Virtual D-pad on touch devices.
- Carries unbanked butterflies as a trailing chain behind them (snake-tail style).
- Carrying more butterflies applies a speed penalty: 1.0× at 0, scaling to 0.7× at 10+ butterflies.

### Butterflies
- Wander autonomously with curved, randomized paths. Speed: 60 units/sec. Turn rate: ±90°/sec with gentle noise.
- **Collection radius:** 40 units. Butterfly joins the player's trail on contact.
- Butterflies in a trail are vulnerable to theft (see Stealing).
- **Trail rendering:** each butterfly in the trail follows 30 units behind the previous one, interpolated along the player's path history.
- **Map count:** maintain a target of 30 free butterflies on the map at all times. When a butterfly is banked or the count drops below 30 (e.g. on game start), spawn a new one at a random butterfly spawn zone after a 2-second delay.
- **Obstacle collision:** butterflies bounce off the same static geometry as players. On collision, reflect the butterfly's heading and apply a random ±30° deviation so they don't get trapped.
- Butterfly types and point values:

| Species | Rarity | Points |
|---|---|---|
| Western Tiger Swallowtail (yellow/black) | Common | 1 |
| Painted Lady (orange/brown) | Common | 1 |
| Lorquin's Admiral (dark/orange) | Uncommon | 1 |

### Home Base
- Each team has a base zone (radius 120 units) on opposite sides of the map.
- Entering your own base instantly banks all trailing butterflies and adds their value to the team score.
- Players gain 2 seconds of theft immunity on entering any base zone.

### Trillium Power-Ups

| Flower | Effect | Duration |
|---|---|---|
| White Trillium | Speed burst (1.5×) | 5 sec |
| Pink Trillium | Attract butterflies within 150 units | 6 sec |
| Red Trillium | Shield: trail immune to theft | 5 sec |

- One active power-up per player; new pickup replaces old.
- 8 designated spawn points on the map. Flowers respawn at a random available point 10 seconds after pickup.
- HUD shows active power-up icon + countdown bar.

### Stealing
- **Theft radius:** 20 units. If an opposing player's body passes within 20 units of any butterfly in another player's trail, all of that player's trailing butterflies transfer to the thief's trail.
- The robbed player is not eliminated — they re-collect.
- Red Trillium shield blocks theft entirely.

### Round Timer & Win Condition
- Round duration: **120 seconds**. Visible countdown at all times.
- At 0, game ends. Team with most banked butterfly points wins.
- End screen shows final scores for both teams. Auto-returns to lobby after 10 seconds.

---

## Multiplayer Architecture

### Teams & Lobbies
- **4v4** (max 8 players per game), two teams.
- **Private lobbies:** Host generates a 6-character alphanumeric room code (retry on collision until unique). Up to 8 players join via code. Minimum 2 to start.
  - Only the host can start the game. Once all joined players have sent `game:ready`, the host's client shows a "Start Game" button.
  - On start, server broadcasts a 3-second countdown (`game:countdown`) then `game:start`. If the host disconnects in the lobby, promote the next-joined player to host.
- **Public matchmaking:** Players join a queue; matched when 4+ are waiting. Max wait: 30 seconds, then match with whoever is present (min 2). Teams are assigned by alternating queue order (1st→A, 2nd→B, 3rd→A, …) to balance arrival order randomness.
- **Disconnect during game:** A disconnecting player's trailing butterflies drop to the map as free butterflies at their last position. Their slot is held for 15 seconds; if they reconnect, they rejoin with an empty trail. If they don't, their slot is removed and the game continues short-handed.

### Player Spawn
- On game start, players spawn at fixed positions near their home base (evenly spaced in a row, facing inward).

### Socket.io Events

**Client → Server:**
| Event | Payload |
|---|---|
| `lobby:create` | `{ playerName }` |
| `lobby:join` | `{ roomCode, playerName }` |
| `queue:join` | `{ playerName }` |
| `game:ready` | — |
| `player:input` | `{ dx, dy }` — normalized direction vector, sent at 20hz |

**Server → Client:**
| Event | Payload |
|---|---|
| `lobby:state` | current lobby players + teams |
| `game:start` | `{ mapSeed, teamAssignments, spawnPositions }` |
| `game:tick` | full authoritative state at 20hz (see Game State) |
| `game:end` | `{ scores, winner }` |
| `player:banked` | `{ playerId, count, teamScore }` — for UI feedback |
| `player:stolen` | `{ victimId, thiefId, count }` — for UI feedback |
| `powerup:spawn` | `{ id, type, position }` |
| `powerup:collected` | `{ id, playerId }` |
| `error` | `{ code, message }` |

### Game State (per `game:tick`)
```js
{
  tick: Number,
  players: [{ id, team, x, y, angle, trailLength, powerup, powerupRemaining }],
  butterflies: [{ id, type, x, y }],        // only free butterflies
  scores: { A: Number, B: Number },
  timeRemaining: Number
}
```

### Server-Side Input Validation
On every `player:input`, the server checks:
- `dx` and `dy` are each in `[-1, 1]`; clamp silently if not.
- The resulting position delta does not exceed `SPEED_NORMAL * SPEED_MAX_PENALTY * (1 / TICK_RATE) * 1.2` (20% tolerance for jitter). Discard the input if it exceeds this.
- The new position does not overlap any obstacle. If it does, cancel movement for that axis (slide along the obstacle edge).

### Client Rendering
- Server ticks at 20hz. Client renders at 60fps.
- Interpolate player positions linearly between the two most recent server ticks.
- Server is authoritative; never trust client position data.

---

## Map: Cascade Meadow

- **Logical size:** 1600×1200 units. Camera follows the local player; viewport clips to window size.
- **Obstacles:** Static collidable objects (boulders, tree trunks, stumps). Represented as circles or axis-aligned rectangles in server collision data. Players and butterflies cannot pass through them.
- **Water:** A diagonal stream through the center — impassable except at 3 stepping-stone crossings. Each crossing is **80 units wide** (wide enough for two players to pass without blocking each other).
- **Layout:** Team A base (clearing with ranger sign) on the left; Team B base (stone fire ring) on the right. Contested middle zone has dense butterfly spawns.
- **Butterfly spawn zones:** Concentrated in the center third and slightly into each team's side.
- **Trillium spawn points:** 8 fixed positions spread across the map, avoiding bases and water.
- **Visual decoration** (non-collidable): ferns, mushrooms, pinecones, berry bushes, mossy ground tiles.

---

## Project Structure

```
butterfly-duel/
├── server/
│   ├── index.js           # Express + Socket.io entry, lobby/queue routing
│   ├── gameLoop.js        # Authoritative tick at 20hz, broadcasts game:tick
│   ├── gameState.js       # Per-room state: players, butterflies, scores, timer
│   ├── butterfly.js       # Butterfly wandering AI, proximity collection
│   ├── powerups.js        # Trillium spawn/respawn, effect application
│   ├── theft.js           # Trail theft detection and butterfly transfer
│   ├── collision.js       # Obstacle + base zone collision (static geometry)
│   └── matchmaking.js     # Public queue + private room code generation
├── client/
│   ├── index.html         # Shell + Canvas element
│   ├── main.js            # Socket.io client + game state management
│   ├── input.js           # Keyboard/touch input, sends player:input at 20hz
│   ├── renderer.js        # 60fps Canvas draw loop with interpolation
│   ├── ui.js              # HUD, lobby screen, end screen
│   └── assets/
│       ├── sprites/       # Player (4-dir), butterflies (wing-flap), flowers, map tiles
│       └── sounds/        # Optional: ambient, banking chime, theft whoosh
└── package.json
```

---

## Visual Style

Top-down 2D, warm painterly PNW forest aesthetic.

- **Player sprites:** Child in flannel + boots, 4-directional walk animation. Team A: blue bandana. Team B: red bandana. Name tag above character.
- **Butterfly sprites:** Simple 2-frame wing-flap per species (see species table above).
- **HUD:** Team A score (top-left), Team B score (top-right), timer (top-center), active power-up icon + bar (bottom-center, per local player).

---

## Build Order

1. Server skeleton — Express + Socket.io, room/lobby system, room codes
2. Game loop — authoritative tick, player movement, `game:tick` broadcast
3. Client shell — Canvas renderer connects to server, draws player positions
4. Butterfly AI — wandering movement, collection on proximity, trail rendering
5. Banking mechanic — base zones, score tracking, HUD score display
6. Theft mechanic — trail collision detection, butterfly transfer
7. Trillium power-ups — spawn logic, three effect types, HUD indicator
8. Lobby & matchmaking UI — public queue, room code create/join screens
9. End screen & round reset — win/loss display, auto-return to lobby
10. Art pass — replace placeholder shapes with sprites/tiles
11. Polish — particles, sounds, mobile D-pad, reconnect handling (hold slot 15 sec)

---

## Configuration Constants

Centralize these in `server/config.js`:

| Constant | Value |
|---|---|
| `TICK_RATE` | 20 |
| `ROUND_DURATION` | 120 |
| `MAX_PLAYERS` | 8 |
| `MAP_WIDTH` | 1600 |
| `MAP_HEIGHT` | 1200 |
| `COLLECTION_RADIUS` | 40 |
| `THEFT_RADIUS` | 20 |
| `BASE_RADIUS` | 120 |
| `TRAIL_SPACING` | 30 |
| `SPEED_NORMAL` | 200 |
| `SPEED_MAX_PENALTY` | 0.7 |
| `POWERUP_RESPAWN_SEC` | 10 |
| `BUTTERFLY_SPEED` | 60 |
| `BUTTERFLY_TARGET_COUNT` | 30 |
| `BUTTERFLY_RESPAWN_DELAY_SEC` | 2 |
