const { TICK_RATE } = require('./config');

const rooms = {};     // roomCode -> { room, onEnded }
let io = null;
let interval = null;

function init(ioInstance) {
  io = ioInstance;
  interval = setInterval(tick, 1000 / TICK_RATE);
}

function addRoom(room, onEnded) {
  room.setIO(io);
  rooms[room.roomCode] = { room, onEnded };
}

function removeRoom(code) {
  delete rooms[code];
}

function getRoom(code) {
  const entry = rooms[code];
  return entry ? entry.room : null;
}

function tick() {
  const dt = 1 / TICK_RATE;
  for (const code of Object.keys(rooms)) {
    const entry = rooms[code];
    const { room, onEnded } = entry;
    room.update(dt);
    const state = room.getTickState();
    io.to(room.roomCode).emit('game:tick', state);

    if (room.phase === 'ended') {
      removeRoom(code);
      if (onEnded) onEnded();
    }
  }
}

module.exports = { init, addRoom, removeRoom, getRoom };
