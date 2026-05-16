// Cell semantic IDs. Stays small (≤ 256) so the grid fits in a Uint8Array.
// Both server (collision) and client (rendering) read this enum.

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
};

// Cells that block player and butterfly movement.
const BLOCKING = new Set([CELL.WATER, CELL.TREE, CELL.ROCK, CELL.FENCE]);

// Cells walkable by the pathfinder when carving routes between bases.
const PATH_WALKABLE = new Set([CELL.GRASS, CELL.PATH, CELL.BRIDGE, CELL.BASE_A, CELL.BASE_B]);

function isBlocking(cellId) { return BLOCKING.has(cellId); }
function isBase(cellId) { return cellId === CELL.BASE_A || cellId === CELL.BASE_B; }
function isPathWalkable(cellId) { return PATH_WALKABLE.has(cellId); }

module.exports = { CELL, BLOCKING, isBlocking, isBase, isPathWalkable };
