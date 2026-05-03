const { MAP_WIDTH, MAP_HEIGHT } = require('./config');

const PLAYER_RADIUS = 16;

// Circular obstacles only — no stream rects
const OBSTACLES = [
  { type: 'circle', x: 400,  y: 300,  r: 45 },
  { type: 'circle', x: 1200, y: 300,  r: 45 },
  { type: 'circle', x: 400,  y: 900,  r: 45 },
  { type: 'circle', x: 1200, y: 900,  r: 45 },
  { type: 'circle', x: 700,  y: 250,  r: 35 },
  { type: 'circle', x: 900,  y: 950,  r: 35 },
  { type: 'circle', x: 520,  y: 600,  r: 30 },
  { type: 'circle', x: 1080, y: 600,  r: 30 },
  { type: 'circle', x: 310,  y: 490,  r: 25 },
  { type: 'circle', x: 1290, y: 710,  r: 25 },
  { type: 'circle', x: 660,  y: 720,  r: 25 },
  { type: 'circle', x: 940,  y: 480,  r: 25 },
];

// Stream: diagonal band from (600,0) to (1000,1200)
// Modelled mathematically — no rect tiling needed
const STREAM_HALF_WIDTH = 48;
const CROSSING_YS = [200, 600, 1000];
const CROSSING_HALF_HEIGHT = 60; // 120-unit tall gap per crossing, well above player diameter

function streamCenterX(y) {
  return 600 + (y / MAP_HEIGHT) * 400;
}

function isBlockedByStream(x, y, radius) {
  if (CROSSING_YS.some(cy => Math.abs(y - cy) < CROSSING_HALF_HEIGHT)) return false;
  return Math.abs(x - streamCenterX(y)) < STREAM_HALF_WIDTH + radius;
}

function collidesWithObstacles(x, y, radius) {
  for (const obs of OBSTACLES) {
    const dx = x - obs.x, dy = y - obs.y;
    const minDist = radius + obs.r;
    if (dx * dx + dy * dy < minDist * minDist) return obs;
  }
  if (isBlockedByStream(x, y, radius)) return { type: 'stream' };
  return null;
}

function resolveObstacleSlide(x, y, nx, ny, radius) {
  if (!collidesWithObstacles(nx, ny, radius)) return { x: nx, y: ny };
  if (!collidesWithObstacles(nx, y,  radius)) return { x: nx, y };
  if (!collidesWithObstacles(x,  ny, radius)) return { x,  y: ny };
  return { x, y };
}

function clampToMap(x, y, radius) {
  return {
    x: Math.max(radius, Math.min(MAP_WIDTH  - radius, x)),
    y: Math.max(radius, Math.min(MAP_HEIGHT - radius, y)),
  };
}

module.exports = {
  OBSTACLES,
  PLAYER_RADIUS,
  CROSSING_YS,
  CROSSING_HALF_HEIGHT,
  STREAM_HALF_WIDTH,
  streamCenterX,
  isBlockedByStream,
  collidesWithObstacles,
  resolveObstacleSlide,
  clampToMap,
};
