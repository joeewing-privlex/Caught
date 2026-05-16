// The Crossing — diagonal river NW→SE with 3 bridges. Theft happens at
// bridges. Bases sit cleanly on opposite sides of the water.
//
//   AAAAA   trees    ╲    bridge1   trees   ZZZZZ
//                     ╲              ╱
//                     ╲     bridge2  ╱
//                      ╲   ╱
//                  bridge3
//
// Each base is approachable from north AND south of the river.

const { MapBuilder } = require('./builder');

function build() {
  const m = new MapBuilder('the_crossing', 'The Crossing');

  m.baseAt('A',  4, 18);
  m.baseAt('B', 45, 18);

  // Diagonal river from top-center-ish to bottom-center-ish, 2 tiles wide.
  // Three bridges at t = 0.25, 0.5, 0.75 along the river.
  m.river(18, 2, 32, 34, 2, [0.25, 0.5, 0.75]);

  // North-edge forest (sparse)
  m.trees([
    [8, 2], [12, 1], [22, 1], [28, 2], [37, 2], [42, 1],
    [10, 5], [25, 4], [40, 5],
  ]);

  // South-edge forest (sparse)
  m.trees([
    [8, 35], [12, 34], [22, 35], [28, 34], [37, 35], [42, 34],
    [10, 31], [25, 32], [40, 31],
  ]);

  // Cluster near each base for cover (but well clear of the base patch)
  m.trees([[10, 14], [11, 22], [38, 14], [39, 22]]);
  m.stumps([[12, 18], [37, 18]]);

  // Bushes and flowers scattered
  m.bushes([
    [8, 10], [14, 16], [16, 24], [34, 10], [36, 24], [42, 16],
    [20, 8], [30, 8], [20, 28], [30, 28],
  ]);
  m.flowers([
    [6, 8], [44, 8], [6, 28], [44, 28],
    [22, 12], [28, 24], [22, 24], [28, 12],
  ]);

  // Power-up spawns: away from base + a couple near bridges to incentivize crossing
  m.spawns([
    [10, 8],  [40, 8],
    [10, 28], [40, 28],
    [22, 14], [28, 22],   // near bridge1 and bridge3 area
    [25, 6],  [25, 32],
  ]);

  m.setButterflyZones([
    { tx: 14, ty: 14, w: 22, h: 10 },   // around the middle bridge
    { tx: 10, ty: 8,  w: 6,  h: 6  },   // northwest pool
    { tx: 34, ty: 24, w: 6,  h: 6  },   // southeast pool
  ]);

  return m.build();
}

module.exports = build;
