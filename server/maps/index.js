// Map registry. Each map is a function returning a fresh map data object —
// see meadow.js for the canonical shape.

const meadow = require('./meadow');
const forest = require('./forest');
const arena  = require('./arena');

const MAP_FACTORIES = { meadow, forest, arena };

function listMaps() {
  return Object.keys(MAP_FACTORIES).map(id => {
    const m = MAP_FACTORIES[id]();
    return { id, name: m.name };
  });
}

function getMap(id) {
  const factory = MAP_FACTORIES[id];
  return factory ? factory() : null;
}

function pickRandomMap() {
  const ids = Object.keys(MAP_FACTORIES);
  const id = ids[Math.floor(Math.random() * ids.length)];
  return MAP_FACTORIES[id]();
}

function resolveMap(id) {
  if (id && MAP_FACTORIES[id]) return MAP_FACTORIES[id]();
  return pickRandomMap();
}

module.exports = { listMaps, getMap, pickRandomMap, resolveMap };
