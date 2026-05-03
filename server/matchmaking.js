const { PUBLIC_MATCH_WAIT_SEC, PUBLIC_MATCH_MIN, PUBLIC_MATCH_IDEAL } = require('./config');

const queue = []; // { socket, playerName, joinedAt }
let queueTimer = null;

function generateRoomCode(existing) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!existing.has(code)) return code;
  }
  throw new Error('Could not generate unique room code');
}

function joinQueue(socket, playerName, onMatch) {
  queue.push({ socket, playerName, joinedAt: Date.now() });

  if (queue.length >= PUBLIC_MATCH_IDEAL) {
    clearTimeout(queueTimer);
    queueTimer = null;
    fireMatch(onMatch);
    return;
  }

  if (!queueTimer) {
    queueTimer = setTimeout(() => {
      queueTimer = null;
      if (queue.length >= PUBLIC_MATCH_MIN) fireMatch(onMatch);
    }, PUBLIC_MATCH_WAIT_SEC * 1000);
  }
}

function leaveQueue(socket) {
  const idx = queue.findIndex(e => e.socket.id === socket.id);
  if (idx !== -1) queue.splice(idx, 1);
}

function fireMatch(onMatch) {
  const players = queue.splice(0, PUBLIC_MATCH_IDEAL);
  // Assign teams by alternating queue order
  players.forEach((p, i) => { p.team = i % 2 === 0 ? 'A' : 'B'; });
  onMatch(players);
}

module.exports = { generateRoomCode, joinQueue, leaveQueue };
