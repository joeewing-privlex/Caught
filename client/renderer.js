// Canvas renderer — 60fps draw loop with linear interpolation between server ticks.
// Map dimensions, obstacles, stream geometry, and bases all come from the server's
// game:start payload — nothing here is hardcoded per-map.

const PLAYER_RADIUS = 16;
const FLOWER_RADIUS = 12;
const BASE_RADIUS = 120;

let canvas, ctx;
let prevState = null, currState = null;
let lastTickTime = 0;
let myId = null;
let myTeam = null;
let mapWidth = 1600;
let mapHeight = 1200;
let obstacles = [];
let stream = null;       // null when the map has no stream
let bases = {};
let rafId = null;
let notifications = [];

const TEAM_COLOR = { A: '#4080ff', B: '#ff4040' };
const BUTTERFLY_COLORS = {
  swallowtail: '#f0d020',
  painted_lady: '#e08030',
  admiral: '#4040a0',
};
const POWERUP_COLORS = {
  white_trillium: '#ffffff',
  pink_trillium: '#ff80c0',
  red_trillium: '#ff4040',
};
const POWERUP_ICONS = {
  white_trillium: '💨',
  pink_trillium: '🧲',
  red_trillium: '🛡️',
};

export function init(canvasEl, mapData, localId, localTeam) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  mapWidth = mapData.width;
  mapHeight = mapData.height;
  obstacles = mapData.obstacles || [];
  stream = mapData.stream || null;
  bases = mapData.bases || {};
  myId = localId;
  myTeam = localTeam;
  resize();
  window.addEventListener('resize', resize);
}

export function pushState(state) {
  prevState = currState;
  currState = state;
  lastTickTime = performance.now();
}

export function pushNotification(text, x, y, color) {
  notifications.push({ text, x, y, color: color || '#ffffff', born: performance.now() });
}

export function start() {
  if (rafId) return;
  loop();
}

export function stop() {
  cancelAnimationFrame(rafId);
  rafId = null;
  prevState = null;
  currState = null;
}

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function interpState() {
  if (!currState) return null;
  if (!prevState) return currState;
  const now = performance.now();
  const tickMs = 1000 / 20;
  const t = Math.min(1, (now - lastTickTime) / tickMs);

  const players = currState.players.map(cp => {
    const pp = prevState.players.find(p => p.id === cp.id);
    if (!pp) return cp;
    return {
      ...cp,
      x: lerp(pp.x, cp.x, t),
      y: lerp(pp.y, cp.y, t),
      trailPositions: cp.trailPositions.map((tp, i) => {
        const prev = pp.trailPositions && pp.trailPositions[i];
        if (!prev) return tp;
        return { x: lerp(prev.x, tp.x, t), y: lerp(prev.y, tp.y, t) };
      }),
    };
  });

  const butterflies = currState.butterflies.map(cb => {
    const pb = prevState.butterflies.find(b => b.id === cb.id);
    if (!pb) return cb;
    return { ...cb, x: lerp(pb.x, cb.x, t), y: lerp(pb.y, cb.y, t) };
  });

  return { ...currState, players, butterflies };
}

function loop() {
  rafId = requestAnimationFrame(loop);
  const state = interpState();
  if (!state) return;

  const W = canvas.width, H = canvas.height;

  const me = state.players.find(p => p.id === myId);
  const camX = me ? me.x - W / 2 : mapWidth / 2 - W / 2;
  const camY = me ? me.y - H / 2 : mapHeight / 2 - H / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-camX, -camY);

  drawMap();
  drawObstacles();
  drawBases();
  drawFlowers(state);
  drawButterflies(state);
  drawPlayers(state, me);
  drawNotifications();

  ctx.restore();
}

function drawMap() {
  // Ground
  ctx.fillStyle = '#3a6e2a';
  ctx.fillRect(0, 0, mapWidth, mapHeight);

  // Decorative patches (deterministic from fixed seeds)
  ctx.fillStyle = '#2e5e22';
  for (let i = 0; i < 60; i++) {
    const x = ((i * 271) % mapWidth);
    const y = ((i * 173) % mapHeight);
    ctx.beginPath();
    ctx.ellipse(x, y, 30 + (i % 4) * 10, 20 + (i % 3) * 8, (i * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  if (stream) drawStream();
}

function drawStream() {
  const dx = stream.endX - stream.startX;
  const dy = stream.endY - stream.startY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len, uy = dy / len;          // unit along stream
  const px = -uy, py = ux;                     // unit perpendicular
  const sw = stream.halfWidth;
  const crossings = stream.crossings || [];

  // Draw the band as small quads stepped along the segment, skipping crossings.
  ctx.fillStyle = '#3060a0';
  ctx.globalAlpha = 0.75;
  const step = 4;
  for (let s = 0; s < len; s += step) {
    const t = s / len;
    if (crossings.some(c => Math.abs(t - c.t) * len < c.halfLen)) continue;
    const cx = stream.startX + ux * s;
    const cy = stream.startY + uy * s;
    // Quad of width 2*sw perpendicular to stream, length `step+1` along stream.
    ctx.beginPath();
    const a = step + 1;
    const x1 = cx + px * sw,            y1 = cy + py * sw;
    const x2 = cx - px * sw,            y2 = cy - py * sw;
    const x3 = cx - px * sw + ux * a,   y3 = cy - py * sw + uy * a;
    const x4 = cx + px * sw + ux * a,   y4 = cy + py * sw + uy * a;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Stepping stones at each crossing centre
  ctx.fillStyle = '#8090a0';
  for (const c of crossings) {
    const cx = stream.startX + ux * (c.t * len);
    const cy = stream.startY + uy * (c.t * len);
    for (let i = -1; i <= 1; i++) {
      const sx = cx + ux * i * 24;
      const sy = cy + uy * i * 24;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 16, 11, Math.atan2(uy, ux), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawObstacles() {
  for (const obs of obstacles) {
    if (obs.type === 'circle') {
      ctx.fillStyle = obs.r > 35 ? '#706050' : '#5a7040';
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = obs.r > 35 ? '#504030' : '#405030';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawBases() {
  for (const [team, base] of Object.entries(bases)) {
    const color = TEAM_COLOR[team];
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(base.x, base.y, BASE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(base.x, base.y, BASE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = 'bold 14px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(`Team ${team} Base`, base.x, base.y - BASE_RADIUS - 8);
  }
}

function drawFlowers(state) {
  if (!state.flowers) return;
  for (const f of state.flowers) {
    const color = POWERUP_COLORS[f.type] || '#ffffff';
    ctx.save();
    ctx.translate(f.x, f.y);
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(0, -FLOWER_RADIUS, 7, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffff80';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawButterflies(state) {
  const t = (performance.now() / 300) % 1;
  const wingOpen = t < 0.5;
  for (const b of state.butterflies) {
    const color = BUTTERFLY_COLORS[b.type] || '#ffffff';
    drawButterfly(b.x, b.y, color, wingOpen ? 1 : 0.5);
  }
}

function drawButterfly(x, y, color, wingScale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side * wingScale, 1);
    ctx.beginPath();
    ctx.ellipse(6, 0, 7, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 0, 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPlayers(state, me) {
  for (const p of state.players) {
    if (p.disconnected) continue;
    const isMe = p.id === myId;
    const color = TEAM_COLOR[p.team];

    const wingOpen = (performance.now() / 250) % 1 < 0.5;
    for (const pos of (p.trailPositions || [])) {
      drawButterfly(pos.x, pos.y, color, wingOpen ? 1 : 0.5);
    }

    if (p.shielded) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ff4040';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.fillStyle = isMe ? '#ffffff' : color;
    ctx.globalAlpha = isMe ? 1 : 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f0e8d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(p.angle) * 22, Math.sin(p.angle) * 22);
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = '#f0f0e0';
    ctx.font = `${isMe ? 'bold ' : ''}11px Georgia`;
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - PLAYER_RADIUS - 6);

    if (p.trailLength > 0) {
      ctx.fillStyle = color;
      ctx.font = 'bold 10px Georgia';
      ctx.fillText(`×${p.trailLength}`, p.x, p.y + PLAYER_RADIUS + 14);
    }
  }
}

function drawNotifications() {
  const now = performance.now();
  notifications = notifications.filter(n => now - n.born < 1500);
  for (const n of notifications) {
    const age = (now - n.born) / 1500;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = n.color;
    ctx.font = 'bold 14px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(n.text, n.x, n.y - age * 40);
  }
  ctx.globalAlpha = 1;
}

export function updateHUD(state, myTeam, myPowerup, myPowerupRemaining, myPowerupMax) {
  document.getElementById('score-a-val').textContent = state.scores.A;
  document.getElementById('score-b-val').textContent = state.scores.B;

  const s = Math.ceil(state.timeRemaining);
  const m = Math.floor(s / 60);
  document.getElementById('timer').textContent = `${m}:${String(s % 60).padStart(2, '0')}`;

  const pHud = document.getElementById('powerup-hud');
  if (myPowerup) {
    pHud.style.display = 'flex';
    document.getElementById('powerup-icon').textContent = POWERUP_ICONS[myPowerup] || '?';
    const pct = Math.max(0, myPowerupRemaining / myPowerupMax) * 100;
    document.getElementById('powerup-bar').style.width = pct + '%';
  } else {
    pHud.style.display = 'none';
  }
}
