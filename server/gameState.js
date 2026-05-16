const {
  COLLECTION_RADIUS, SPEED_MAX_PENALTY, TRAIL_SPACING,
  BUTTERFLY_RESPAWN_DELAY_SEC, POWERUP_RESPAWN_SEC, MAGNET_RADIUS,
  BASE_IMMUNITY_SEC, DISCONNECT_HOLD_SEC, TILE_SIZE,
} = require('./config');
const { EFFECT_DURATION, initFlowers, pickRespawnPoint } = require('./powerups');
const butterflyMod = require('./butterfly');
const {
  resolveObstacleSlide, clampToMap, collidesAt,
  onBaseTile, onAnyBaseTile, PLAYER_RADIUS,
} = require('./collision');
const { checkTheft } = require('./theft');

// Spawn positions in front of each team's base, perpendicular-offset across the team.
function spawnPositions(map, team, count) {
  const base = map.bases[team];
  const otherTeam = team === 'A' ? 'B' : 'A';
  const other = map.bases[otherTeam];
  const dx = Math.sign(other.x - base.x) || 1;
  const dy = Math.sign(other.y - base.y) || 0;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 48;
    const px = base.x + dx * 120 - dy * offset;
    const py = base.y + dy * 120 + dx * offset;
    // If the proposed spawn is inside a blocking tile, walk it back toward the base center
    let finalX = px, finalY = py;
    for (let step = 0; step < 8 && collidesAt(finalX, finalY, PLAYER_RADIUS, map); step++) {
      finalX = finalX * 0.8 + base.x * 0.2;
      finalY = finalY * 0.8 + base.y * 0.2;
    }
    positions.push({ x: finalX, y: finalY });
  }
  return positions;
}

function createPlayer(clientId, name, team, color, spawnPos, facingAngle) {
  return {
    clientId,
    socketId: null,
    name,
    team,
    color,
    x: spawnPos.x,
    y: spawnPos.y,
    angle: facingAngle,
    trail: [],
    pathHistory: [],
    powerup: null,
    powerupRemaining: 0,
    shielded: false,
    immuneUntil: 0,
    disconnected: false,
    disconnectAt: null,
    dx: 0,
    dy: 0,
    // round-scoped stats
    roundBanked: 0,
    roundStolen: 0,
    roundLost: 0,
  };
}

class GameRoom {
  constructor(roomCode, players, map, mutator) {
    this.roomCode = roomCode;
    this.map = map;
    this.mutator = mutator;
    this.players = {};          // clientId -> player
    this.butterflies = {};      // id -> butterfly
    this.flowers = {};          // id -> flower
    this.scores = { A: 0, B: 0 };
    this.timeRemaining = mutator.roundDuration;
    this.tick = 0;
    this.respawnQueue = [];
    this.flowerRespawnQueue = [];
    this.phase = 'playing';
    this.io = null;

    const teamA = players.filter(p => p.team === 'A');
    const teamB = players.filter(p => p.team === 'B');
    const posA = spawnPositions(map, 'A', teamA.length);
    const posB = spawnPositions(map, 'B', teamB.length);
    const angleA = Math.atan2(map.bases.B.y - map.bases.A.y, map.bases.B.x - map.bases.A.x);
    const angleB = angleA + Math.PI;

    teamA.forEach((p, i) => {
      const np = createPlayer(p.clientId, p.name, 'A', p.color, posA[i], angleA);
      np.socketId = p.socketId;
      this.players[p.clientId] = np;
    });
    teamB.forEach((p, i) => {
      const np = createPlayer(p.clientId, p.name, 'B', p.color, posB[i], angleB);
      np.socketId = p.socketId;
      this.players[p.clientId] = np;
    });

    for (let i = 0; i < mutator.butterflyTargetCount; i++) {
      const b = butterflyMod.create(this.map);
      this.butterflies[b.id] = b;
    }

    for (const f of initFlowers(this.map)) {
      this.flowers[f.id] = f;
    }
  }

  setIO(io) { this.io = io; }

  applyInputBySocket(socketId, dx, dy) {
    const p = Object.values(this.players).find(x => x.socketId === socketId);
    if (!p || p.disconnected) return;
    p.dx = Math.max(-1, Math.min(1, dx));
    p.dy = Math.max(-1, Math.min(1, dy));
  }

  applyInputByClientId(clientId, dx, dy) {
    const p = this.players[clientId];
    if (!p || p.disconnected) return;
    p.dx = Math.max(-1, Math.min(1, dx));
    p.dy = Math.max(-1, Math.min(1, dy));
  }

  update(dt) {
    if (this.phase !== 'playing') return;
    this.tick++;
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.phase = 'ended';
      return;
    }

    const now = Date.now();

    // Butterfly respawn queue
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      if (now >= this.respawnQueue[i].at) {
        const b = butterflyMod.create(this.map);
        this.butterflies[b.id] = b;
        this.respawnQueue.splice(i, 1);
      }
    }

    // Flower respawn queue
    for (let i = this.flowerRespawnQueue.length - 1; i >= 0; i--) {
      const entry = this.flowerRespawnQueue[i];
      if (now >= entry.at) {
        const f = pickRespawnPoint(Object.values(this.flowers), this.map);
        if (f) {
          this.flowers[f.id] = f;
          if (this.io) {
            this.io.to(this.roomCode).emit('powerup:spawn', {
              id: f.id, type: f.type, position: { x: f.x, y: f.y },
            });
          }
        }
        this.flowerRespawnQueue.splice(i, 1);
      }
    }

    // Reap players whose disconnect-hold expired
    for (const p of Object.values(this.players)) {
      if (p.disconnected && now - p.disconnectAt > DISCONNECT_HOLD_SEC * 1000) {
        if (this.io) this.io.to(this.roomCode).emit('player:left', { clientId: p.clientId, name: p.name });
        delete this.players[p.clientId];
      }
    }

    // Butterfly AI
    for (const b of Object.values(this.butterflies)) {
      butterflyMod.update(b, dt, this.map);
    }

    // Player movement + interactions
    for (const p of Object.values(this.players)) {
      if (p.disconnected) continue;
      this._updatePlayer(p, dt, now);
    }

    // Theft
    const playerList = Object.values(this.players).filter(p => !p.disconnected);
    for (const thief of playerList) {
      for (const victim of playerList) {
        if (thief.clientId === victim.clientId || victim.trail.length === 0) continue;
        const trailPos = this._trailPositions(victim);
        if (checkTheft(thief, victim, trailPos)) {
          const stolen = victim.trail.splice(0);
          thief.trail.push(...stolen);
          victim.roundLost += stolen.length;
          thief.roundStolen += stolen.length;
          if (this.io) {
            this.io.to(this.roomCode).emit('player:stolen', {
              victimId: victim.clientId, thiefId: thief.clientId, count: stolen.length,
            });
          }
        }
      }
    }

    // Top up free butterflies
    const freeCount = Object.keys(this.butterflies).length;
    const pending = this.respawnQueue.length;
    const needed = this.mutator.butterflyTargetCount - freeCount - pending;
    for (let i = 0; i < needed; i++) {
      this.respawnQueue.push({ at: now + BUTTERFLY_RESPAWN_DELAY_SEC * 1000 });
    }
  }

  _updatePlayer(p, dt, now) {
    // Power-up timer
    if (p.powerup) {
      p.powerupRemaining -= dt;
      if (p.powerupRemaining <= 0) {
        p.powerup = null;
        p.powerupRemaining = 0;
        p.shielded = false;
      }
    }

    const mag = Math.sqrt(p.dx * p.dx + p.dy * p.dy);
    if (mag < 0.01) {
      // Still record an idle path-history sample occasionally so trail doesn't snap
      return;
    }

    const ndx = p.dx / mag;
    const ndy = p.dy / mag;

    let speed = this.mutator.speedNormal;
    const trailCount = Math.min(p.trail.length, 15); // cap effective penalty at 15
    if (trailCount >= 10) speed *= SPEED_MAX_PENALTY;
    else if (trailCount > 0) speed *= 1 - (1 - SPEED_MAX_PENALTY) * (trailCount / 10);
    if (p.powerup === 'white_trillium') speed *= 1.5;

    // Magnet (pink trillium) — pull butterflies toward player
    if (p.powerup === 'pink_trillium') {
      const r2 = MAGNET_RADIUS * MAGNET_RADIUS;
      for (const b of Object.values(this.butterflies)) {
        const dxb = p.x - b.x;
        const dyb = p.y - b.y;
        const d2 = dxb * dxb + dyb * dyb;
        if (d2 < r2 && d2 > 1) {
          const d = Math.sqrt(d2);
          const pull = 90 * dt;
          b.x += (dxb / d) * pull;
          b.y += (dyb / d) * pull;
        }
      }
    }

    const nx = p.x + ndx * speed * dt;
    const ny = p.y + ndy * speed * dt;

    const resolved = resolveObstacleSlide(p.x, p.y, nx, ny, PLAYER_RADIUS, this.map);
    const clamped = clampToMap(resolved.x, resolved.y, PLAYER_RADIUS, this.map);
    p.x = clamped.x;
    p.y = clamped.y;
    p.angle = Math.atan2(ndy, ndx);

    p.pathHistory.unshift({ x: p.x, y: p.y });
    const maxHistory = (p.trail.length + 2) * TRAIL_SPACING * 2;
    if (p.pathHistory.length > Math.max(200, maxHistory)) {
      p.pathHistory.length = Math.max(200, maxHistory);
    }

    // Collect butterflies on proximity
    const collectR2 = COLLECTION_RADIUS * COLLECTION_RADIUS;
    for (const [bid, b] of Object.entries(this.butterflies)) {
      if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < collectR2) {
        p.trail.push(b);
        delete this.butterflies[bid];
      }
    }

    // Bank on own-team base tile
    if (onBaseTile(p.x, p.y, p.team, this.map) && p.trail.length > 0) {
      const pts = p.trail.length * this.mutator.pointMultiplier;
      const rawCount = p.trail.length;
      p.trail = [];
      p.pathHistory = [];
      this.scores[p.team] += pts;
      p.roundBanked += rawCount;
      if (this.io) {
        this.io.to(this.roomCode).emit('player:banked', {
          playerId: p.clientId, count: pts, rawCount, teamScore: this.scores[p.team],
        });
      }
    }

    // Immunity on any base tile
    if (onAnyBaseTile(p.x, p.y, this.map)) {
      p.immuneUntil = now + BASE_IMMUNITY_SEC * 1000;
    }

    // Power-up pickup
    for (const [fid, f] of Object.entries(this.flowers)) {
      if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < 40 * 40) {
        p.powerup = f.type;
        p.powerupRemaining = EFFECT_DURATION[f.type];
        p.shielded = f.type === 'red_trillium';
        delete this.flowers[fid];
        if (this.io) {
          this.io.to(this.roomCode).emit('powerup:collected', { id: f.id, playerId: p.clientId });
        }
        this.flowerRespawnQueue.push({ at: now + POWERUP_RESPAWN_SEC * 1000 });
      }
    }
  }

  _trailPositions(player) {
    const positions = [];
    const hist = player.pathHistory;
    for (let i = 0; i < player.trail.length; i++) {
      const targetDist = (i + 1) * TRAIL_SPACING;
      let accumulated = 0;
      let placed = false;
      for (let h = 0; h < hist.length - 1; h++) {
        const segLen = Math.hypot(hist[h + 1].x - hist[h].x, hist[h + 1].y - hist[h].y);
        if (accumulated + segLen >= targetDist) {
          const t = (targetDist - accumulated) / segLen;
          positions.push({
            x: hist[h].x + (hist[h + 1].x - hist[h].x) * t,
            y: hist[h].y + (hist[h + 1].y - hist[h].y) * t,
          });
          placed = true;
          break;
        }
        accumulated += segLen;
      }
      if (!placed) positions.push(hist[hist.length - 1] || { x: player.x, y: player.y });
    }
    return positions;
  }

  getTickState() {
    const players = Object.values(this.players).map(p => ({
      id: p.clientId,
      name: p.name,
      team: p.team,
      color: p.color,
      x: p.x,
      y: p.y,
      angle: p.angle,
      trailLength: p.trail.length,
      trailPositions: this._trailPositions(p),
      powerup: p.powerup,
      powerupRemaining: p.powerupRemaining,
      shielded: p.shielded,
      disconnected: p.disconnected,
    }));
    const butterflies = Object.values(this.butterflies).map(b => ({
      id: b.id, type: b.type, x: b.x, y: b.y,
    }));
    return {
      tick: this.tick,
      players,
      butterflies,
      scores: this.scores,
      timeRemaining: this.timeRemaining,
    };
  }

  // Full snapshot for a resuming reconnect — includes static map + mutator.
  getResumeSnapshot() {
    return {
      map: this.map,
      mutator: { id: this.mutator.id, name: this.mutator.name, description: this.mutator.description },
      teamAssignments: Object.values(this.players).map(p => ({
        clientId: p.clientId, name: p.name, team: p.team, color: p.color,
      })),
      tick: this.getTickState(),
      flowers: Object.values(this.flowers).map(f => ({
        id: f.id, type: f.type, x: f.x, y: f.y,
      })),
    };
  }

  // Per-player round stats — used by series.js for leaderboard.
  getRoundStats() {
    return Object.values(this.players).map(p => ({
      clientId: p.clientId,
      name: p.name,
      team: p.team,
      banked: p.roundBanked,
      stolen: p.roundStolen,
      lost: p.roundLost,
    }));
  }

  playerDisconnect(clientId) {
    const p = this.players[clientId];
    if (!p) return;
    // Drop their trail butterflies as free butterflies near their position
    for (const b of p.trail) {
      b.x = p.x + (Math.random() - 0.5) * 40;
      b.y = p.y + (Math.random() - 0.5) * 40;
      this.butterflies[b.id] = b;
    }
    p.trail = [];
    p.disconnected = true;
    p.disconnectAt = Date.now();
    p.dx = 0;
    p.dy = 0;
    if (this.io) {
      this.io.to(this.roomCode).emit('player:disconnected', {
        clientId: p.clientId,
        holdUntil: p.disconnectAt + DISCONNECT_HOLD_SEC * 1000,
      });
    }
  }

  playerReconnect(clientId, newSocketId) {
    const p = this.players[clientId];
    if (!p || !p.disconnected) return false;
    p.disconnected = false;
    p.disconnectAt = null;
    p.socketId = newSocketId;
    if (this.io) {
      this.io.to(this.roomCode).emit('player:reconnected', { clientId: p.clientId });
    }
    return true;
  }

  // Used when a player is reconnected via session:hello — find by clientId.
  hasClient(clientId) { return !!this.players[clientId]; }
  isHeld(clientId) {
    const p = this.players[clientId];
    return !!(p && p.disconnected);
  }
}

module.exports = { GameRoom };
