// Meadow — the original map: scattered boulders + a diagonal stream with three crossings.

module.exports = function meadowMap() {
  return {
    id: 'meadow',
    name: 'Meadow',
    width: 1600,
    height: 1200,
    bases: {
      A: { x: 160, y: 600 },
      B: { x: 1440, y: 600 },
    },
    obstacles: [
      { type: 'circle', x: 400,  y: 300,  r: 45 },
      { type: 'circle', x: 1200, y: 300,  r: 45 },
      { type: 'circle', x: 400,  y: 900,  r: 45 },
      { type: 'circle', x: 1200, y: 900,  r: 45 },
      { type: 'circle', x: 700,  y: 250,  r: 35 },
      { type: 'circle', x: 900,  y: 950,  r: 35 },
      { type: 'circle', x: 520,  y: 600,  r: 30 },
      { type: 'circle', x: 1080, y: 600,  r: 30 },
      { type: 'circle', x: 310,  y: 490,  r: 25 },
      { type: 'circle', x: 1290, y: 710,  r: 25 },
      { type: 'circle', x: 660,  y: 720,  r: 25 },
      { type: 'circle', x: 940,  y: 480,  r: 25 },
    ],
    // Diagonal stream — `t` is fraction along the segment from start→end.
    stream: {
      startX: 600,  startY: 0,
      endX:   1000, endY:   1200,
      halfWidth: 48,
      crossings: [
        { t: 200 / 1200,  halfLen: 60 },
        { t: 600 / 1200,  halfLen: 60 },
        { t: 1000 / 1200, halfLen: 60 },
      ],
    },
    powerupSpawns: [
      { x: 300,  y: 200  },
      { x: 1300, y: 200  },
      { x: 300,  y: 1000 },
      { x: 1300, y: 1000 },
      { x: 800,  y: 150  },
      { x: 800,  y: 1050 },
      { x: 550,  y: 580  },
      { x: 1050, y: 620  },
    ],
    butterflyZones: [
      { x: 550, y: 200, w: 500, h: 200 },
      { x: 500, y: 450, w: 600, h: 300 },
      { x: 550, y: 800, w: 500, h: 200 },
      { x: 300, y: 350, w: 150, h: 300 },
      { x: 1150,y: 350, w: 150, h: 300 },
    ],
  };
};
