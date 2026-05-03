const { MAP_WIDTH, MAP_HEIGHT, BUTTERFLY_SPEED } = require('./config');
const { collidesWithObstacles } = require('./collision');

let nextId = 1;

const TYPES = [
  { type: 'swallowtail', weight: 5 },
  { type: 'painted_lady', weight: 5 },
  { type: 'admiral', weight: 2 },
];

const SPAWN_ZONES = [
  // Center third + slight overlap into each side
  { x: 550, y: 200, w: 500, h: 200 },
  { x: 500, y: 450, w: 600, h: 300 },
  { x: 550, y: 800, w: 500, h: 200 },
  { x: 300, y: 350, w: 150, h: 300 },
  { x: 1150, y: 350, w: 150, h: 300 },
];

function randomType() {
  const total = TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TYPES) {
    r -= t.weight;
    if (r <= 0) return t.type;
  }
  return TYPES[0].type;
}

function randomSpawnPos() {
  const zone = SPAWN_ZONES[Math.floor(Math.random() * SPAWN_ZONES.length)];
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = zone.x + Math.random() * zone.w;
    const y = zone.y + Math.random() * zone.h;
    if (!collidesWithObstacles(x, y, 8)) return { x, y };
  }
  return { x: 800, y: 600 };
}

function create() {
  const pos = randomSpawnPos();
  return {
    id: nextId++,
    type: randomType(),
    x: pos.x,
    y: pos.y,
    angle: Math.random() * Math.PI * 2,
    turnVel: 0,
  };
}

const MAX_TURN_VEL = Math.PI / 2; // rad/sec
const TURN_ACCEL = Math.PI;       // rad/sec^2

function update(b, dt) {
  // Random walk turn velocity
  b.turnVel += (Math.random() - 0.5) * TURN_ACCEL * dt * 4;
  b.turnVel = Math.max(-MAX_TURN_VEL, Math.min(MAX_TURN_VEL, b.turnVel));
  b.angle += b.turnVel * dt;

  const nx = b.x + Math.cos(b.angle) * BUTTERFLY_SPEED * dt;
  const ny = b.y + Math.sin(b.angle) * BUTTERFLY_SPEED * dt;

  const hit = collidesWithObstacles(nx, ny, 8);
  if (hit) {
    // Reflect and deviate
    b.angle = b.angle + Math.PI + (Math.random() - 0.5) * (Math.PI / 3);
    b.turnVel = 0;
  } else {
    b.x = nx;
    b.y = ny;
  }

  // Bounce off map edges
  if (b.x < 20) { b.x = 20; b.angle = Math.PI - b.angle; }
  if (b.x > MAP_WIDTH - 20) { b.x = MAP_WIDTH - 20; b.angle = Math.PI - b.angle; }
  if (b.y < 20) { b.y = 20; b.angle = -b.angle; }
  if (b.y > MAP_HEIGHT - 20) { b.y = MAP_HEIGHT - 20; b.angle = -b.angle; }
}

module.exports = { create, update, SPAWN_ZONES };
