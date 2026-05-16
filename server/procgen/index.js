// Procedural map generation. Pure function of `seed`. Returns a fresh map
// data object suitable for game:start. See spec.md §5.

const { TILE_SIZE, MAP_TILES_W, MAP_TILES_H, MAP_WIDTH, MAP_HEIGHT } = require('../config');
const { CELL } = require('./tiles');
const { makeRng } = require('./rng');
const carve = require('./carve');

const MAX_PATH_LENGTH = 120;      // regenerate if the carved A→B path exceeds this

function generate(seed) {
  // Allow a "seed nonce" — if connectivity fails or path is too long, try again with seed+'.N'.
  for (let attempt = 0; attempt < 8; attempt++) {
    const actualSeed = attempt === 0 ? seed : `${seed}.${attempt}`;
    const rng = makeRng(actualSeed);
    const w = MAP_TILES_W;
    const h = MAP_TILES_H;
    const cells = new Uint8Array(w * h);   // all 0 = GRASS

    const bases = carve.carveBases(cells, w, h);
    carve.carveRiver(cells, w, h, bases, rng);
    carve.scatterBlockingClusters(cells, w, h, bases, rng);
    const pathLen = carve.carvePath(cells, w, h, bases);
    if (pathLen == null) continue;                  // unreachable, retry
    if (pathLen > MAX_PATH_LENGTH) continue;        // too tangled, retry
    carve.scatterDecor(cells, w, h, rng);
    const powerupSpawns = carve.placePowerupSpawns(cells, w, h, bases, rng);
    const butterflyZones = carve.deriveButterflyZones(w, h);

    return {
      seed: actualSeed,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tileSize: TILE_SIZE,
      tilesW: w,
      tilesH: h,
      cells: Array.from(cells),   // JSON-serializable; 1850 ints, fine
      bases: {
        A: { tx: bases.A.tx, ty: bases.A.ty, x: bases.A.tx * TILE_SIZE + TILE_SIZE / 2, y: bases.A.ty * TILE_SIZE + TILE_SIZE / 2 },
        B: { tx: bases.B.tx, ty: bases.B.ty, x: bases.B.tx * TILE_SIZE + TILE_SIZE / 2, y: bases.B.ty * TILE_SIZE + TILE_SIZE / 2 },
      },
      powerupSpawns: powerupSpawns.map(s => ({
        tx: s.tx, ty: s.ty,
        x: s.tx * TILE_SIZE + TILE_SIZE / 2,
        y: s.ty * TILE_SIZE + TILE_SIZE / 2,
      })),
      butterflyZones: butterflyZones.map(z => ({
        x: z.tx * TILE_SIZE,
        y: z.ty * TILE_SIZE,
        w: z.w * TILE_SIZE,
        h: z.h * TILE_SIZE,
      })),
    };
  }
  throw new Error(`procgen failed for seed "${seed}" after 8 attempts`);
}

module.exports = { generate, CELL };
