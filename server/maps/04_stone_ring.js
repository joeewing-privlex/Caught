// Stone Ring — large ring of rocks in the map center. Players must go
// north OR south of the ring to reach the opposite base. Two distinct
// approach routes by construction.
//
//                 ┌────────────────┐
//                 │   top corridor │  ← steal corridor (one approach)
//   AAAAA   ┌─────┘   ringed rocks │   ZZZZZ
//   AAAAA   │  ╲ ROCK ROCK ROCK ╲  │
//   AAAAA   │   ROCK   ●   ROCK    │   ZZZZZ
//   AAAAA   │  ╱ ROCK ROCK ROCK ╱  │
//   AAAAA   └─────┐    bot corridor│   ZZZZZ
//                 │                │  ← steal corridor (other approach)
//                 └────────────────┘

const { MapBuilder } = require('./builder');

function build() {
  const m = new MapBuilder('stone_ring', 'Stone Ring');

  m.baseAt('A',  4, 18);
  m.baseAt('B', 45, 18);

  // Central rock ring. Rough octagon, radius ~5 tiles, hollow.
  const cx = 25, cy = 18;
  const ringPoints = [];
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    ringPoints.push([Math.round(cx + Math.cos(ang) * 5), Math.round(cy + Math.sin(ang) * 5)]);
    ringPoints.push([Math.round(cx + Math.cos(ang) * 5.5), Math.round(cy + Math.sin(ang) * 5.5)]);
  }
  // Dedupe
  const seen = new Set();
  for (const [x, y] of ringPoints) {
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    m.rock(x, y);
  }
  // A single stump in the dead center as a "monument"
  m.stump(cx, cy);

  // Tree pickets framing the corridors above and below the ring
  m.trees([
    [12, 6], [16, 5], [22, 6], [28, 6], [34, 5], [38, 6],   // top picket
    [12, 30], [16, 31], [22, 30], [28, 30], [34, 31], [38, 30], // bottom picket
  ]);
  // Border accents
  m.trees([
    [10, 2], [25, 1], [40, 2],
    [10, 34], [25, 35], [40, 34],
  ]);

  m.bushes([
    [14, 18], [18, 14], [18, 22], [32, 14], [32, 22], [36, 18],
    [10, 14], [10, 22], [40, 14], [40, 22],
  ]);
  m.flowers([
    [8, 8], [42, 8], [8, 28], [42, 28],
    [25, 8], [25, 28],
  ]);

  m.spawns([
    [12, 4],  [38, 4],
    [12, 32], [38, 32],
    [18, 12], [32, 12],
    [18, 24], [32, 24],
  ]);

  m.setButterflyZones([
    { tx: 14, ty: 10, w: 22, h: 6  },   // north corridor
    { tx: 14, ty: 21, w: 22, h: 6  },   // south corridor
    { tx: 10, ty: 16, w: 4,  h: 4  },   // base-flank pocket A
    { tx: 36, ty: 16, w: 4,  h: 4  },   // base-flank pocket B
  ]);

  return m.build();
}

module.exports = build;
