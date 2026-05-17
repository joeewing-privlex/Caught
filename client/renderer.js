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
  white_trillium:  '💨',
  pink_trillium:   '🧲',
  red_trillium:    '🛡️',
  yellow_trillium: '👁️',
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

  // Fog of war in screen space — dark mask everywhere except inside the
  // team's vision circles (per teammate, expanded by Yellow Trillium).
  drawFogOfWar(state, camX, camY, W, H);

  // Minimap is drawn in screen space too
  drawMinimap(state, W, H);
}

// Static tile background, baked once per map into an offscreen canvas.
// The map's tile grid never changes after game:start, so the 3-pass tile
// loop only needs to run on the first frame after assets are ready.
let bgCanvas = null;
let bgCanvasMapId = null;

function buildBackgroundCanvas() {
  const sheet = getSheet();
  if (!sheet) return null;
  const tileSize = map.tileSize;
  const tilesW = map.tilesW;
  const tilesH = map.tilesH;
  const cells = map.cells;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;

  // Pass 1: grass base everywhere
  for (let ty = 0; ty < tilesH; ty++) {
    for (let tx = 0; tx < tilesW; tx++) {
      const idx = grassForCell(tx, ty);
      const s = tileSrc(idx);
      octx.drawImage(sheet, s.sx, s.sy, s.sw, s.sh, tx * tileSize, ty * tileSize, tileSize, tileSize);
    }
  }

  // Pass 2: tint base patches so teams are visually obvious (under the marker)
  for (let ty = 0; ty < tilesH; ty++) {
    for (let tx = 0; tx < tilesW; tx++) {
      const cell = cells[ty * tilesW + tx];
      if (cell === CELL.BASE_A) {
        octx.fillStyle = 'rgba(64,128,255,0.35)';
        octx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
      } else if (cell === CELL.BASE_B) {
        octx.fillStyle = 'rgba(255,80,80,0.35)';
        octx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
      }
    }
  }

  // Pass 3: overlay tiles (water, blockers, decor, base markers)
  for (let ty = 0; ty < tilesH; ty++) {
    for (let tx = 0; tx < tilesW; tx++) {
      const cell = cells[ty * tilesW + tx];
      const overlayIdx = overlayForCell(cell, tx, ty);
      if (overlayIdx == null) continue;
      const s = tileSrc(overlayIdx);
      octx.drawImage(sheet, s.sx, s.sy, s.sw, s.sh, tx * tileSize, ty * tileSize, tileSize, tileSize);
    }
  }

  return off;
}

function drawTiles(camX, camY, W, H) {
  const sheet = getSheet();
  const tileSize = map.tileSize;

  if (!sheet) {
    // Fallback before asset load — flat green over the visible region
    const tx0 = Math.max(0, Math.floor(camX / tileSize));
    const ty0 = Math.max(0, Math.floor(camY / tileSize));
    const tx1 = Math.min(map.tilesW - 1, Math.floor((camX + W) / tileSize));
    const ty1 = Math.min(map.tilesH - 1, Math.floor((camY + H) / tileSize));
    ctx.fillStyle = '#3a6e2a';
    ctx.fillRect(tx0 * tileSize, ty0 * tileSize, (tx1 - tx0 + 1) * tileSize, (ty1 - ty0 + 1) * tileSize);
    return;
  }

  // Rebuild the cache once per map.
  const mapId = map.id || 'unknown';
  if (!bgCanvas || bgCanvasMapId !== mapId) {
    bgCanvas = buildBackgroundCanvas();
    bgCanvasMapId = mapId;
  }
  if (!bgCanvas) return;

  // Blit only the visible region from the baked background.
  const sx = Math.max(0, camX);
  const sy = Math.max(0, camY);
  const sw = Math.min(map.width  - sx, W + (camX < 0 ? camX : 0));
  const sh = Math.min(map.height - sy, H + (camY < 0 ? camY : 0));
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(bgCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
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

// ── Fog of War ────────────────────────────────────────────────────────────
//
// Outside the vision radius of every (connected) teammate, the world is
// fully obscured by dark fog. Inside, full visibility. Soft gradient at the
// rim of each circle. Yellow Trillium ("Lookout") doubles the radius.
//
// Implementation: each frame, build a fog mask on an off-screen canvas:
//   1. Fill it solid dark.
//   2. For each teammate, "punch a hole" via destination-out with a radial
//      gradient (fully transparent at center, fading to zero alpha at radius).
//   3. Composite the resulting mask over the main canvas.
//
// Vision radius constants below MUST match server/config.js.

const VISION_RADIUS         = 350;
const VISION_RADIUS_BOOSTED = 700;
const FOG_COLOR             = 'rgba(20, 30, 45, 0.96)';   // near-opaque dark blue

// Reusable off-screen canvas so we don't allocate every frame.
let fogCanvas = null;
let fogCtx = null;

function ensureFogCanvas(W, H) {
  if (!fogCanvas) {
    fogCanvas = document.createElement('canvas');
    fogCtx = fogCanvas.getContext('2d');
  }
  if (fogCanvas.width !== W || fogCanvas.height !== H) {
    fogCanvas.width = W;
    fogCanvas.height = H;
  }
}

function visionRadiusFor(player) {
  return player.powerup === 'yellow_trillium' ? VISION_RADIUS_BOOSTED : VISION_RADIUS;
}

function drawFogOfWar(state, camX, camY, W, H) {
  ensureFogCanvas(W, H);

  // Find local player to know my team
  const me = state.players.find(p => p.id === myId);
  if (!me) {
    // No local player yet — render fully fogged
    ctx.fillStyle = FOG_COLOR;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const myTeamLocal = me.team;

  // Fill fog canvas with dark
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.fillStyle = FOG_COLOR;
  fogCtx.fillRect(0, 0, W, H);

  // Punch a soft hole per connected teammate
  fogCtx.globalCompositeOperation = 'destination-out';
  for (const p of state.players) {
    if (p.disconnected) continue;
    if (p.team !== myTeamLocal) continue;
    const sx = p.x - camX;
    const sy = p.y - camY;
    const r = visionRadiusFor(p);
    // Skip if entirely off-screen (small perf win)
    if (sx + r < 0 || sx - r > W || sy + r < 0 || sy - r > H) continue;

    const grad = fogCtx.createRadialGradient(sx, sy, 0, sx, sy, r);
    grad.addColorStop(0,    'rgba(255,255,255,1.00)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.90, 'rgba(255,255,255,0.40)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    fogCtx.fillStyle = grad;
    fogCtx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  fogCtx.globalCompositeOperation = 'source-over';

  // Composite fog onto main canvas
  ctx.drawImage(fogCanvas, 0, 0);

  // Light ambient tint INSIDE the vision area for PNW mood (subtle)
  ctx.fillStyle = 'rgba(170, 195, 220, 0.05)';
  ctx.fillRect(0, 0, W, H);
}

// Returns true if a world-space point is currently visible to the local team.
// Used by the minimap to fog out distant enemies/butterflies.
function inTeamVision(state, x, y) {
  const me = state.players.find(p => p.id === myId);
  if (!me) return false;
  for (const p of state.players) {
    if (p.disconnected) continue;
    if (p.team !== me.team) continue;
    const r = visionRadiusFor(p);
    if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) <= r * r) return true;
  }
  return false;
}

// ── Minimap ──────────────────────────────────────────────────────────────
//
// Top-right corner. ~180×134 px (matches 50×37 tile aspect). Drawn once per
// frame in screen space. Renders the static tile grid (cached) and overlays
// dots for players + butterflies.

const MINIMAP_W = 180;
const MINIMAP_H = 134;
const MINIMAP_MARGIN = 12;
let minimapCache = null;          // OffscreenCanvas-ish image of static tiles
let minimapCacheMapId = null;

function buildMinimapCache() {
  if (!map) return null;
  const off = document.createElement('canvas');
  off.width = map.tilesW;
  off.height = map.tilesH;
  const octx = off.getContext('2d');
  for (let ty = 0; ty < map.tilesH; ty++) {
    for (let tx = 0; tx < map.tilesW; tx++) {
      const cell = map.cells[ty * map.tilesW + tx];
      octx.fillStyle = miniColorForCell(cell);
      octx.fillRect(tx, ty, 1, 1);
    }
  }
  return off;
}

function miniColorForCell(cell) {
  switch (cell) {
    case CELL.GRASS:   return '#3a6e2a';
    case CELL.PATH:    return '#7a6a4a';
    case CELL.WATER:   return '#3060a0';
    case CELL.BRIDGE:  return '#8a6a3a';
    case CELL.TREE:    return '#1a3a1a';
    case CELL.ROCK:    return '#6a6a6a';
    case CELL.STUMP:   return '#4a3a2a';
    case CELL.BUSH:    return '#4a8030';
    case CELL.FENCE:   return '#a08050';
    case CELL.FLOWER:  return '#d0a0d0';
    case CELL.BASE_A:  return '#4080ff';
    case CELL.BASE_B:  return '#ff4040';
    default: return '#000';
  }
}

function drawMinimap(state, W, H) {
  if (!map) return;
  if (minimapCacheMapId !== (map.id || 'unknown')) {
    minimapCache = buildMinimapCache();
    minimapCacheMapId = map.id || 'unknown';
  }

  const x0 = W - MINIMAP_W - MINIMAP_MARGIN;
  const y0 = MINIMAP_MARGIN;

  // Frame
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x0 - 3, y0 - 3, MINIMAP_W + 6, MINIMAP_H + 6);
  ctx.strokeStyle = 'rgba(168,208,112,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 3, y0 - 3, MINIMAP_W + 6, MINIMAP_H + 6);

  // Static tile cache scaled up
  if (minimapCache) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(minimapCache, x0, y0, MINIMAP_W, MINIMAP_H);
  }

  // Scale factors world → mini
  const sx = MINIMAP_W / map.width;
  const sy = MINIMAP_H / map.height;

  const me = state.players.find(p => p.id === myId);
  const myTeamLocal = me ? me.team : null;

  // Tint the minimap area OUTSIDE current vision so the player can see at a
  // glance what's fogged. Lay down a translucent dark over everything, then
  // "punch holes" via destination-out for each teammate vision circle.
  // We use the main ctx with save/restore.
  ctx.save();
  // Clip to minimap rect
  ctx.beginPath();
  ctx.rect(x0, y0, MINIMAP_W, MINIMAP_H);
  ctx.clip();
  ctx.fillStyle = 'rgba(20, 30, 45, 0.70)';
  ctx.fillRect(x0, y0, MINIMAP_W, MINIMAP_H);
  if (me) {
    ctx.globalCompositeOperation = 'destination-out';
    for (const p of state.players) {
      if (p.disconnected) continue;
      if (p.team !== myTeamLocal) continue;
      const r = visionRadiusFor(p);
      const mx = x0 + p.x * sx;
      const my = y0 + p.y * sy;
      const mr = r * sx;     // scale radius to minimap
      const grad = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      grad.addColorStop(0,    'rgba(255,255,255,1)');
      grad.addColorStop(0.85, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1,    'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  // Free butterflies — only show if inside team vision
  ctx.fillStyle = 'rgba(240,220,80,0.7)';
  for (const b of state.butterflies) {
    if (!inTeamVision(state, b.x, b.y)) continue;
    ctx.fillRect(x0 + b.x * sx - 0.5, y0 + b.y * sy - 0.5, 2, 2);
  }

  // Players: own team always visible; enemies only if in vision
  for (const p of state.players) {
    if (p.disconnected) continue;
    const isMine = p.team === myTeamLocal;
    if (!isMine && !inTeamVision(state, p.x, p.y)) continue;
    const px = x0 + p.x * sx;
    const py = y0 + p.y * sy;
    const isMe = p.id === myId;
    ctx.fillStyle = p.team === 'A' ? '#80b0ff' : '#ff8080';
    ctx.beginPath();
    ctx.arc(px, py, isMe ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = '#ffd060';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
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
