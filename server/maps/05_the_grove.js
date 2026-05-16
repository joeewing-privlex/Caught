// The Grove — dense forest with two clear N-S corridors plus a main E-W
// path between bases. Each base sits at the end of the main path AND has
// a side approach from the north corridor or south corridor.
//
//   AAAAA──main path────────────────────main path──ZZZZZ
//         │       T T T T T T T T       │
//         │       T T T T T T T T       │  ← dense trees
//   north │       T T T T T T T T       │ north
//   corr  │       T T   T T   T T       │  corr
//         │       T T   T T   T T       │
//   AAAAA─┴──main path────────────────────main path──┴─ZZZZZ
//   south │       T T T T T T T T       │ south
//   corr  │       T T T T T T T T       │ corr
//

const { MapBuilder } = require('./builder');

function build() {
  const m = new MapBuilder('the_grove', 'The Grove');

  m.baseAt('A',  4, 18);
  m.baseAt('B', 45, 18);

  // Dense forest blocks: two rectangular thickets above and below the main path.
  // Leave gaps so the N-S corridors connect the upper and lower halves.
  for (let ty = 8; ty <= 14; ty++) {
    for (let tx = 12; tx <= 38; tx++) {
      // Leave gaps for corridors at x=18 and x=32
      if (tx === 18 || tx === 32) continue;
      // Leave a thin gap row in the middle of the thicket
      if (ty === 11 && (tx % 4 === 0)) continue;
      m.tree(tx, ty);
    }
  }
  for (let ty = 22; ty <= 28; ty++) {
    for (let tx = 12; tx <= 38; tx++) {
      if (tx === 18 || tx === 32) continue;
      if (ty === 25 && (tx % 4 === 0)) continue;
      m.tree(tx, ty);
    }
  }

  // Carve the main east-west path along ty=18 (player base row).
  // Make it explicit `path` cells so the renderer shows it as a track.
  for (let tx = 7; tx <= 42; tx++) m.path(tx, 18);

  // N-S corridor markers (path cells) at x=18 and x=32
  for (let ty = 5; ty <= 31; ty++) {
    if (ty >= 16 && ty <= 20) continue;   // don't paint over the main path / bases
    m.path(18, ty);
    m.path(32, ty);
  }

  // North-edge and south-edge trees (sparse, framing)
  m.trees([
    [8, 2], [14, 1], [22, 2], [28, 1], [36, 2], [42, 1],
    [8, 34], [14, 35], [22, 34], [28, 35], [36, 34], [42, 35],
  ]);

  // Bushes and stumps to decorate the clearings
  m.bushes([
    [10, 16], [10, 20], [40, 16], [40, 20],
    [18, 4], [32, 4], [18, 32], [32, 32],
  ]);
  m.stumps([[15, 18], [35, 18]]);
  m.flowers([
    [9, 12], [9, 24], [41, 12], [41, 24],
    [24, 4], [24, 32], [18, 18], [32, 18],
  ]);

  // Power-up spawns concentrated along corridors and at corridor intersections
  m.spawns([
    [18, 4],  [32, 4],
    [18, 14], [32, 14],
    [18, 22], [32, 22],
    [18, 32], [32, 32],
  ]);

  m.setButterflyZones([
    { tx: 19, ty: 4,  w: 13, h: 6  },   // north clearing
    { tx: 19, ty: 26, w: 13, h: 6  },   // south clearing
    { tx: 19, ty: 18, w: 13, h: 2  },   // along the main path
  ]);

  return m.build();
}

module.exports = build;
