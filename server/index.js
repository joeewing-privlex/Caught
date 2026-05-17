const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MAX_PLAYERS } = require('./config');
const { generateRoomCode } = require('./matchmaking');
const gameLoop = require('./gameLoop');
const { Series } = require('./series');
const { ALL_IDS: MUTATOR_IDS } = require('./mutators');

const app = express();
const server = http.createServer(app);
const io = new Server(server);  // same-origin, no CORS needed on Render

app.use(express.static(path.join(__dirname, '../client'), {
  maxAge: '1h',
  etag: true,
  lastModified: true,
}));

// Health endpoint for Render
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    rooms: Object.keys(lobbies).length,
    activeGames: Object.keys(activeSeries).length,
    uptime: process.uptime(),
  });
});

gameLoop.init(io);

// roomCode -> lobby record. Lobby is the source of truth for who's in the room
// during pre-game and between rounds. The Series object reads from this lobby.
//
// lobby = {
//   roomCode,
//   players: [{ clientId, socketId, name, color, team, ready, disconnected, disconnectAt }],
//   host: clientId,
//   mutatorPool: string[],
//   mode: 'lobby' | 'series',
// }
const lobbies = {};
const existingCodes = new Set();
const activeSeries = {};                 // roomCode -> Series
const socketToClient = {};               // socketId -> clientId
const clientToRoom = {};                 // clientId -> roomCode

const COLOR_POOL = [
  'blue', 'brown', 'gray', 'green', 'orange',
  'pink', 'purple', 'red', 'turquoise', 'yellow',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLobby(code) { return lobbies[code]; }

function nextFreeColor(lobby) {
  const taken = new Set(lobby.players.map(p => p.color));
  return COLOR_POOL.find(c => !taken.has(c)) || COLOR_POOL[0];
}

function assignTeamForJoin(lobby) {
  const a = lobby.players.filter(p => p.team === 'A').length;
  const b = lobby.players.filter(p => p.team === 'B').length;
  return a <= b ? 'A' : 'B';
}

function broadcastLobbyState(code) {
  const lobby = getLobby(code);
  if (!lobby) return;
  io.to(code).emit('lobby:state', {
    roomCode: code,
    players: lobby.players.map(p => ({
      clientId: p.clientId,
      name: p.name,
      color: p.color,
      team: p.team,
      ready: p.ready,
      isHost: p.clientId === lobby.host,
      disconnected: !!p.disconnected,
    })),
    host: lobby.host,
    mutatorPool: lobby.mutatorPool,
    availableMutators: MUTATOR_IDS,
    maxPlayers: MAX_PLAYERS,
    mode: lobby.mode,
  });
}

function promoteNewHostIfNeeded(lobby) {
  const hostPlayer = lobby.players.find(p => p.clientId === lobby.host);
  if (hostPlayer && !hostPlayer.disconnected) return;
  const candidate = lobby.players.find(p => !p.disconnected);
  if (candidate) lobby.host = candidate.clientId;
}

function tearDownLobby(code) {
  delete lobbies[code];
  existingCodes.delete(code);
  // also clear any clientToRoom entries pointing here
  for (const [cid, rc] of Object.entries(clientToRoom)) {
    if (rc === code) delete clientToRoom[cid];
  }
}

// ─── Socket handlers ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  let clientId = null;
  let displayName = '';

  // First message from any client. Either resumes a held slot or returns "fresh".
  socket.on('session:hello', (data = {}) => {
    clientId = data.clientId;
    displayName = (data.displayName || '').toString().slice(0, 16);
    if (!clientId) {
      socket.emit('error', { code: 'NO_CLIENT_ID', message: 'Missing clientId.' });
      return;
    }
    socketToClient[socket.id] = clientId;

    const existingRoom = clientToRoom[clientId];
    if (!existingRoom) { socket.emit('session:fresh'); return; }

    const lobby = lobbies[existingRoom];
    if (!lobby) { socket.emit('session:fresh'); return; }

    const player = lobby.players.find(p => p.clientId === clientId);
    if (!player) { socket.emit('session:fresh'); return; }

    // Restore: rebind socket, clear disconnect flag
    player.socketId = socket.id;
    if (player.disconnected) {
      player.disconnected = false;
      player.disconnectAt = null;
    }
    if (displayName) player.name = displayName;
    socket.join(existingRoom);

    const series = activeSeries[existingRoom];
    if (series && series.currentRoom && series.currentRoom.hasClient(clientId)) {
      // In-game reconnect — restore in GameRoom
      series.currentRoom.playerReconnect(clientId, socket.id);
      socket.emit('session:resumed', {
        roomCode: existingRoom,
        role: 'in_game',
        snapshot: series.currentRoom.getResumeSnapshot(),
      });
    } else if (series) {
      // Series running but they're not in the GameRoom (mid-interstitial join)
      socket.emit('session:resumed', {
        roomCode: existingRoom,
        role: 'in_lobby',
        snapshot: null,
      });
      broadcastLobbyState(existingRoom);
    } else {
      socket.emit('session:resumed', {
        roomCode: existingRoom,
        role: 'in_lobby',
        snapshot: null,
      });
      broadcastLobbyState(existingRoom);
    }
  });

  socket.on('lobby:create', ({ playerName } = {}) => {
    if (!clientId) { socket.emit('error', { code: 'NO_SESSION', message: 'Send session:hello first.' }); return; }
    const code = generateRoomCode(existingCodes);
    existingCodes.add(code);
    const name = (playerName || displayName || 'player').toString().slice(0, 16);
    const color = COLOR_POOL[0];
    const lobby = {
      roomCode: code,
      players: [{
        clientId, socketId: socket.id, name, color,
        team: 'A', ready: false, disconnected: false, disconnectAt: null,
      }],
      host: clientId,
      mutatorPool: ['none', 'bloom', 'speed', 'sudden'],
      mode: 'lobby',
    };
    lobbies[code] = lobby;
    clientToRoom[clientId] = code;
    socket.join(code);
    broadcastLobbyState(code);
  });

  socket.on('lobby:join', ({ roomCode, playerName } = {}) => {
    if (!clientId) { socket.emit('error', { code: 'NO_SESSION', message: 'Send session:hello first.' }); return; }
    const code = (roomCode || '').toUpperCase().trim();
    const lobby = getLobby(code);
    if (!lobby) { socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found.' }); return; }
    if (lobby.players.find(p => p.clientId === clientId)) {
      // Already in this lobby — just resync state
      const me = lobby.players.find(p => p.clientId === clientId);
      me.socketId = socket.id;
      me.disconnected = false;
      socket.join(code);
      broadcastLobbyState(code);
      return;
    }
    const connectedCount = lobby.players.filter(p => !p.disconnected).length;
    if (connectedCount >= MAX_PLAYERS) {
      socket.emit('error', { code: 'ROOM_FULL', message: 'Room is full.' });
      return;
    }

    const series = activeSeries[code];
    if (series && series.phase !== 'interstitial' && series.phase !== 'lobby' && series.phase !== 'ended') {
      socket.emit('error', { code: 'GAME_IN_PROGRESS', message: 'Round in progress. Try again between rounds.' });
      return;
    }

    const name = (playerName || displayName || 'player').toString().slice(0, 16);
    const color = nextFreeColor(lobby);
    const team = assignTeamForJoin(lobby);
    const player = {
      clientId, socketId: socket.id, name, color,
      team, ready: false, disconnected: false, disconnectAt: null,
    };
    lobby.players.push(player);
    clientToRoom[clientId] = code;
    socket.join(code);

    // If a series is in interstitial, register this as a late-join
    if (series && series.phase === 'interstitial') {
      series.acceptLateJoin({ ...player, socketId: socket.id });
    }

    broadcastLobbyState(code);
  });

  socket.on('lobby:set_color', ({ color } = {}) => {
    const code = clientToRoom[clientId];
    const lobby = getLobby(code);
    if (!lobby) return;
    if (!COLOR_POOL.includes(color)) return;
    if (lobby.players.find(p => p.color === color && p.clientId !== clientId)) {
      socket.emit('error', { code: 'COLOR_TAKEN', message: 'That color is taken.' });
      return;
    }
    const me = lobby.players.find(p => p.clientId === clientId);
    if (me) me.color = color;
    broadcastLobbyState(code);
  });

  socket.on('lobby:set_team', ({ team } = {}) => {
    const code = clientToRoom[clientId];
    const lobby = getLobby(code);
    if (!lobby) return;
    if (team !== 'A' && team !== 'B') return;
    const me = lobby.players.find(p => p.clientId === clientId);
    if (!me) return;
    // Only allow self-swap if it doesn't make the team imbalance worse
    const otherTeam = me.team;
    if (team === otherTeam) return;
    const a = lobby.players.filter(p => p.team === 'A').length;
    const b = lobby.players.filter(p => p.team === 'B').length;
    const after = team === 'A' ? { a: a + 1, b: b - 1 } : { a: a - 1, b: b + 1 };
    if (Math.abs(after.a - after.b) > Math.abs(a - b) + 1) {
      socket.emit('error', { code: 'TEAM_IMBALANCE', message: 'That would imbalance the teams.' });
      return;
    }
    me.team = team;
    broadcastLobbyState(code);
  });

  socket.on('lobby:set_mutator_pool', ({ mutators } = {}) => {
    const code = clientToRoom[clientId];
    const lobby = getLobby(code);
    if (!lobby || lobby.host !== clientId) return;
    const valid = (Array.isArray(mutators) ? mutators : []).filter(m => MUTATOR_IDS.includes(m));
    if (valid.length === 0) {
      socket.emit('error', { code: 'EMPTY_POOL', message: 'Pick at least one mutator.' });
      return;
    }
    lobby.mutatorPool = valid;
    broadcastLobbyState(code);
  });

  socket.on('game:start_request', () => {
    const code = clientToRoom[clientId];
    const lobby = getLobby(code);
    if (!lobby || lobby.host !== clientId) return;
    if (activeSeries[code]) { socket.emit('error', { code: 'ALREADY_RUNNING', message: 'Series already started.' }); return; }
    const connected = lobby.players.filter(p => !p.disconnected);
    if (connected.length < 2) {
      socket.emit('error', { code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 2 players.' });
      return;
    }
    startSeries(code);
  });

  socket.on('series:ready_next', () => {
    const code = clientToRoom[clientId];
    const series = activeSeries[code];
    if (!series) return;
    series.readyForNext(clientId);
  });

  socket.on('player:input', ({ dx, dy } = {}) => {
    const code = clientToRoom[clientId];
    const series = activeSeries[code];
    if (!series || !series.currentRoom) return;
    series.currentRoom.applyInputByClientId(clientId, dx || 0, dy || 0);
  });

  socket.on('lobby:leave', () => {
    const code = clientToRoom[clientId];
    if (!code) return;
    removePlayerFromLobby(code, clientId, /* immediate */ true);
    socket.leave(code);
  });

  socket.on('disconnect', () => {
    if (!clientId) return;
    delete socketToClient[socket.id];
    const code = clientToRoom[clientId];
    if (!code) return;
    const lobby = getLobby(code);
    if (!lobby) return;

    const player = lobby.players.find(p => p.clientId === clientId);
    if (!player) return;

    player.disconnected = true;
    player.disconnectAt = Date.now();

    // If they're in an active GameRoom, hand off to the room's disconnect handling
    const series = activeSeries[code];
    if (series && series.currentRoom && series.currentRoom.hasClient(clientId)) {
      series.currentRoom.playerDisconnect(clientId);
    }

    // Host transfer if needed
    promoteNewHostIfNeeded(lobby);

    // Schedule slot reaping after DISCONNECT_HOLD_SEC if they don't return
    setTimeout(() => reapIfStillDisconnected(code, clientId), require('./config').DISCONNECT_HOLD_SEC * 1000);

    broadcastLobbyState(code);
  });
});

function removePlayerFromLobby(code, clientId, immediate) {
  const lobby = getLobby(code);
  if (!lobby) return;
  lobby.players = lobby.players.filter(p => p.clientId !== clientId);
  if (clientToRoom[clientId] === code) delete clientToRoom[clientId];

  if (lobby.players.length === 0) {
    if (activeSeries[code]) {
      // Series is running but everyone left — let it tear down via its own end path
      activeSeries[code] = null;
      delete activeSeries[code];
    }
    tearDownLobby(code);
    return;
  }
  if (lobby.host === clientId) promoteNewHostIfNeeded(lobby);
  broadcastLobbyState(code);
}

function reapIfStillDisconnected(code, clientId) {
  const lobby = getLobby(code);
  if (!lobby) return;
  const player = lobby.players.find(p => p.clientId === clientId);
  if (!player || !player.disconnected) return;
  removePlayerFromLobby(code, clientId, false);
}

function startSeries(code) {
  const lobby = getLobby(code);
  if (!lobby) return;
  lobby.mode = 'series';
  const series = new Series({
    roomCode: code,
    lobby,
    mutatorPool: lobby.mutatorPool,
    gameLoop,
    io,
    onSeriesEnd: () => {
      delete activeSeries[code];
      lobby.mode = 'lobby';
      // Keep the lobby alive so players can start a new series
      // (the client gets a series:end event and can show "play another series")
      // Reset ready flags
      for (const p of lobby.players) p.ready = false;
      broadcastLobbyState(code);
    },
  });
  activeSeries[code] = series;
  series.startSeries();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Caught server on http://localhost:${PORT}`));
