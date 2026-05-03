// Canvas renderer — 60fps draw loop with linear interpolation between server ticks

const MAP_W = 16000, MAP_H = 12000;
const PLAYER_RADIUS = 16;
const BUTTERFLY_RADIUS = 8;
const FLOWER_RADIUS = 12;
const BASE_RADIUS = 120;
const TRAIL_SPACING = 30;

let canvas, ctx;
let prevState = null, currState = null;
let lastTickTime = 0;
let myId = null;
let myTeam = null;
let obstacles = [];
let stream = { halfWidth: 48, crossingYs: [200, 600, 1000], crossingHalfHeight: 60 };
let bases = {};
let rafId = null;
let notifications = []; // { text, x, y, color, born }

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

export function init(canvasEl, obstacleData, streamData, baseData, localId, localTeam) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  obstacles = obstacleData || [];
  if (streamData) stream = streamData;
  bases = baseData || {};
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

  // Camera: follow local player
  const me = state.players.find(p => p.id === myId);
  const camX = me ? me.x - W / 2 : MAP_W / 2 - W / 2;
  const camY = me ? me.y - H / 2 : MAP_H / 2 - H / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-camX, -camY);

  drawMap();
  drawObstacles();
  drawBases();
  drawFlowers(state);
  drawButterflies(state);
  drawPlayers(state, me);
  drawNotifications(camX, camY);

  ctx.restore();
}

function drawMap() {
  // Ground 3a6e2a
  ctx.fillStyle = '#00eeff';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Decorative patches (deterministic from fixed seeds) 2e5e22
  ctx.fillStyle = '#ff0000';
  for (let i = 0; i < 60; i++) {
    const x = ((i * 271) % MAP_W);
    const y = ((i * 173) % MAP_H);
    ctx.beginPath();
    ctx.ellipse(x, y, 30 + (i % 4) * 10, 20 + (i % 3) * 8, (i * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  // Stream — drawn as a continuous diagonal band with crossing gaps
  const sw = stream.halfWidth;
  const crossYs = stream.crossingYs;
  const crossH  = stream.crossingHalfHeight;
  ctx.fillStyle = '#3060a0';
  ctx.globalAlpha = 0.75;
  for (let y = 0; y < MAP_H; y += 4) {
    if (crossYs.some(cy => Math.abs(y - cy) < crossH)) continue;
    const cx = 600 + (y / MAP_H) * 400;
    ctx.fillRect(cx - sw, y, sw * 2, 5);
  }
  ctx.globalAlpha = 1;

  // Stepping stones at crossings
  ctx.fillStyle = '#8090a0';
  for (const cy of crossYs) {
    const cx = 600 + (cy / MAP_H) * 400;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + i * 24, cy, 16, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawObstacles() {
  for (const obs of obstacles) {
    if (obs.type === 'circle') {
      // Boulder / tree trunk
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
    // Label
    ctx.fillStyle = color;
    ctx.font = 'bold 14px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(`Team ${team} Base`, base.x, base.y - BASE_RADIUS - 8);
  }
}

function drawFlowers(state) {
  // Flowers come via powerup:spawn events tracked in main.js and passed here via state extension
  if (!state.flowers) return;
  for (const f of state.flowers) {
    const color = POWERUP_COLORS[f.type] || '#ffffff';
    // Draw simple trillium shape
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
    // Center
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
  // Two wings
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
  ctx.ellipse(0, 0, 2, 5, 0, 0, Math.PI * 2); // body
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPlayers(state, me) {
  for (const p of state.players) {
    if (p.disconnected) continue;
    const isMe = p.id === myId;
    const color = TEAM_COLOR[p.team];

    // Draw trail butterflies
    const wingOpen = (performance.now() / 250) % 1 < 0.5;
    for (const pos of (p.trailPositions || [])) {
      drawButterfly(pos.x, pos.y, color, wingOpen ? 1 : 0.5);
    }

    // Shield aura
    if (p.shielded) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ff4040';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Player body
    ctx.save();
    ctx.translate(p.x, p.y);

    // Body circle
    ctx.fillStyle = isMe ? '#ffffff' : color;
    ctx.globalAlpha = isMe ? 1 : 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Team bandana dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    // Net direction indicator
    ctx.strokeStyle = '#f0e8d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(p.angle) * 22, Math.sin(p.angle) * 22);
    ctx.stroke();

    ctx.restore();

    // Name tag
    ctx.fillStyle = '#f0f0e0';
    ctx.font = `${isMe ? 'bold ' : ''}11px Georgia`;
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - PLAYER_RADIUS - 6);

    // Trail count badge
    if (p.trailLength > 0) {
      ctx.fillStyle = color;
      ctx.font = 'bold 10px Georgia';
      ctx.fillText(`×${p.trailLength}`, p.x, p.y + PLAYER_RADIUS + 14);
    }
  }
}

function drawNotifications(camX, camY) {
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
