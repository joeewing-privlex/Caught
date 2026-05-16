// Tile-grid collision. See spec.md §5.5.

const { TILE_SIZE } = require('./config');
const { isBlocking, isBase, CELL } = require('./tiles');

const PLAYER_RADIUS = 14;
const BUTTERFLY_RADIUS = 6;

function circleOverlapsRect(cx, cy, r, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

function cellAt(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.tilesW || ty >= map.tilesH) return CELL.ROCK; // treat OOB as blocking
  return map.cells[ty * map.tilesW + tx];
}

function collidesAt(x, y, radius, map) {
  const tx0 = Math.floor((x - radius) / TILE_SIZE);
  const ty0 = Math.floor((y - radius) / TILE_SIZE);
  const tx1 = Math.floor((x + radius) / TILE_SIZE);
  const ty1 = Math.floor((y + radius) / TILE_SIZE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const cell = cellAt(map, tx, ty);
      if (!isBlocking(cell)) continue;
      if (circleOverlapsRect(x, y, radius, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)) {
        return true;
      }
    }
  }
  return false;
}

function resolveObstacleSlide(x, y, nx, ny, radius, map) {
  if (!collidesAt(nx, ny, radius, map)) return { x: nx, y: ny };
  if (!collidesAt(nx, y,  radius, map)) return { x: nx, y };
  if (!collidesAt(x,  ny, radius, map)) return { x,  y: ny };
  return { x, y };
}

function clampToMap(x, y, radius, map) {
  return {
    x: Math.max(radius, Math.min(map.width  - radius, x)),
    y: Math.max(radius, Math.min(map.height - radius, y)),
  };
}

// True iff a point is on a tile of the given team's base.
function onBaseTile(x, y, team, map) {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  const cell = cellAt(map, tx, ty);
  if (team === 'A') return cell === CELL.BASE_A;
  if (team === 'B') return cell === CELL.BASE_B;
  return false;
}

function onAnyBaseTile(x, y, map) {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  return isBase(cellAt(map, tx, ty));
}

module.exports = {
  PLAYER_RADIUS,
  BUTTERFLY_RADIUS,
  collidesAt,
  resolveObstacleSlide,
  clampToMap,
  onBaseTile,
  onAnyBaseTile,
};
