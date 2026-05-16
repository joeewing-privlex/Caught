// Client entry point. Wires socket events to UI / renderer / input.

import * as Input    from './input.js';
import * as Renderer from './renderer.js';
import * as UI       from './ui.js';
import { getClientId, getDisplayName, setDisplayName, getLastRoomCode, setLastRoomCode } from './identity.js';

const POWERUP_MAX = { white_trillium: 5, pink_trillium: 6, red_trillium: 5 };

const clientId = getClientId();
let savedName = getDisplayName();
let lastRoomCode = getLastRoomCode();

let socket = null;
let myRoom = null;
let myTeam = null;
let inGame = false;
let flowers = [];
let myPowerupMax = 5;
let lastPowerup = null;
let lastTickReceivedAt = 0;
let tickWatcher = null;
let bootWaitTimer = null;
let assetsPreloaded = false;

const canvas = document.getElementById('canvas');

async function boot() {
  UI.init();
  UI.setBootMessage('Connecting…');

  // Start asset preload in background (independent of socket)
  Renderer.preloadAssets()
    .then(() => { assetsPreloaded = true; })
    .catch(err => console.error('asset preload failed', err));

  // Show "waking up" message if connect takes long (Render cold start)
  bootWaitTimer = setTimeout(() => {
    UI.setBootMessage('Waking up the server… this can take up to a minute on first launch.');
  }, 2000);

  socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelayMax: 3000,
  });

  wireSocketEvents();
  wireUIEvents();
}

function wireSocketEvents() {
  socket.on('connect', () => {
    clearTimeout(bootWaitTimer);
    Renderer.setConnStatus('ok');
    // Send hello on every connect (including reconnects)
    socket.emit('session:hello', {
      clientId,
      displayName: savedName,
      lastRoomCode,
    });
  });

  socket.on('disconnect', () => {
    Renderer.setConnStatus('warn');
    if (inGame) UI.showReconnectOverlay(true, 'Lost connection. Trying to restore…');
  });

  socket.on('connect_error', () => {
    Renderer.setConnStatus('warn');
  });

  socket.io.on('reconnect_failed', () => {
    Renderer.setConnStatus('dead');
    UI.showReconnectOverlay(true, 'Could not reconnect. Refresh the page to try again.');
  });

  socket.on('session:fresh', () => {
    inGame = false;
    UI.showHUD(false);
    UI.showReconnectOverlay(false);
    UI.show('screen-menu');
    document.getElementById('player-name').value = savedName;
  });

  socket.on('session:resumed', ({ roomCode, role, snapshot }) => {
    myRoom = roomCode;
    setLastRoomCode(roomCode);
    UI.showReconnectOverlay(false);
    if (role === 'in_game' && snapshot) {
      enterGame(snapshot);
    } else {
      UI.show('screen-lobby');
      inGame = false;
      UI.showHUD(false);
    }
  });

  socket.on('lobby:state', (data) => {
    myRoom = data.roomCode;
    setLastRoomCode(data.roomCode);
    const me = data.players.find(p => p.clientId === clientId);
    if (me) myTeam = me.team;
    if (!inGame) UI.show('screen-lobby');
    UI.renderLobby(data, clientId);
  });

  socket.on('round:countdown', ({ countdown, roundIndex, totalRounds, mutator }) => {
    UI.showHUD(false);
    if (countdown > 0) UI.showCountdown(countdown);
    if (mutator) Renderer.setMutatorBadge(mutator.name);
    if (roundIndex) Renderer.setRoundBadge(roundIndex, totalRounds);
  });

  socket.on('round:start', (data) => {
    enterRound(data);
  });

  socket.on('game:tick', (state) => {
    if (!inGame) return;
    lastTickReceivedAt = performance.now();
    state.flowers = flowers;
    Renderer.pushState(state);
    const me = state.players.find(p => p.id === clientId);
    if (me) {
      if (me.powerup && me.powerup !== lastPowerup) {
        myPowerupMax = POWERUP_MAX[me.powerup] || 5;
      }
      lastPowerup = me.powerup;
      Renderer.updateHUD(state, me.powerup, me.powerupRemaining, myPowerupMax);
    }
  });

  socket.on('series:standings', (data) => {
    inGame = false;
    UI.showHUD(false);
    Input.stop();
    Renderer.stop();
    UI.show('screen-interstitial');
    UI.renderInterstitial(data, clientId);
  });

  socket.on('series:end', (data) => {
    inGame = false;
    UI.showHUD(false);
    Input.stop();
    Renderer.stop();
    UI.show('screen-series-end');
    UI.renderSeriesEnd(data, clientId);
  });

  socket.on('series:ready_state', (data) => {
    // could surface ready count; left as no-op for now
  });

  socket.on('powerup:spawn', (flower) => {
    flowers.push({ id: flower.id, type: flower.type, x: flower.position.x, y: flower.position.y });
  });

  socket.on('powerup:collected', ({ id }) => {
    flowers = flowers.filter(f => f.id !== id);
  });

  socket.on('player:banked', ({ playerId, count, rawCount }) => {
    const color = playerId === clientId ? '#ffd060' : '#a0d070';
    const text  = playerId === clientId
      ? `+${count} banked!`
      : `Team banked ${count}!`;
    Renderer.pushNotification(text, 800, 500, color);
  });

  socket.on('player:stolen', ({ victimId, thiefId, count }) => {
    const color = victimId === clientId ? '#ff6060' : thiefId === clientId ? '#60ff60' : '#ffffff';
    const text  = victimId === clientId ? `Stolen! -${count}` : thiefId === clientId ? `Stole ${count}!` : null;
    if (text) Renderer.pushNotification(text, 800, 300, color);
  });

  socket.on('player:disconnected', ({ clientId: cid, holdUntil }) => {
    // Renderer already shows ghost via player.disconnected flag in tick
  });

  socket.on('player:reconnected', () => { /* nothing extra to do */ });

  socket.on('player:left', ({ name }) => {
    Renderer.pushNotification(`${name} left`, 800, 200, '#a0a0a0');
  });

  socket.on('error', ({ message } = {}) => {
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const errEl = active.querySelector('[id^="error-msg"]');
    if (errEl) errEl.textContent = message || 'Error';
  });
}

function wireUIEvents() {
  document.getElementById('btn-create').addEventListener('click', () => {
    const name = readName('error-msg');
    if (!name) return;
    socket.emit('lobby:create', { playerName: name });
  });

  document.getElementById('btn-join-toggle').addEventListener('click', () => UI.show('screen-join'));
  document.getElementById('btn-join-back').addEventListener('click', () => UI.show('screen-menu'));

  document.getElementById('btn-join-submit').addEventListener('click', () => {
    const name = readName('error-msg-join');
    if (!name) return;
    const code = document.getElementById('room-code-input').value.toUpperCase().trim();
    if (code.length !== 6) { UI.setError('error-msg-join', 'Enter a 6-character code.'); return; }
    socket.emit('lobby:join', { roomCode: code, playerName: name });
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('game:start_request');
  });

  document.getElementById('btn-leave').addEventListener('click', () => {
    socket.emit('lobby:leave');
    setLastRoomCode(null);
    location.reload();
  });

  document.getElementById('btn-ready-next').addEventListener('click', () => {
    socket.emit('series:ready_next');
    document.getElementById('btn-ready-next').textContent = 'Ready! ✓';
  });

  document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
    UI.show('screen-lobby');
  });

  // Color picker — delegate
  document.getElementById('color-grid').addEventListener('click', (e) => {
    const sw = e.target.closest('.color-swatch');
    if (!sw || sw.classList.contains('taken') || sw.classList.contains('mine')) return;
    socket.emit('lobby:set_color', { color: sw.dataset.color });
  });

  // Team swap — delegate
  document.getElementById('lobby-players').addEventListener('click', (e) => {
    if (e.target.dataset.action === 'swap-team') {
      const newTeam = myTeam === 'A' ? 'B' : 'A';
      socket.emit('lobby:set_team', { team: newTeam });
    }
  });

  // Mutator pool — delegate
  document.getElementById('mutator-list').addEventListener('change', (e) => {
    if (e.target.matches('input[data-mutator]')) {
      const checks = document.querySelectorAll('#mutator-list input[data-mutator]:checked');
      const ids = Array.from(checks).map(c => c.dataset.mutator);
      socket.emit('lobby:set_mutator_pool', { mutators: ids });
    }
  });
}

function enterRound(data) {
  myRoom = myRoom || lastRoomCode;
  // teamAssignments tells us our team
  const me = data.teamAssignments.find(a => a.clientId === clientId);
  if (me) myTeam = me.team;
  flowers = [];

  const map = data.map;
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
  UI.showHUD(true);
  Renderer.setMutatorBadge(data.mutator ? data.mutator.name : '');
  Renderer.setRoundBadge(data.roundIndex, data.totalRounds);

  document.getElementById('btn-ready-next').textContent = 'Ready for next round';

  Renderer.init(canvas, map, clientId, myTeam);
  Renderer.start();
  Input.init((dx, dy) => socket.emit('player:input', { dx, dy }));
  inGame = true;
  lastTickReceivedAt = performance.now();
  startTickWatcher();

  if (map.name) UI.showMapName(map.name);
  UI.showCountdown('GO!');
}

function enterGame(snapshot) {
  // Resumed in-game: snapshot has map, mutator, teamAssignments, tick, flowers
  const me = snapshot.teamAssignments.find(a => a.clientId === clientId);
  if (me) myTeam = me.team;
  flowers = snapshot.flowers || [];

  for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
  UI.showHUD(true);
  Renderer.setMutatorBadge(snapshot.mutator ? snapshot.mutator.name : '');
  // No round/total info in resume — leave as-is

  Renderer.init(canvas, snapshot.map, clientId, myTeam);
  Renderer.start();
  Renderer.pushState({ ...snapshot.tick, flowers });
  Input.init((dx, dy) => socket.emit('player:input', { dx, dy }));
  inGame = true;
  lastTickReceivedAt = performance.now();
  startTickWatcher();
}

function startTickWatcher() {
  clearInterval(tickWatcher);
  tickWatcher = setInterval(() => {
    if (!inGame) return;
    const since = performance.now() - lastTickReceivedAt;
    if (since > 2000) {
      Renderer.setConnStatus('warn');
      UI.showReconnectOverlay(true, 'No data from server for a moment…');
    } else {
      Renderer.setConnStatus('ok');
      UI.showReconnectOverlay(false);
    }
  }, 500);
}

function readName(errElId) {
  const input = document.getElementById('player-name');
  const val = (input ? input.value.trim() : '') || savedName;
  if (!val) { UI.setError(errElId, 'Please enter your name.'); return null; }
  if (val.length > 16) { UI.setError(errElId, 'Name too long (max 16 chars).'); return null; }
  UI.setError(errElId, '');
  savedName = val;
  setDisplayName(val);
  return val;
}

boot();
