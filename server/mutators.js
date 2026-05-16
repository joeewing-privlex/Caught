// Per-round mutators. v2 ships four. See spec.md §4.5.

const { BUTTERFLY_TARGET_COUNT, SPEED_NORMAL, ROUND_DURATION } = require('./config');

const MUTATORS = {
  none: {
    id: 'none',
    name: 'None',
    description: 'Baseline rules.',
    butterflyTargetCount: BUTTERFLY_TARGET_COUNT,
    speedNormal: SPEED_NORMAL,
    roundDuration: ROUND_DURATION,
    pointMultiplier: 1,
  },
  bloom: {
    id: 'bloom',
    name: 'Butterfly Bloom',
    description: 'Twice as many butterflies — chaos.',
    butterflyTargetCount: 60,
    speedNormal: SPEED_NORMAL,
    roundDuration: ROUND_DURATION,
    pointMultiplier: 1,
  },
  speed: {
    id: 'speed',
    name: 'Speed Demons',
    description: '30% faster movement.',
    butterflyTargetCount: BUTTERFLY_TARGET_COUNT,
    speedNormal: Math.round(SPEED_NORMAL * 1.3),
    roundDuration: ROUND_DURATION,
    pointMultiplier: 1,
  },
  sudden: {
    id: 'sudden',
    name: 'Sudden Death',
    description: 'Short 90-second round, every butterfly is worth double.',
    butterflyTargetCount: BUTTERFLY_TARGET_COUNT,
    speedNormal: SPEED_NORMAL,
    roundDuration: 90,
    pointMultiplier: 2,
  },
};

const ALL_IDS = Object.keys(MUTATORS);

function get(id) { return MUTATORS[id] || MUTATORS.none; }

// Pick a mutator excluding any in the `exclude` set. Falls back to 'none' if empty.
function pick(pool, exclude, rng = Math.random) {
  const candidates = pool.filter(id => !exclude.has(id) && MUTATORS[id]);
  const list = candidates.length ? candidates : pool.filter(id => MUTATORS[id]);
  if (list.length === 0) return MUTATORS.none;
  return MUTATORS[list[Math.floor(rng() * list.length)]];
}

module.exports = { MUTATORS, ALL_IDS, get, pick };
