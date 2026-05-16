// Open Meadow — beginner-friendly map. Wide-open central field, scattered
// single trees and stumps, no water. Easy navigation, lots of theft.
//
//                      ┌──────────────────────────────┐
//   tree line N edge   │  open meadow with scatter    │
//                      │                              │
//          ┌─AAAAA─────────────────────────ZZZZZ─┐
//   power-up rings ringing the bases
//                      │                              │
//   tree line S edge   │  open meadow with scatter    │
//                      └──────────────────────────────┘

const { MapBuilder } = require('./builder');

function build() {
  const m = new MapBuilder('open_meadow', 'Open Meadow');

  // Bases — centered vertically, 5x5 patches
  m.baseAt('A',  4, 18);
  m.baseAt('B', 45, 18);

  // North edge: sparse tree line for visual containment (still passable around)
  m.trees([
    [3, 1], [10, 2], [15, 1], [22, 2], [28, 1], [34, 2], [40, 1], [46, 2],
  ]);
  m.stumps([[7, 3], [25, 3], [38, 3]]);

  // South edge: mirrored
  m.trees([
    [3, 35], [10, 34], [15, 35], [22, 34], [28, 35], [34, 34], [40, 35], [46, 34],
  ]);
  m.stumps([[7, 33], [25, 33], [38, 33]]);

  // Mid-field scatter (between bases): scattered single trees, NO clusters
  // that could block a route — just texture for cover and steal-spots.
  m.trees([
    [12, 8], [18, 6], [25, 10], [32, 7], [38, 9],
    [14, 28], [20, 30], [27, 26], [33, 29], [39, 27],
  ]);
  m.stumps([[20, 14], [29, 22]]);

  // Bushes + flowers for decor (passable)
  m.bushes([
    [10, 14], [16, 18], [22, 16], [28, 20], [34, 14], [40, 18],
    [14, 22], [20, 18], [26, 18], [32, 22], [38, 18],
  ]);
  m.flowers([
    [8, 10], [42, 10], [8, 26], [42, 26],
    [16, 12], [33, 12], [16, 24], [33, 24],
  ]);

  // Power-up spawns: 4 corners (away from bases) + 4 middle-edge.
  // Roughly symmetric so neither team has a positional advantage.
  m.spawns([
    [10, 6],  [39, 6],
    [10, 30], [39, 30],
    [24, 4],  [24, 32],
    [16, 18], [33, 18],
  ]);

  // Butterfly zones — center band + flanks
  m.setButterflyZones([
    { tx: 18, ty: 12, w: 14, h: 13 },   // center
    { tx: 10, ty: 16, w: 6,  h: 6  },   // left flank (between bases and water-edge)
    { tx: 34, ty: 16, w: 6,  h: 6  },   // right flank
  ]);

  return m.build();
}

module.exports = build;
