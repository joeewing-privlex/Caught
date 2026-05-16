// Twin Streams — two vertical streams divide the map into thirds.
// Bases sit in the outer thirds. Each stream has 2 bridges (one north, one
// south). Center third is the contested butterfly corridor.
//
//        stream1                    stream2
//          │                          │
//   AAAAA  │       center           │   ZZZZZ
//          │     butterfly land     │
//          │                          │
//
// Players approach the center via 4 bridges total (2 per stream), and bases
// have a clear path on the outer side too — two distinct routes guaranteed.

const { MapBuilder } = require('./builder');

function build() {
  const m = new MapBuilder('twin_streams', 'Twin Streams');

  m.baseAt('A',  4, 18);
  m.baseAt('B', 45, 18);

  // Left stream at col 14, 2 wide, with bridges at rows 9 and 27.
  m.river(14, 1, 14, 35, 2, [9 / 34, 27 / 34]);
  // Right stream at col 35, 2 wide, with bridges at rows 9 and 27.
  m.river(35, 1, 35, 35, 2, [9 / 34, 27 / 34]);

  // Scattered trees in the center for cover and steal-spots
  m.trees([
    [20, 6], [25, 4], [30, 6],
    [22, 10], [28, 10],
    [20, 30], [25, 32], [30, 30],
    [22, 26], [28, 26],
  ]);
  m.stumps([[24, 14], [24, 22]]);

  // Outer thirds: a few trees but mostly open so bases have approach room.
  m.trees([
    [8, 4], [11, 6], [10, 28], [8, 32],
    [38, 4], [41, 6], [40, 28], [38, 32],
  ]);

  // Bushes and flowers
  m.bushes([
    [6, 12], [11, 16], [6, 24], [11, 22],
    [38, 16], [43, 12], [43, 24], [38, 22],
    [20, 18], [25, 16], [30, 18], [25, 20],
  ]);
  m.flowers([
    [10, 10], [10, 26], [39, 10], [39, 26],
    [22, 18], [28, 18],
  ]);

  m.spawns([
    [8, 6],  [41, 6],
    [8, 30], [41, 30],
    [20, 12], [29, 12],
    [20, 24], [29, 24],
  ]);

  m.setButterflyZones([
    { tx: 17, ty: 6,  w: 16, h: 25 },   // big center corridor
    { tx: 6,  ty: 14, w: 7,  h: 8  },   // outer-left side
    { tx: 37, ty: 14, w: 7,  h: 8  },   // outer-right side
  ]);

  return m.build();
}

module.exports = build;
