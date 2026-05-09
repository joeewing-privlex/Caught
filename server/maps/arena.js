// Arena — open field with a horizontal stream splitting north and south halves.
// Three crossings up the middle make it tense for trail-running.

module.exports = function arenaMap() {
  return {
    id: 'arena',
    name: 'Arena',
    width: 1600,
    height: 1200,
    bases: {
      A: { x: 160, y: 300 },
      B: { x: 1440, y: 900 },
    },
    obstacles: [
      // Sparse pillars
      { type: 'circle', x: 400,  y: 200,  r: 35 },
      { type: 'circle', x: 1200, y: 1000, r: 35 },
      { type: 'circle', x: 800,  y: 200,  r: 30 },
      { type: 'circle', x: 800,  y: 1000, r: 30 },
      { type: 'circle', x: 400,  y: 800,  r: 25 },
      { type: 'circle', x: 1200, y: 400,  r: 25 },
      // Center ring
      { type: 'circle', x: 700,  y: 600,  r: 28 },
      { type: 'circle', x: 900,  y: 600,  r: 28 },
    ],
    // Near-horizontal stream splitting north/south halves.
    stream: {
      startX: 0,    startY: 580,
      endX:   1600, endY:   620,
      halfWidth: 42,
      crossings: [
        { t: 0.25, halfLen: 90 },
        { t: 0.75, halfLen: 90 },
      ],
    },
    powerupSpawns: [
      { x: 300,  y: 600 },
      { x: 1300, y: 600 },
      { x: 800,  y: 100 },
      { x: 800,  y: 1100 },
      { x: 600,  y: 300 },
      { x: 1000, y: 900 },
      { x: 200,  y: 1000 },
      { x: 1400, y: 200 },
    ],
    butterflyZones: [
      { x: 500, y: 100, w: 600, h: 200 },
      { x: 500, y: 900, w: 600, h: 200 },
      { x: 300, y: 400, w: 200, h: 400 },
      { x: 1100,y: 400, w: 200, h: 400 },
    ],
  };
};
