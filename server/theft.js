const { THEFT_RADIUS } = require('./config');

function dist2(ax, ay, bx, by) {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

// Check if thief (opposing team) collides with victim's trail butterflies.
// trailPositions: array of {x,y} for each butterfly in victim's trail.
// Returns true if theft should occur.
function checkTheft(thief, victim, trailPositions) {
  if (thief.team === victim.team) return false;
  if (victim.shielded) return false;
  if (thief.immuneUntil > Date.now()) return false;
  const r2 = THEFT_RADIUS * THEFT_RADIUS;
  for (const pos of trailPositions) {
    if (dist2(thief.x, thief.y, pos.x, pos.y) < r2) return true;
  }
  return false;
}

module.exports = { checkTheft };
