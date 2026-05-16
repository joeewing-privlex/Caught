// MapBuilder — declarative DSL for hand-authoring tile maps.
//
// Maps are 50×37 grass grids. The builder lets you place individual features
// (trees, rocks, bushes, fences, rivers with bridges, paths, base patches,
// power-up spawns) without counting columns by hand.

const { CELL } = require('../tiles');
const { MAP_TILES_W, MAP_TILES_H, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } = require('../config');

class MapBuilder {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.cells = new Uint8Array(MAP_TILES_W * MAP_TILES_H);   // all 0 = GRASS
    this.powerupSpawns = [];
    this.butterflyZones = null;
    this.baseA = null;
    this.baseB = null;
  }

  _idx(tx, ty) { return ty * MAP_TILES_W + tx; }
  _inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < MAP_TILES_W && ty < MAP_TILES_H; }
  _set(tx, ty, cell) {
    if (this._inBounds(tx, ty)) this.cells[this._idx(tx, ty)] = cell;
  }
  _get(tx, ty) {
    return this._inBounds(tx, ty) ? this.cells[this._idx(tx, ty)] : CELL.ROCK;
  }

  // 5x5 base patch centered on (cx, cy).
  baseAt(team, cx, cy) {
    const cell = team === 'A' ? CELL.BASE_A : CELL.BASE_B;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        this._set(cx + dx, cy + dy, cell);
    if (team === 'A') this.baseA = { tx: cx, ty: cy };
    else              this.baseB = { tx: cx, ty: cy };
    return this;
  }

  // Single-tile features (skip if cell is a base — never overwrite a base patch).
  tree(tx, ty)   { return this._maybePlace(tx, ty, CELL.TREE); }
  rock(tx, ty)   { return this._maybePlace(tx, ty, CELL.ROCK); }
  stump(tx, ty)  { return this._maybePlace(tx, ty, CELL.STUMP); }
  bush(tx, ty)   { return this._maybePlace(tx, ty, CELL.BUSH); }
  flower(tx, ty) { return this._maybePlace(tx, ty, CELL.FLOWER); }
  fence(tx, ty)  { return this._maybePlace(tx, ty, CELL.FENCE); }
  path(tx, ty)   { return this._maybePlace(tx, ty, CELL.PATH); }
  bridge(tx, ty) { return this._maybePlace(tx, ty, CELL.BRIDGE); }
  water(tx, ty)  { return this._maybePlace(tx, ty, CELL.WATER); }

  _maybePlace(tx, ty, cell) {
    const cur = this._get(tx, ty);
    if (cur === CELL.BASE_A || cur === CELL.BASE_B) return this;  // never overwrite a base
    this._set(tx, ty, cell);
    return this;
  }

  // Power-up spawn point. Tile underneath stays grass.
  spawn(tx, ty) {
    if (!this._inBounds(tx, ty)) return this;
    this.powerupSpawns.push({ tx, ty });
    return this;
  }

  // Place many of the same feature.
  trees(coords)   { for (const [x, y] of coords) this.tree(x, y);   return this; }
  rocks(coords)   { for (const [x, y] of coords) this.rock(x, y);   return this; }
  stumps(coords)  { for (const [x, y] of coords) this.stump(x, y);  return this; }
  bushes(coords)  { for (const [x, y] of coords) this.bush(x, y);   return this; }
  flowers(coords) { for (const [x, y] of coords) this.flower(x, y); return this; }
  spawns(coords)  { for (const [x, y] of coords) this.spawn(x, y);  return this; }

  // Fill a rectangle with `cell`. Use for forests, lakes, etc.
  rect(cell, tx, ty, w, h) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        this._maybePlace(tx + dx, ty + dy, cell);
    return this;
  }

  // Carve a horizontal fence run.
  fenceH(tx, ty, len) {
    for (let i = 0; i < len; i++) this.fence(tx + i, ty);
    return this;
  }
  fenceV(tx, ty, len) {
    for (let i = 0; i < len; i++) this.fence(tx, ty + i);
    return this;
  }

  // A river: line of water tiles `width` wide running from (x0,y0) to (x1,y1).
  // Bridges is an array of t-fractions along the river where bridges sit.
  river(x0, y0, x1, y1, width = 2, bridges = []) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return this;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(x0 + dx * t);
      const cy = Math.round(y0 + dy * t);
      const isBridge = bridges.some(b => Math.abs(t - b) * steps < 1);
      for (let w = 0; w < width; w++) {
        // For mostly-vertical rivers, widen across X; mostly-horizontal, across Y.
        const horizontalRiver = Math.abs(dx) > Math.abs(dy);
        const px = horizontalRiver ? cx : cx + w;
        const py = horizontalRiver ? cy + w : cy;
        this._maybePlace(px, py, isBridge ? CELL.BRIDGE : CELL.WATER);
      }
    }
    return this;
  }

  // Visual border of trees around the whole map edge (acts as walls).
  borderTrees() {
    for (let tx = 0; tx < MAP_TILES_W; tx++) {
      this._maybePlace(tx, 0, CELL.TREE);
      this._maybePlace(tx, MAP_TILES_H - 1, CELL.TREE);
    }
    for (let ty = 0; ty < MAP_TILES_H; ty++) {
      this._maybePlace(0, ty, CELL.TREE);
      this._maybePlace(MAP_TILES_W - 1, ty, CELL.TREE);
    }
    return this;
  }

  setButterflyZones(zones) {
    this.butterflyZones = zones;
    return this;
  }

  // Finalize into a map data object suitable for game:start.
  build() {
    if (!this.baseA || !this.baseB) throw new Error(`Map ${this.id}: must call baseAt for both teams`);
    if (this.powerupSpawns.length < 4) {
      console.warn(`Map ${this.id}: only ${this.powerupSpawns.length} power-up spawns (expected 6-8)`);
    }
    return {
      id: this.id,
      name: this.name,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tileSize: TILE_SIZE,
      tilesW: MAP_TILES_W,
      tilesH: MAP_TILES_H,
      cells: Array.from(this.cells),
      bases: {
        A: {
          tx: this.baseA.tx, ty: this.baseA.ty,
          x: this.baseA.tx * TILE_SIZE + TILE_SIZE / 2,
          y: this.baseA.ty * TILE_SIZE + TILE_SIZE / 2,
        },
        B: {
          tx: this.baseB.tx, ty: this.baseB.ty,
          x: this.baseB.tx * TILE_SIZE + TILE_SIZE / 2,
          y: this.baseB.ty * TILE_SIZE + TILE_SIZE / 2,
        },
      },
      powerupSpawns: this.powerupSpawns.map(s => ({
        tx: s.tx, ty: s.ty,
        x: s.tx * TILE_SIZE + TILE_SIZE / 2,
        y: s.ty * TILE_SIZE + TILE_SIZE / 2,
      })),
      butterflyZones: (this.butterflyZones || [
        { tx: 20, ty: 12, w: 10, h: 13 },
        { tx: 12, ty: 16, w: 6,  h: 6  },
        { tx: 32, ty: 16, w: 6,  h: 6  },
      ]).map(z => ({
        x: z.tx * TILE_SIZE, y: z.ty * TILE_SIZE,
        w: z.w * TILE_SIZE,  h: z.h * TILE_SIZE,
      })),
    };
  }

  // Debug helper: produces a 37-line ASCII rendering for visual inspection.
  toAscii() {
    const charFor = (c) => {
      switch (c) {
        case CELL.GRASS:  return '.';
        case CELL.PATH:   return 'P';
        case CELL.WATER:  return 'W';
        case CELL.BRIDGE: return 'B';
        case CELL.TREE:   return 'T';
        case CELL.ROCK:   return 'R';
        case CELL.STUMP:  return 'S';
        case CELL.BUSH:   return 'b';
        case CELL.FENCE:  return 'F';
        case CELL.FLOWER: return 'f';
        case CELL.BASE_A: return 'A';
        case CELL.BASE_B: return 'Z';
        default: return '?';
      }
    };
    const spawnSet = new Set(this.powerupSpawns.map(s => `${s.tx},${s.ty}`));
    const lines = [];
    for (let ty = 0; ty < MAP_TILES_H; ty++) {
      let row = '';
      for (let tx = 0; tx < MAP_TILES_W; tx++) {
        row += spawnSet.has(`${tx},${ty}`) ? '*' : charFor(this.cells[this._idx(tx, ty)]);
      }
      lines.push(row);
    }
    return lines.join('\n');
  }
}

module.exports = { MapBuilder };
