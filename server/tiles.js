// Cell semantic IDs. Shared by the server (collision, map loader) and the
// client (renderer). KEEP IN SYNC with client/tiles.js.
//
// Each cell is one of these IDs (one byte). The map's `cells` array is an
// array of 50×37 = 1850 entries.
//
// ── Obstacle decision ──────────────────────────────────────────────────────
//
// BLOCKING cells stop players and butterflies. The collision pass uses a
// circle-vs-AABB check against any blocking tile.
//
//   blocking     →  WATER, TREE, ROCK, FENCE, STUMP
//   passable     →  GRASS, PATH, BRIDGE, BUSH, FLOWER, BASE_A, BASE_B
//
// Rationale:
//   - WATER must be crossed via BRIDGE — creates chokepoints for stealing.
//   - TREE and ROCK are visually obvious blockers.
//   - FENCE blocks but is thin — used to channel movement on a few maps.
//   - STUMP added to give more visual variety for "small" blockers.
//   - BUSH is waist-high — characters walk through visually; doesn't block.
//   - FLOWER is decor only, no block.
//   - PATH and BRIDGE are visual cues for safe corridors; same speed as grass.
//   - BASE_X cells are walkable AND trigger banking for the owning team.

const CELL = {
  GRASS:   0,
  PATH:    1,
  WATER:   2,
  BRIDGE:  3,
  TREE:    4,
  ROCK:    5,
  BUSH:    6,
  FENCE:   7,
  BASE_A:  8,
  BASE_B:  9,
  FLOWER:  10,    // decorative wildflower in grass — no block
  STUMP:   11,    // small blocker
};

const BLOCKING   = new Set([CELL.WATER, CELL.TREE, CELL.ROCK, CELL.FENCE, CELL.STUMP]);
const PASSABLE   = new Set([CELL.GRASS, CELL.PATH, CELL.BRIDGE, CELL.BUSH, CELL.FLOWER, CELL.BASE_A, CELL.BASE_B]);

// Cells the pathfinder can walk when validating connectivity between bases.
// (We don't pathfind through bridges over water automatically — bridges have
// their own bridge cell already, so they're walkable.)
const PATH_WALKABLE = new Set([CELL.GRASS, CELL.PATH, CELL.BRIDGE, CELL.BUSH, CELL.FLOWER, CELL.BASE_A, CELL.BASE_B]);

function isBlocking(cellId) { return BLOCKING.has(cellId); }
function isPassable(cellId) { return PASSABLE.has(cellId); }
function isBase(cellId)     { return cellId === CELL.BASE_A || cellId === CELL.BASE_B; }
function isPathWalkable(cellId) { return PATH_WALKABLE.has(cellId); }

module.exports = { CELL, BLOCKING, PASSABLE, isBlocking, isPassable, isBase, isPathWalkable };
