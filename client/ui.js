// UI helpers — screen visibility, lobby rendering, standings, countdowns.

import { COLORS } from './sprites.js';

const MUTATOR_DESCRIPTIONS = {
  none:   { name: 'None',            desc: 'Baseline rules.' },
  bloom:  { name: 'Butterfly Bloom', desc: 'Twice as many butterflies.' },
  speed:  { name: 'Speed Demons',    desc: '30% faster movement.' },
  sudden: { name: 'Sudden Death',    desc: 'Short round, points doubled.' },
};

export function init() {
  // Boot screen is active by default in HTML.
}

export function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

export function showHUD(on) {
  document.getElementById('hud').style.display = on ? 'block' : 'none';
}

export function setError(elId, msg) {
  const el = document.getElementById(elId);
  if (el) el.textContent = msg || '';
}

export function setBootMessage(msg) {
  const el = document.getElementById('boot-msg');
  if (el) el.textContent = msg;
}

export function showCountdown(text) {
  const el = document.getElementById('countdown-overlay');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 800);
}

export function showReconnectOverlay(on, msg) {
  const el = document.getElementById('reconnect-overlay');
  if (!el) return;
  el.classList.toggle('show', !!on);
  if (msg) document.getElementById('reconnect-msg').textContent = msg;
}

export function showMapName(name) {
  const el = document.getElementById('map-name-banner');
  if (!el) return;
  el.textContent = name;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

export function renderLobby(data, myClientId) {
  document.getElementById('room-code-display').textContent = data.roomCode;

  // Players list
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  for (const p of data.players) {
    const row = document.createElement('div');
    row.className = `lobby-player team-${p.team.toLowerCase()}${p.disconnected ? ' disc' : ''}`;
    row.innerHTML = `
      <span class="swatch swatch-${p.color}"></span>
      <span class="name">${escapeHTML(p.name)}${p.disconnected ? ' (offline)' : ''}</span>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
    `;
    if (p.clientId === myClientId) {
      const swap = document.createElement('button');
      swap.className = 'team-swap-btn';
      swap.textContent = 'Swap team';
      swap.dataset.action = 'swap-team';
      row.appendChild(swap);
    }
    list.appendChild(row);
  }

  // Color picker
  const grid = document.getElementById('color-grid');
  grid.innerHTML = '';
  const takenColors = new Set(data.players.filter(p => p.clientId !== myClientId).map(p => p.color));
  const me = data.players.find(p => p.clientId === myClientId);
  for (const c of COLORS) {
    const sw = document.createElement('div');
    sw.className = `color-swatch swatch-${c}`;
    sw.dataset.color = c;
    if (takenColors.has(c)) sw.classList.add('taken');
    if (me && me.color === c) sw.classList.add('mine');
    grid.appendChild(sw);
  }

  // Mutator pool (host only)
  const muHeader = document.getElementById('mutator-pool-header');
  const muList = document.getElementById('mutator-list');
  if (me && me.isHost) {
    muHeader.style.display = '';
    muList.style.display = '';
    muList.innerHTML = '';
    const pool = new Set(data.mutatorPool || []);
    for (const id of (data.availableMutators || [])) {
      const m = MUTATOR_DESCRIPTIONS[id] || { name: id, desc: '' };
      const row = document.createElement('label');
      row.className = 'mutator-row';
      row.innerHTML = `
        <input type="checkbox" data-mutator="${id}" ${pool.has(id) ? 'checked' : ''} />
        <span class="name">${m.name}</span>
        <span class="desc">${m.desc}</span>
      `;
      muList.appendChild(row);
    }
  } else {
    muHeader.style.display = 'none';
    muList.style.display = 'none';
  }

  // Start button — host only, and only if 2+ connected
  const startBtn = document.getElementById('btn-start');
  const connectedCount = data.players.filter(p => !p.disconnected).length;
  if (me && me.isHost) {
    startBtn.style.display = '';
    startBtn.disabled = connectedCount < 2;
  } else {
    startBtn.style.display = 'none';
  }
  document.getElementById('waiting-msg').textContent =
    connectedCount < 2 ? 'Waiting for at least 2 players…' :
    (me && !me.isHost) ? 'Waiting for host to start the series.' : '';
}

export function renderInterstitial(data, myClientId) {
  document.getElementById('interstitial-title').textContent =
    `Round ${data.roundIndex} of ${data.totalRounds} complete`;

  const sc = data.lastRoundScores || { A: 0, B: 0 };
  const win = data.lastWinningTeam;
  document.getElementById('interstitial-scores').textContent =
    `Team A ${sc.A}  ·  Team B ${sc.B}` + (win === 'draw' ? ' — draw' : `  ·  Team ${win} took the round`);

  renderStandings('standings-list', data.standings, myClientId);

  const nm = data.nextMutator || {};
  const nMap = data.nextMap || {};
  document.getElementById('next-mutator-info').innerHTML =
    `Next map: <strong>${escapeHTML(nMap.name || '?')}</strong> · ` +
    `Mutator: <strong>${escapeHTML(nm.name || 'None')}</strong> — ${escapeHTML(nm.description || '')}`;

  document.getElementById('interstitial-countdown').textContent =
    `Next round in ${data.interstitialSec || 20}s, or when everyone's ready.`;
}

export function renderSeriesEnd(data, myClientId) {
  renderStandings('final-standings-list', data.standings, myClientId);
  const top = data.standings[0];
  if (top) {
    document.getElementById('series-end-title').textContent =
      `🏆 ${top.name} wins the series!`;
  }
}

function renderStandings(containerId, standings, myClientId) {
  const c = document.getElementById(containerId);
  c.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'standing-row';
  header.style.fontWeight = 'bold';
  header.innerHTML = `
    <span class="rank">#</span><span class="name">Player</span>
    <span class="stat">Bank</span><span class="stat">Stole</span><span class="stat">Lost</span><span class="stat">MVP</span>
  `;
  c.appendChild(header);
  standings.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = `standing-row${s.clientId === myClientId ? ' mine' : ''}`;
    row.innerHTML = `
      <span class="rank">${i + 1}</span>
      <span class="name">${escapeHTML(s.name)}</span>
      <span class="stat">${s.banked}</span>
      <span class="stat">${s.stolen}</span>
      <span class="stat">${s.lost}</span>
      <span class="stat">${s.mvps}</span>
    `;
    c.appendChild(row);
  });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
