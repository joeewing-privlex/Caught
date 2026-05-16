// Character sprite loading. Each color has 3 source images (front, back, side).
// Side is mirrored at draw time for the opposite direction.

// Note: the Kenney files have inconsistent naming (greenabck.png, greyabck.png,
// grayfront.png vs greyside.png). Build an explicit map rather than constructing
// paths from the color string.

const FILES = {
  blue:      { front: 'bluefront.png',     back: 'blueback.png',     side: 'blueside.png'   },
  brown:     { front: 'brownfront.png',    back: 'brownback.png',    side: 'brownside.png'  },
  gray:      { front: 'grayfront.png',     back: 'greyabck.png',     side: 'greyside.png'   },
  green:     { front: 'greenfront.png',    back: 'greenabck.png',    side: 'greenside.png'  },
  orange:    { front: 'orangefront.png',   back: 'orangeback.png',   side: 'orangeside.png' },
  pink:      { front: 'pinkfront.png',     back: 'pinkback.png',     side: 'pinkside.png'   },
  purple:    { front: 'purplefront.png',   back: 'purpleback.png',   side: 'purpleside.png' },
  red:       { front: 'redfront.png',      back: 'redback.png',      side: 'redside.png'    },
  turquoise: { front: 'turqfront.png',     back: 'turqback.png',     side: 'turqside.png'   },
  yellow:    { front: 'yellowfront.png',   back: 'yellowback.png',   side: 'yellowside.png' },
};

const BASE = '/assets/kenney/characters/';

// loaded[color][orientation] = HTMLImageElement
const loaded = {};
let loadingPromise = null;

export function loadAllSprites() {
  if (loadingPromise) return loadingPromise;
  const tasks = [];
  for (const color of Object.keys(FILES)) {
    loaded[color] = {};
    for (const orient of ['front', 'back', 'side']) {
      const fname = FILES[color][orient];
      const img = new Image();
      img.src = BASE + fname;
      loaded[color][orient] = img;
      tasks.push(new Promise((res) => {
        if (img.complete) res();
        else { img.onload = res; img.onerror = res; }
      }));
    }
  }
  loadingPromise = Promise.all(tasks).then(() => loaded);
  return loadingPromise;
}

// Pick orientation by angle (radians). +X is right, +Y is down (screen-down).
// Returns { img, flip } where flip=true means flip horizontally.
export function pickSprite(color, angle) {
  const c = loaded[color] || loaded.blue;
  // Quadrant: -135..-45 = up, -45..45 = right, 45..135 = down, else left
  const deg = ((angle * 180 / Math.PI) % 360 + 360) % 360;
  // 315..45  → right (0deg-ish)
  // 45..135  → down
  // 135..225 → left
  // 225..315 → up
  if (deg >= 315 || deg < 45)  return { img: c.side,  flip: false };  // right
  if (deg < 135)               return { img: c.front, flip: false };  // down (facing camera)
  if (deg < 225)               return { img: c.side,  flip: true  };  // left
  return                              { img: c.back,  flip: false };  // up (away from camera)
}

export const COLORS = Object.keys(FILES);
