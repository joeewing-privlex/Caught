// Tile assets. Loads the Kenney packed tilemap and exposes semantic
// → tile-coordinate lookups for the renderer.
//
// The packed sheet is 12×11 tiles, each 16×16 px, with 1px spacing between tiles.
// See kenney_tiny-town/Tilesheet.txt.

const SHEET_PATH = '/assets/kenney/tilemap/tilemap_packed.png';
const TILE_PX = 16;
const GAP = 0;
const COLS = 12;
const ROWS = 11;

// Semantic cell IDs (must match server/tiles.js).
export const CELL = {
  GRASS:  0,
  PATH:   1,
  WATER:  2,
  BRIDGE: 3,
  TREE:   4,
  ROCK:   5,
  BUSH:   6,
  FENCE:  7,
  BASE_A: 8,
  BASE_B: 9,
  FLOWER: 10,
  STUMP:  11,
};

// Hand-picked tile indices into the packed sheet. Numbers chosen by eyeballing
// the Tiny Town tilesheet. Easy to tweak — search for "tile_NNNN.png" in the
// Tiles/ folder for previews.
//
// Index = col + row * COLS.
const TILE = {
  // ground variants (grass)
  grass:     [0, 1, 2],
  // path overlays (sandy/dirt)
  path:      [3],
  // water
  water:     [27],
  bridge:    [50],
  // blockers
  tree:      [4],
  rock:      [13],
  stump:     [5],
  bush:      [16],
  fence:     [44],
  flower:    [29],   // decorative wildflower
  // base markers
  baseA:     [62],
  baseB:     [63],
  // power-up trillium (drawn separately; not in cell grid)
  flowerWhite:  [89],
  flowerPink:   [90],
  flowerRed:    [91],
  flowerYellow: [92],   // Yellow Trillium — vision/Lookout power-up
};

let sheetImage = null;
let loadPromise = null;

export function loadTileSheet() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { sheetImage = img; resolve(img); };
    img.onerror = (e) => reject(new Error('Failed to load tilemap_packed.png'));
    img.src = SHEET_PATH;
  });
  return loadPromise;
}

export function getSheet() { return sheetImage; }
export function getTilePx() { return TILE_PX; }

// Source (sheet) rect for a given tile index.
export function tileSrc(tileIndex) {
  const col = tileIndex % COLS;
  const row = Math.floor(tileIndex / COLS);
  return {
    sx: col * (TILE_PX + GAP),
    sy: row * (TILE_PX + GAP),
    sw: TILE_PX,
    sh: TILE_PX,
  };
}

// Stable variant picker — same tile coord always gets the same variant.
function variantPick(arr, tx, ty) {
  if (arr.length === 1) return arr[0];
  // FNV-like hash on the two coords
  let h = (tx * 73856093) ^ (ty * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return arr[h % arr.length];
}

// Map a semantic cell ID + tile coord to the tile index to draw on top of
// the grass base. Returns null for cells that are pure grass.
export function overlayForCell(cellId, tx, ty) {
  switch (cellId) {
    case CELL.GRASS:  return null;
    case CELL.PATH:   return variantPick(TILE.path, tx, ty);
    case CELL.WATER:  return variantPick(TILE.water, tx, ty);
    case CELL.BRIDGE: return variantPick(TILE.bridge, tx, ty);
    case CELL.TREE:   return variantPick(TILE.tree, tx, ty);
    case CELL.ROCK:   return variantPick(TILE.rock, tx, ty);
    case CELL.STUMP:  return variantPick(TILE.stump, tx, ty);
    case CELL.BUSH:   return variantPick(TILE.bush, tx, ty);
    case CELL.FENCE:  return variantPick(TILE.fence, tx, ty);
    case CELL.FLOWER: return variantPick(TILE.flower, tx, ty);
    case CELL.BASE_A: return variantPick(TILE.baseA, tx, ty);
    case CELL.BASE_B: return variantPick(TILE.baseB, tx, ty);
    default: return null;
  }
}

// Always pick a grass tile for the base layer (so everything draws on grass).
export function grassForCell(tx, ty) {
  return variantPick(TILE.grass, tx, ty);
}

export function flowerTileFor(type) {
  if (type === 'white_trillium')  return TILE.flowerWhite[0];
  if (type === 'pink_trillium')   return TILE.flowerPink[0];
  if (type === 'red_trillium')    return TILE.flowerRed[0];
  if (type === 'yellow_trillium') return TILE.flowerYellow[0];
  return TILE.flowerWhite[0];
}
