// Multi-round series orchestration. Each session = N rounds with rotating mutators.
// See spec.md §4.3.

const { SERIES_ROUNDS, INTERSTITIAL_SEC, COUNTDOWN_SEC } = require('./config');
const { generate } = require('./procgen');
const mutators = require('./mutators');
const { GameRoom } = require('./gameState');

// Per series state, keyed by roomCode in the parent index.js
class Series {
  constructor({ roomCode, lobby, mutatorPool, totalRounds, gameLoop, io, onRoundStart, onSeriesEnd }) {
    this.roomCode = roomCode;
    this.lobby = lobby;          // { players, host, ... } passed from index.js
    this.mutatorPool = mutatorPool && mutatorPool.length ? mutatorPool : ['none', 'bloom', 'speed', 'sudden'];
    this.totalRounds = totalRounds || SERIES_ROUNDS;
    this.roundIndex = 0;
    this.gameLoop = gameLoop;
    this.io = io;
    this.onRoundStart = onRoundStart;
    this.onSeriesEnd = onSeriesEnd;

    this.standings = {};         // clientId -> { name, banked, stolen, lost, points, mvps }
    this.lastMutatorId = null;
    this.readySet = new Set();   // clientIds that have readied for next round
    this.interstitialTimer = null;
    this.phase = 'lobby';        // 'lobby' | 'countdown' | 'playing' | 'interstitial' | 'ended'
    this.currentRoom = null;
  }

  _initStanding(clientId, name) {
    if (!this.standings[clientId]) {
      this.standings[clientId] = {
        clientId, name,
        banked: 0, stolen: 0, lost: 0, points: 0, mvps: 0,
      };
    } else {
      this.standings[clientId].name = name;
    }
  }

  startSeries() {
    for (const p of this.lobby.players) this._initStanding(p.clientId, p.name);
    this._beginRound();
  }

  _beginRound() {
    this.roundIndex++;
    const seed = `${this.roomCode}-${this.roundIndex}`;
    const map = generate(seed);

    const exclude = new Set();
    if (this.lastMutatorId) exclude.add(this.lastMutatorId);
    const mut = mutators.pick(this.mutatorPool, exclude);
    this.lastMutatorId = mut.id;

    // Make sure every player in the lobby has a standings entry (covers late-joiners)
    for (const p of this.lobby.players) this._initStanding(p.clientId, p.name);

    // Countdown then GameRoom creation
    this.phase = 'countdown';
    let countdown = COUNTDOWN_SEC;
    this.io.to(this.roomCode).emit('round:countdown', {
      countdown, roundIndex: this.roundIndex, totalRounds: this.totalRounds,
      mutator: { id: mut.id, name: mut.name, description: mut.description },
    });

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.io.to(this.roomCode).emit('round:countdown', { countdown });
      } else {
        clearInterval(timer);
        this._beginRoom(map, mut);
      }
    }, 1000);
  }

  _beginRoom(map, mut) {
    const playerSnapshot = this.lobby.players.map(p => ({
      clientId: p.clientId, name: p.name, team: p.team, color: p.color, socketId: p.socketId,
    }));
    const room = new GameRoom(this.roomCode, playerSnapshot, map, mut);
    this.currentRoom = room;
    this.gameLoop.addRoom(room, () => this._onRoundEnded());
    this.phase = 'playing';

    this.io.to(this.roomCode).emit('round:start', {
      map: {
        seed: map.seed,
        width: map.width, height: map.height,
        tileSize: map.tileSize, tilesW: map.tilesW, tilesH: map.tilesH,
        cells: map.cells,
        bases: map.bases,
      },
      mutator: { id: mut.id, name: mut.name, description: mut.description },
      roundIndex: this.roundIndex,
      totalRounds: this.totalRounds,
      teamAssignments: this.lobby.players.map(p => ({
        clientId: p.clientId, name: p.name, team: p.team, color: p.color,
      })),
    });

    if (this.onRoundStart) this.onRoundStart(room);
  }

  _onRoundEnded() {
    if (!this.currentRoom) return;
    const room = this.currentRoom;
    const stats = room.getRoundStats();
    const winningTeam = room.scores.A > room.scores.B ? 'A' : room.scores.B > room.scores.A ? 'B' : 'draw';

    // Per-player MVP = highest `banked` this round, ties split
    let topBanked = 0;
    for (const s of stats) topBanked = Math.max(topBanked, s.banked);
    for (const s of stats) {
      const std = this.standings[s.clientId];
      if (!std) continue;
      std.banked += s.banked;
      std.stolen += s.stolen;
      std.lost += s.lost;
      // Team-banking points: each player on the winning team gets credit for their share
      // For simplicity, individual `points` = personal banks
      std.points += s.banked;
      if (s.banked === topBanked && topBanked > 0) std.mvps += 1;
    }

    this.currentRoom = null;

    if (this.roundIndex >= this.totalRounds) {
      this._endSeries();
    } else {
      this._beginInterstitial({ scores: room.scores, winningTeam });
    }
  }

  _beginInterstitial({ scores, winningTeam }) {
    this.phase = 'interstitial';
    this.readySet.clear();

    const standingsList = Object.values(this.standings).sort((a, b) => b.points - a.points);
    const nextSeed = `${this.roomCode}-${this.roundIndex + 1}`;
    // Peek at next mutator (just for preview; final pick happens at _beginRound)
    const exclude = new Set(this.lastMutatorId ? [this.lastMutatorId] : []);
    const nextMut = mutators.pick(this.mutatorPool, exclude);

    this.io.to(this.roomCode).emit('series:standings', {
      standings: standingsList,
      roundIndex: this.roundIndex,
      totalRounds: this.totalRounds,
      lastRoundScores: scores,
      lastWinningTeam: winningTeam,
      nextSeed,
      nextMutator: { id: nextMut.id, name: nextMut.name, description: nextMut.description },
      interstitialSec: INTERSTITIAL_SEC,
    });

    const startNext = () => {
      if (this.interstitialTimer) clearTimeout(this.interstitialTimer);
      this.interstitialTimer = null;
      if (this.phase === 'interstitial') this._beginRound();
    };

    this.interstitialTimer = setTimeout(startNext, INTERSTITIAL_SEC * 1000);
    this._maybeAdvanceFromInterstitial = () => {
      // Advance early if all currently-connected players are ready
      const connected = this.lobby.players.filter(p => !p.disconnected);
      if (connected.length > 0 && connected.every(p => this.readySet.has(p.clientId))) {
        startNext();
      }
    };
  }

  readyForNext(clientId) {
    if (this.phase !== 'interstitial') return;
    this.readySet.add(clientId);
    this.io.to(this.roomCode).emit('series:ready_state', { ready: Array.from(this.readySet) });
    if (this._maybeAdvanceFromInterstitial) this._maybeAdvanceFromInterstitial();
  }

  _endSeries() {
    this.phase = 'ended';
    const standingsList = Object.values(this.standings).sort((a, b) => b.points - a.points);
    this.io.to(this.roomCode).emit('series:end', { standings: standingsList });
    if (this.onSeriesEnd) this.onSeriesEnd();
  }

  // Late-join during interstitial: add player to lobby, give 0-score standing,
  // they'll be picked up at the next _beginRound.
  acceptLateJoin(player) {
    if (this.phase !== 'interstitial') return false;
    if (this.lobby.players.length >= 10) return false;
    if (this.lobby.players.find(p => p.clientId === player.clientId)) return false;
    this.lobby.players.push(player);
    this._initStanding(player.clientId, player.name);
    return true;
  }
}

module.exports = { Series };
