const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { COUNTDOWN_SEC, DISCONNECT_HOLD_SEC } = require('./config');
const { generateRoomCode, joinQueue, leaveQueue } = require('./matchmaking');
const { GameRoom, BASES } = require('./gameState');
const { OBSTACLES, STREAM_HALF_WIDTH, CROSSING_YS, CROSSING_HALF_HEIGHT } = require('./collision');
const gameLoop = require('./gameLoop');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '../client')));

gameLoop.init(io);

const lobbies = {}; // roomCode -> { players: [{id,name,team,ready}], host: socketId }
const socketToRoom = {}; // socketId -> roomCode
const existingCodes = new Set();

function getLobby(code) { return lobbies[code]; }

function broadcastLobbyState(code) {
  const lobby = getLobby(code);
  if (!lobby) return;
  io.to(code).emit('lobby:state', {
    roomCode: code,
    players: lobby.players,
    host: lobby.host,
  });
}

function startGame(code) {
  const lobby = getLobby(code);
  if (!lobby) return;

  let countdown = COUNTDOWN_SEC;
  io.to(code).emit('game:countdown', { countdown });
  const timer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      io.to(code).emit('game:countdown', { countdown });
    } else {
      clearInterval(timer);
      const room = new GameRoom(code, lobby.players);
      gameLoop.addRoom(room);
      // Send game:start with map data
      io.to(code).emit('game:start', {
        mapSeed: Math.random(),
        teamAssignments: lobby.players.map(p => ({ id: p.id, team: p.team })),
        obstacles: OBSTACLES,
        stream: { halfWidth: STREAM_HALF_WIDTH, crossingYs: CROSSING_YS, crossingHalfHeight: CROSSING_HALF_HEIGHT },
        bases: BASES,
      });
      delete lobbies[code];
    }
  }, 1000);
}

io.on('connection', (socket) => {
  socket.on('lobby:create', ({ playerName }) => {
    try {
      const code = generateRoomCode(existingCodes);
      existingCodes.add(code);
      lobbies[code] = {
        players: [{ id: socket.id, name: playerName, team: 'A', ready: false }],
        host: socket.id,
      };
      socketToRoom[socket.id] = code;
      socket.join(code);
      broadcastLobbyState(code);
    } catch (e) {
      socket.emit('error', { code: 'ROOM_ERROR', message: e.message });
    }
  });

  socket.on('lobby:join', ({ roomCode, playerName }) => {
    const lobby = getLobby(roomCode);
    if (!lobby) { socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found.' }); return; }
    if (lobby.players.length >= 8) { socket.emit('error', { code: 'ROOM_FULL', message: 'Room is full.' }); return; }

    const team = lobby.players.filter(p => p.team === 'A').length <= lobby.players.filter(p => p.team === 'B').length ? 'A' : 'B';
    lobby.players.push({ id: socket.id, name: playerName, team, ready: false });
    socketToRoom[socket.id] = roomCode;
    socket.join(roomCode);
    broadcastLobbyState(roomCode);
  });

  socket.on('queue:join', ({ playerName }) => {
    joinQueue(socket, playerName, (matchedPlayers) => {
      const code = generateRoomCode(existingCodes);
      existingCodes.add(code);
      lobbies[code] = {
        players: matchedPlayers.map(p => ({ id: p.socket.id, name: p.playerName, team: p.team, ready: true })),
        host: matchedPlayers[0].socket.id,
      };
      for (const mp of matchedPlayers) {
        socketToRoom[mp.socket.id] = code;
        mp.socket.join(code);
      }
      startGame(code);
    });
  });

  socket.on('game:ready', () => {
    const code = socketToRoom[socket.id];
    const lobby = getLobby(code);
    if (!lobby) return;
    const player = lobby.players.find(p => p.id === socket.id);
    if (player) player.ready = true;
    const allReady = lobby.players.every(p => p.ready);
    io.to(code).emit('lobby:state', { roomCode: code, players: lobby.players, host: lobby.host, allReady });
  });

  socket.on('game:start_request', () => {
    const code = socketToRoom[socket.id];
    const lobby = getLobby(code);
    if (!lobby || lobby.host !== socket.id) return;
    if (lobby.players.length < 2) { socket.emit('error', { code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 2 players.' }); return; }
    startGame(code);
  });

  socket.on('player:input', ({ dx, dy }) => {
    const code = socketToRoom[socket.id];
    const room = gameLoop.getRoom(code);
    if (!room) return;
    // Server-side validation happens in gameState.applyInput
    room.applyInput(socket.id, dx || 0, dy || 0);
  });

  socket.on('disconnect', () => {
    leaveQueue(socket);
    const code = socketToRoom[socket.id];
    if (!code) return;
    delete socketToRoom[socket.id];

    const lobby = getLobby(code);
    if (lobby) {
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      if (lobby.host === socket.id && lobby.players.length > 0) {
        lobby.host = lobby.players[0].id;
      }
      if (lobby.players.length === 0) {
        delete lobbies[code];
        existingCodes.delete(code);
      } else {
        broadcastLobbyState(code);
      }
      return;
    }

    const room = gameLoop.getRoom(code);
    if (room) {
      room.playerDisconnect(socket.id);
      // Hold slot: reconnect handled on next connection with same name (not implemented for MVP)
    }
  });

  // Reconnect: client can rejoin a room in progress by emitting lobby:join with the code
  socket.on('game:reconnect', ({ roomCode }) => {
    const room = gameLoop.getRoom(roomCode);
    if (!room) { socket.emit('error', { code: 'GAME_NOT_FOUND', message: 'Game not found.' }); return; }
    const ok = room.playerReconnect(socket.id);
    if (ok) {
      socketToRoom[socket.id] = roomCode;
      socket.join(roomCode);
    } else {
      socket.emit('error', { code: 'RECONNECT_FAILED', message: 'Reconnect window expired.' });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Butterfly Duel server on http://localhost:${PORT}`));
