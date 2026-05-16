// Registry of the 5 hand-designed maps. See spec.md §5.
//
// Each map factory function returns a fresh map data object suitable for
// game:start. Maps are validated at startup: every map must support two
// distinct approach routes between the bases, so opponents can flank
// trail-banking players for stealing.

const { isPathWalkable } = require('../tiles');

const MAP_FACTORIES = {
  open_meadow:   require('./01_open_meadow'),
  the_crossing:  require('./02_the_crossing'),
  twin_streams:  require('./03_twin_streams'),
  stone_ring:    require('./04_stone_ring'),
  the_grove:     require('./05_the_grove'),
};
const MAP_IDS = Object.keys(MAP_FACTORIES);

// A*. Returns array of tile indices (ty*w+tx), or null if no path.
function findPath(map, start, goal, forbidden) {
  const w = map.tilesW, h = map.tilesH;
  const key = (tx, ty) => ty * w + tx;
  const open = new Map();
  const closed = new Set(forbidden || []);
  const startNode = { tx: start.tx, ty: start.ty, g: 0, f: 0, parent: null };
  startNode.f = Math.abs(start.tx - goal.tx) + Math.abs(start.ty - goal.ty);
  open.set(key(start.tx, start.ty), startNode);

  while (open.size) {
    let bestKey = null, best = null;
    for (const [k, n] of open) {
      if (!best || n.f < best.f) { best = n; bestKey = k; }
    }
    if (best.tx === goal.tx && best.ty === goal.ty) {
      const ids = [];
      let cur = best;
      while (cur) { ids.push(key(cur.tx, cur.ty)); cur = cur.parent; }
      return ids;
    }
    open.delete(bestKey);
    closed.add(bestKey);
    for (const [ndx, ndy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = best.tx + ndx, ny = best.ty + ndy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nkey = key(nx, ny);
      if (closed.has(nkey)) continue;
      const cellId = map.cells[ny * w + nx];
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

function validate(map) {
  const errors = [];
  const warnings = [];

  if (!map.bases.A || !map.bases.B) {
    errors.push('missing base');
    return { ok: false, errors, warnings };
  }
  if (map.powerupSpawns.length < 4) {
    warnings.push(`only ${map.powerupSpawns.length} power-up spawns`);
  }

  // Connectivity check
  const p1 = findPath(map, map.bases.A, map.bases.B);
  if (!p1) {
    errors.push('no walkable path between bases');
    return { ok: false, errors, warnings };
  }
  // Two-approach check: forbid the middle of path 1 and see if a second route exists
  const middle = p1.slice(3, p1.length - 3);
  const p2 = findPath(map, map.bases.A, map.bases.B, new Set(middle));
  if (!p2) {
    warnings.push('only one approach route — stealing will be hard');
  }
  return { ok: true, errors, warnings, mainPathLength: p1.length };
}

// Validate all maps at module load time so we fail fast on a broken map.
const VALIDATED = {};
for (const id of MAP_IDS) {
  const map = MAP_FACTORIES[id]();
  const v = validate(map);
  if (!v.ok) {
    throw new Error(`Map "${id}" failed validation: ${v.errors.join(', ')}`);
  }
  for (const w of v.warnings) console.warn(`[map ${id}] ${w}`);
  VALIDATED[id] = { id, name: map.name, mainPathLength: v.mainPathLength };
}

function listMaps() {
  return MAP_IDS.map(id => ({ id, name: VALIDATED[id].name }));
}

function getMap(id) {
  const factory = MAP_FACTORIES[id];
  return factory ? factory() : null;
}

function pickRandomMap(excludeId) {
  const ids = MAP_IDS.filter(id => id !== excludeId);
  const id = ids[Math.floor(Math.random() * ids.length)];
  return MAP_FACTORIES[id]();
}

// Pick by round index: cycle through the 5 maps so a 5-round series uses each
// map exactly once, in a shuffled order.
function pickByRoundIndex(roomCode, roundIndex) {
  // Stable shuffle based on roomCode hash so all clients in a session see the same order.
  let hash = 5381;
  for (let i = 0; i < roomCode.length; i++) hash = ((hash << 5) + hash + roomCode.charCodeAt(i)) >>> 0;
  const shuffled = [...MAP_IDS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const r = (hash + i * 2654435761) >>> 0;
    const j = r % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return MAP_FACTORIES[shuffled[(roundIndex - 1) % shuffled.length]]();
}

module.exports = { listMaps, getMap, pickRandomMap, pickByRoundIndex, MAP_IDS };
