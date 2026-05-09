const { BUTTERFLY_SPEED } = require('./config');
const { collidesWithObstacles } = require('./collision');

let nextId = 1;

const TYPES = [
  { type: 'swallowtail', weight: 5 },
  { type: 'painted_lady', weight: 5 },
  { type: 'admiral', weight: 2 },
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

function randomSpawnPos(map) {
  const zones = map.butterflyZones;
  const zone = zones[Math.floor(Math.random() * zones.length)];
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = zone.x + Math.random() * zone.w;
    const y = zone.y + Math.random() * zone.h;
    if (!collidesWithObstacles(x, y, 8, map)) return { x, y };
  }
  return { x: map.width / 2, y: map.height / 2 };
}

function create(map) {
  const pos = randomSpawnPos(map);
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

function update(b, dt, map) {
  // Random walk turn velocity
  b.turnVel += (Math.random() - 0.5) * TURN_ACCEL * dt * 4;
  b.turnVel = Math.max(-MAX_TURN_VEL, Math.min(MAX_TURN_VEL, b.turnVel));
  b.angle += b.turnVel * dt;

  const nx = b.x + Math.cos(b.angle) * BUTTERFLY_SPEED * dt;
  const ny = b.y + Math.sin(b.angle) * BUTTERFLY_SPEED * dt;

  const hit = collidesWithObstacles(nx, ny, 8, map);
  if (hit) {
    b.angle = b.angle + Math.PI + (Math.random() - 0.5) * (Math.PI / 3);
    b.turnVel = 0;
  } else {
    b.x = nx;
    b.y = ny;
  }

  if (b.x < 20) { b.x = 20; b.angle = Math.PI - b.angle; }
  if (b.x > map.width - 20) { b.x = map.width - 20; b.angle = Math.PI - b.angle; }
  if (b.y < 20) { b.y = 20; b.angle = -b.angle; }
  if (b.y > map.height - 20) { b.y = map.height - 20; b.angle = -b.angle; }
}

module.exports = { create, update };
