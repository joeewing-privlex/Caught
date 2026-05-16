// Canvas renderer. Loads Kenney tilemap + character sprites, draws a tile grid
// background from server cells, interpolates between server ticks at 60fps.

import { loadTileSheet, getSheet, getTilePx, overlayForCell, grassForCell, tileSrc, CELL, flowerTileFor } from './tiles.js';
import { loadAllSprites, pickSprite } from './sprites.js';

let canvas, ctx;
let prevState = null, currState = null;
let lastTickTime = 0;
let myId = null;
let myTeam = null;
let map = null;             // server-sent map: { width, height, tileSize, tilesW, tilesH, cells, bases }
let rafId = null;
let notifications = [];
let assetsReady = false;

const TEAM_RING_COLOR = { A: '#4080ff', B: '#ff4040' };
const BUTTERFLY_TINT = {
  swallowtail: '#f0d020',
  painted_lady: '#e08030',
  admiral: '#4040a0',
};
const POWERUP_ICONS = {
  white_trillium: '💨',
  pink_trillium: '🧲',
  red_trillium: '🛡️',
};

// Sprite display size in game units (matches PLAYER_RADIUS visually)
const SPRITE_DRAW = 32;

export async function preloadAssets() {
  await Promise.all([loadTileSheet(), loadAllSprites()]);
  assetsReady = true;
}

export function init(canvasEl, mapData, localId, localTeam) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  map = mapData;
  myId = localId;
  myTeam = localTeam;
  resize();
  window.addEventListener('resize', resize);
  prevState = null;
  currState = null;
  notifications = [];
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
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  if (ctx) ctx.imageSmoothingEnabled = false;
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
  if (!state || !map) return;

  const W = canvas.width, H = canvas.height;
  const me = state.players.find(p => p.id === myId);
  const camX = me ? me.x - W / 2 : map.width / 2 - W / 2;
  const camY = me ? me.y - H / 2 : map.height / 2 - H / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-camX, -camY);

  drawTiles(camX, camY, W, H);
  drawFlowers(state);
  drawButterflies(state);
  drawPlayers(state);
  drawNotifications();

  ctx.restore();
}

function drawTiles(camX, camY, W, H) {
  const sheet = getSheet();
  const tileSize = map.tileSize;
  const tilePx = getTilePx();
  const tilesW = map.tilesW;
  const tilesH = map.tilesH;
  const cells = map.cells;

  // Visible tile range
  const tx0 = Math.max(0, Math.floor(camX / tileSize));
  const ty0 = Math.max(0, Math.floor(camY / tileSize));
  const tx1 = Math.min(tilesW - 1, Math.floor((camX + W) / tileSize));
  const ty1 = Math.min(tilesH - 1, Math.floor((camY + H) / tileSize));

  if (!sheet) {
    // Fallback before asset load — flat green
    ctx.fillStyle = '#3a6e2a';
    ctx.fillRect(tx0 * tileSize, ty0 * tileSize, (tx1 - tx0 + 1) * tileSize, (ty1 - ty0 + 1) * tileSize);
    return;
  }

  // Pass 1: grass base everywhere
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const idx = grassForCell(tx, ty);
      const s = tileSrc(idx);
      ctx.drawImage(sheet, s.sx, s.sy, s.sw, s.sh, tx * tileSize, ty * tileSize, tileSize, tileSize);
    }
  }

  // Pass 2: tint base patches so teams are visually obvious (under the marker)
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const cell = cells[ty * tilesW + tx];
      if (cell === CELL.BASE_A) {
        ctx.fillStyle = 'rgba(64,128,255,0.35)';
        ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
      } else if (cell === CELL.BASE_B) {
        ctx.fillStyle = 'rgba(255,80,80,0.35)';
        ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
      }
    }
  }

  // Pass 3: overlay tiles (water, blockers, decor, base markers)
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const cell = cells[ty * tilesW + tx];
      const overlayIdx = overlayForCell(cell, tx, ty);
      if (overlayIdx == null) continue;
      const s = tileSrc(overlayIdx);
      ctx.drawImage(sheet, s.sx, s.sy, s.sw, s.sh, tx * tileSize, ty * tileSize, tileSize, tileSize);
    }
  }
}

function drawFlowers(state) {
  if (!state.flowers) return;
  const sheet = getSheet();
  if (!sheet) return;
  const tileSize = map.tileSize;
  for (const f of state.flowers) {
    const idx = flowerTileFor(f.type);
    const s = tileSrc(idx);
    ctx.drawImage(sheet, s.sx, s.sy, s.sw, s.sh, f.x - tileSize / 2, f.y - tileSize / 2, tileSize, tileSize);
  }
}

function drawButterflies(state) {
  const t = (performance.now() / 300) % 1;
  const wingOpen = t < 0.5;
  for (const b of state.butterflies) {
    const color = BUTTERFLY_TINT[b.type] || '#ffffff';
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

function drawPlayers(state) {
  // Sort by Y for naive depth
  const sorted = [...state.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    // Trail butterflies first (behind player)
    const wingOpen = (performance.now() / 250) % 1 < 0.5;
    const trailColor = TEAM_RING_COLOR[p.team];
    for (const pos of (p.trailPositions || [])) {
      drawButterfly(pos.x, pos.y, trailColor, wingOpen ? 1 : 0.5);
    }

    // Team ring under the sprite (shows team identity)
    const ringColor = TEAM_RING_COLOR[p.team] || '#ffffff';
    ctx.save();
    ctx.translate(p.x, p.y + SPRITE_DRAW / 2 - 4);
    ctx.fillStyle = ringColor;
    ctx.globalAlpha = p.disconnected ? 0.2 : 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0, SPRITE_DRAW * 0.45, SPRITE_DRAW * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Shield aura
    if (p.shielded) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ff4040';
      ctx.beginPath();
      ctx.arc(p.x, p.y, SPRITE_DRAW * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Sprite
    const spr = pickSprite(p.color || 'blue', p.angle || 0);
    ctx.save();
    if (p.disconnected) ctx.globalAlpha = 0.35;
    if (spr.img && spr.img.complete && spr.img.naturalWidth) {
      ctx.translate(p.x, p.y);
      if (spr.flip) ctx.scale(-1, 1);
      ctx.drawImage(spr.img, -SPRITE_DRAW / 2, -SPRITE_DRAW / 2, SPRITE_DRAW, SPRITE_DRAW);
    } else {
      // fallback — colored circle
      ctx.fillStyle = ringColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, SPRITE_DRAW / 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Name + trail count
    const isMe = p.id === myId;
    ctx.fillStyle = isMe ? '#ffd060' : '#f0f0e0';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.font = `${isMe ? 'bold ' : ''}12px Georgia`;
    ctx.textAlign = 'center';
    const label = p.disconnected ? `${p.name} (offline)` : p.name;
    ctx.strokeText(label, p.x, p.y - SPRITE_DRAW / 2 - 4);
    ctx.fillText(label, p.x, p.y - SPRITE_DRAW / 2 - 4);

    if (p.trailLength > 0) {
      ctx.fillStyle = ringColor;
      ctx.font = 'bold 11px Georgia';
      ctx.strokeText(`×${p.trailLength}`, p.x, p.y + SPRITE_DRAW / 2 + 14);
      ctx.fillText(`×${p.trailLength}`, p.x, p.y + SPRITE_DRAW / 2 + 14);
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

export function updateHUD(state, myPowerup, myPowerupRemaining, myPowerupMax) {
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

export function setMutatorBadge(name) {
  document.getElementById('mutator-badge').textContent = name ? `Mutator: ${name}` : '';
}

export function setRoundBadge(roundIndex, totalRounds) {
  document.getElementById('round-badge').textContent = roundIndex ? `Round ${roundIndex} of ${totalRounds}` : '';
}

export function setConnStatus(status) {
  const el = document.getElementById('conn-dot');
  if (!el) return;
  el.classList.remove('warn', 'dead');
  if (status === 'warn') el.classList.add('warn');
  if (status === 'dead') el.classList.add('dead');
}
