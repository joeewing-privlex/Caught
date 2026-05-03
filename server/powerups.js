const { POWERUP_RESPAWN_SEC } = require('./config');

let nextId = 1;

const TYPES = ['white_trillium', 'pink_trillium', 'red_trillium'];

const SPAWN_POINTS = [
  { x: 300, y: 200 },
  { x: 1300, y: 200 },
  { x: 300, y: 1000 },
  { x: 1300, y: 1000 },
  { x: 800, y: 150 },
  { x: 800, y: 1050 },
  { x: 550, y: 580 },
  { x: 1050, y: 620 },
];

function createFlower(pointIndex) {
  return {
    id: nextId++,
    type: TYPES[Math.floor(Math.random() * TYPES.length)],
    x: SPAWN_POINTS[pointIndex].x,
    y: SPAWN_POINTS[pointIndex].y,
    pointIndex,
  };
}

function initFlowers() {
  return SPAWN_POINTS.map((_, i) => createFlower(i));
}

// Returns a new flower to add after respawn delay, or null if all points occupied
function pickRespawnPoint(flowers) {
  const occupied = new Set(flowers.map(f => f.pointIndex));
  const free = SPAWN_POINTS.map((_, i) => i).filter(i => !occupied.has(i));
  if (free.length === 0) return null;
  const idx = free[Math.floor(Math.random() * free.length)];
  return createFlower(idx);
}

const EFFECT_DURATION = {
  white_trillium: 5,
  pink_trillium: 20,
  red_trillium: 5,
};

module.exports = { initFlowers, pickRespawnPoint, EFFECT_DURATION, SPAWN_POINTS };
