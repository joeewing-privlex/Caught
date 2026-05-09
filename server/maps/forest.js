// Forest — denser, no stream. Tree clusters create chokepoints; powerups hide deep in groves.

module.exports = function forestMap() {
  return {
    id: 'forest',
    name: 'Forest',
    width: 1600,
    height: 1200,
    bases: {
      A: { x: 140, y: 600 },
      B: { x: 1460, y: 600 },
    },
    obstacles: [
      // North grove
      { type: 'circle', x: 500,  y: 200, r: 40 },
      { type: 'circle', x: 560,  y: 280, r: 35 },
      { type: 'circle', x: 460,  y: 320, r: 30 },
      { type: 'circle', x: 1100, y: 200, r: 40 },
      { type: 'circle', x: 1040, y: 280, r: 35 },
      { type: 'circle', x: 1140, y: 320, r: 30 },
      // South grove
      { type: 'circle', x: 500,  y: 1000, r: 40 },
      { type: 'circle', x: 560,  y: 920,  r: 35 },
      { type: 'circle', x: 460,  y: 880,  r: 30 },
      { type: 'circle', x: 1100, y: 1000, r: 40 },
      { type: 'circle', x: 1040, y: 920,  r: 35 },
      { type: 'circle', x: 1140, y: 880,  r: 30 },
      // Center grove — funnels traffic
      { type: 'circle', x: 800,  y: 600,  r: 60 },
      { type: 'circle', x: 720,  y: 540,  r: 30 },
      { type: 'circle', x: 880,  y: 660,  r: 30 },
      { type: 'circle', x: 720,  y: 660,  r: 30 },
      { type: 'circle', x: 880,  y: 540,  r: 30 },
      // Saplings sprinkled along midfield lanes
      { type: 'circle', x: 350,  y: 600, r: 22 },
      { type: 'circle', x: 1250, y: 600, r: 22 },
      { type: 'circle', x: 800,  y: 300, r: 28 },
      { type: 'circle', x: 800,  y: 900, r: 28 },
    ],
    stream: null,
    powerupSpawns: [
      { x: 800,  y: 600  },  // center grove
      { x: 350,  y: 250  },
      { x: 1250, y: 250  },
      { x: 350,  y: 950  },
      { x: 1250, y: 950  },
      { x: 800,  y: 150  },
      { x: 800,  y: 1050 },
      { x: 200,  y: 600  },
      { x: 1400, y: 600  },
    ],
    butterflyZones: [
      { x: 250,  y: 150, w: 300, h: 200 },
      { x: 1050, y: 150, w: 300, h: 200 },
      { x: 250,  y: 850, w: 300, h: 200 },
      { x: 1050, y: 850, w: 300, h: 200 },
      { x: 600,  y: 400, w: 400, h: 100 },
      { x: 600,  y: 700, w: 400, h: 100 },
    ],
  };
};
