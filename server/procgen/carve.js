// Map carving steps. Each operates on the cells Uint8Array in place.
// See spec.md §5.4 for the high-level algorithm.

const { CELL, isBlocking, isPathWalkable } = require('./tiles');

const BASE_PATCH = 5;             // base zone is a 5x5 tile patch
const BASE_PROTECT_RADIUS = 6;    // tiles around base center that stay grass

function idx(tx, ty, w) { return ty * w + tx; }
function inBounds(tx, ty, w, h) { return tx >= 0 && ty >= 0 && tx < w && ty < h; }

function carveBases(cells, w, h) {
  const baseAcx = 4, baseAcy = Math.floor(h / 2);
  const baseBcx = w - 5, baseBcy = Math.floor(h / 2);
  const half = Math.floor(BASE_PATCH / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      cells[idx(baseAcx + dx, baseAcy + dy, w)] = CELL.BASE_A;
      cells[idx(baseBcx + dx, baseBcy + dy, w)] = CELL.BASE_B;
    }
  }
  return {
    A: { tx: baseAcx, ty: baseAcy },
    B: { tx: baseBcx, ty: baseBcy },
  };
}

function nearBase(tx, ty, bases, radius = BASE_PROTECT_RADIUS) {
  for (const b of Object.values(bases)) {
    if (Math.abs(tx - b.tx) <= radius && Math.abs(ty - b.ty) <= radius) return true;
  }
  return false;
}

// Carve a river (~50% chance of running mostly N-S, ~50% mostly E-W) with
// 2-4 bridge tiles. Regenerates if the river encroaches on a base patch.
function carveRiver(cells, w, h, bases, rng) {
  if (!rng.chance(0.5)) return; // 50% of maps have no river

  for (let attempt = 0; attempt < 5; attempt++) {
    const tempCells = new Uint8Array(cells);
    const vertical = rng.chance(0.6);
    const baseX = vertical ? rng.int(15, w - 16) : 0;
    const baseY = vertical ? 0 : rng.int(10, h - 11);
    const length = vertical ? h : w;
    const width = rng.int(2, 3);
    const trace = [];

    let drift = 0;
    let lastDrift = 0;
    for (let i = 0; i < length; i++) {
      drift += rng.int(-1, 1);
      drift = Math.max(-6, Math.min(6, drift));
      const dxStep = vertical ? drift - lastDrift : 1;
      const dyStep = vertical ? 1            : drift - lastDrift;
      lastDrift = drift;
      const tx = vertical ? baseX + drift : i;
      const ty = vertical ? i             : baseY + drift;
      trace.push({ tx, ty, dxStep, dyStep });
      for (let dwx = 0; dwx < width; dwx++) {
        for (let dwy = 0; dwy < width; dwy++) {
          const px = vertical ? tx + dwx : tx;
          const py = vertical ? ty       : ty + dwy;
          if (inBounds(px, py, w, h)) tempCells[idx(px, py, w)] = CELL.WATER;
        }
      }
    }

    // Validate: river must not touch base patches
    let touchesBase = false;
    for (const b of Object.values(bases)) {
      const half = Math.floor(BASE_PATCH / 2);
      for (let dy = -half - 1; dy <= half + 1 && !touchesBase; dy++) {
        for (let dx = -half - 1; dx <= half + 1 && !touchesBase; dx++) {
          if (inBounds(b.tx + dx, b.ty + dy, w, h) && tempCells[idx(b.tx + dx, b.ty + dy, w)] === CELL.WATER) {
            touchesBase = true;
          }
        }
      }
    }
    if (touchesBase) continue;

    // Place 2-4 bridges. Spread across the river length.
    const bridgeCount = rng.int(2, 4);
    const bridgePositions = [];
    for (let bi = 0; bi < bridgeCount; bi++) {
      const segLo = Math.floor((bi + 0.2) * length / bridgeCount);
      const segHi = Math.floor((bi + 0.8) * length / bridgeCount);
      const pick = rng.int(segLo, segHi);
      bridgePositions.push(pick);
    }
    for (const i of bridgePositions) {
      const t = trace[i];
      if (!t) continue;
      for (let dwx = 0; dwx < width; dwx++) {
        for (let dwy = 0; dwy < width; dwy++) {
          const px = vertical ? t.tx + dwx : t.tx;
          const py = vertical ? t.ty       : t.ty + dwy;
          if (inBounds(px, py, w, h)) tempCells[idx(px, py, w)] = CELL.BRIDGE;
        }
      }
    }

    // Commit
    cells.set(tempCells);
    return;
  }
  // Gave up on the river; ship without one.
}

function scatterBlockingClusters(cells, w, h, bases, rng) {
  const seedCount = rng.int(20, 30);
  for (let s = 0; s < seedCount; s++) {
    const cx = rng.int(2, w - 3);
    const cy = rng.int(2, h - 3);
    if (nearBase(cx, cy, bases)) continue;

    const kind = rng.pick([CELL.TREE, CELL.TREE, CELL.ROCK, CELL.FENCE]);

    if (kind === CELL.FENCE) {
      // Fence: short straight run, 2-5 tiles
      const horiz = rng.chance(0.5);
      const len = rng.int(2, 5);
      for (let i = 0; i < len; i++) {
        const tx = cx + (horiz ? i : 0);
        const ty = cy + (horiz ? 0 : i);
        if (!inBounds(tx, ty, w, h)) continue;
        if (nearBase(tx, ty, bases, BASE_PROTECT_RADIUS - 1)) continue;
        const c = cells[idx(tx, ty, w)];
        if (c === CELL.GRASS) cells[idx(tx, ty, w)] = CELL.FENCE;
      }
    } else {
      // Blob: 1-4 tiles in a small cluster
      const blobSize = rng.int(1, 4);
      const placed = new Set();
      const queue = [{ tx: cx, ty: cy }];
      placed.add(`${cx},${cy}`);
      while (queue.length && placed.size < blobSize) {
        const { tx, ty } = queue.shift();
        if (!inBounds(tx, ty, w, h)) continue;
        if (nearBase(tx, ty, bases, BASE_PROTECT_RADIUS - 1)) continue;
        if (cells[idx(tx, ty, w)] !== CELL.GRASS) continue;
        cells[idx(tx, ty, w)] = kind;
        for (const [ndx, ndy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${tx + ndx},${ty + ndy}`;
          if (!placed.has(k)) {
            placed.add(k);
            queue.push({ tx: tx + ndx, ty: ty + ndy });
          }
        }
      }
    }
  }
}

// A* from start to goal. Returns array of {tx,ty} or null.
function findPath(cells, w, h, start, goal) {
  const key = (tx, ty) => ty * w + tx;
  const open = new Map(); // key -> { tx, ty, g, f, parent }
  const closed = new Set();
  const startNode = { tx: start.tx, ty: start.ty, g: 0, f: 0, parent: null };
  startNode.f = Math.abs(start.tx - goal.tx) + Math.abs(start.ty - goal.ty);
  open.set(key(start.tx, start.ty), startNode);

  while (open.size) {
    // Find min f. Linear scan is fine for 50×37.
    let bestKey = null, best = null;
    for (const [k, n] of open) {
      if (!best || n.f < best.f) { best = n; bestKey = k; }
    }
    if (best.tx === goal.tx && best.ty === goal.ty) {
      const path = [];
      let cur = best;
      while (cur) { path.push({ tx: cur.tx, ty: cur.ty }); cur = cur.parent; }
      path.reverse();
      return path;
    }
    open.delete(bestKey);
    closed.add(bestKey);

    for (const [ndx, ndy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = best.tx + ndx, ny = best.ty + ndy;
      if (!inBounds(nx, ny, w, h)) continue;
      const nkey = key(nx, ny);
      if (closed.has(nkey)) continue;
      const cellId = cells[idx(nx, ny, w)];
      if (!isPathWalkable(cellId)) continue;
      const g = best.g + 1;
      const existing = open.get(nkey);
      if (existing && existing.g <= g) continue;
      const heur = Math.abs(nx - goal.tx) + Math.abs(ny - goal.ty);
      open.set(nkey, { tx: nx, ty: ny, g, f: g + heur, parent: best });
    }
  }
  return null;
}

// Carve a path between the two bases. Returns the path length, or null if no path.
function carvePath(cells, w, h, bases) {
  const path = findPath(cells, w, h, bases.A, bases.B);
  if (!path) return null;
  for (const { tx, ty } of path) {
    const cur = cells[idx(tx, ty, w)];
    // Don't overwrite bases or water (water shouldn't appear in a walkable path anyway)
    if (cur === CELL.GRASS) cells[idx(tx, ty, w)] = CELL.PATH;
  }
  return path.length;
}

function scatterDecor(cells, w, h, rng) {
  const count = rng.int(15, 30);
  for (let i = 0; i < count; i++) {
    const tx = rng.int(0, w - 1);
    const ty = rng.int(0, h - 1);
    if (cells[idx(tx, ty, w)] === CELL.GRASS) cells[idx(tx, ty, w)] = CELL.BUSH;
  }
}

function placePowerupSpawns(cells, w, h, bases, rng) {
  // Divide the map into a 4x2 grid; one spawn per cell.
  const cols = 4, rows = 2;
  const cellW = Math.floor(w / cols);
  const cellH = Math.floor(h / rows);
  const spawns = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * cellW + 2;
      const y0 = cy * cellH + 2;
      const x1 = Math.min(w - 2, (cx + 1) * cellW - 2);
      const y1 = Math.min(h - 2, (cy + 1) * cellH - 2);
      for (let attempt = 0; attempt < 30; attempt++) {
        const tx = rng.int(x0, x1);
        const ty = rng.int(y0, y1);
        if (nearBase(tx, ty, bases, 7)) continue;
        const c = cells[idx(tx, ty, w)];
        if (c === CELL.GRASS || c === CELL.PATH || c === CELL.BUSH) {
          spawns.push({ tx, ty });
          break;
        }
      }
    }
  }
  return spawns;
}

function deriveButterflyZones(w, h) {
  return [
    { tx: 20, ty: 12, w: 10, h: 13 },   // center band
    { tx: 12, ty: 16, w: 6,  h: 6  },   // left mid
    { tx: 32, ty: 16, w: 6,  h: 6  },   // right mid
  ];
}

module.exports = {
  BASE_PATCH,
  carveBases,
  carveRiver,
  scatterBlockingClusters,
  carvePath,
  scatterDecor,
  placePowerupSpawns,
  deriveButterflyZones,
  findPath,
};
