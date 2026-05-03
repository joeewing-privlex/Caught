const screens = {};

export function init() {
  for (const el of document.querySelectorAll('.screen')) {
    screens[el.id] = el;
  }
}

export function show(id) {
  for (const el of Object.values(screens)) el.classList.remove('active');
  const target = screens[id] || screens['screen-menu'];
  target.classList.add('active');
}

export function setError(elId, msg) {
  const el = document.getElementById(elId);
  if (el) el.textContent = msg || '';
}

export function renderLobby({ roomCode, players, host, allReady }, myId) {
  document.getElementById('room-code-display').textContent = roomCode || '';
  const container = document.getElementById('lobby-players');
  container.innerHTML = '';
  for (const p of (players || [])) {
    const div = document.createElement('div');
    div.className = `lobby-player team-${p.team.toLowerCase()}`;
    div.innerHTML = `<span>${p.name}${p.id === host ? ' <span class="host-badge">HOST</span>' : ''}</span><span>Team ${p.team}${p.ready ? ' ✓' : ''}</span>`;
    container.appendChild(div);
  }
  const startBtn = document.getElementById('btn-start');
  const waitMsg  = document.getElementById('waiting-msg');
  if (myId === host) {
    startBtn.style.display = allReady && players.length >= 2 ? 'block' : 'none';
    waitMsg.textContent = allReady ? '' : 'Waiting for all players to ready up…';
  } else {
    startBtn.style.display = 'none';
    waitMsg.textContent = 'Waiting for host to start…';
  }
}

export function showCountdown(n) {
  const el = document.getElementById('countdown-overlay');
  el.textContent = n > 0 ? n : 'GO!';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 800);
}

export function showEndScreen({ scores, winner }, myTeam) {
  show('screen-end');
  const titles = { A: '🏆 Team A Wins!', B: '🏆 Team B Wins!', draw: "It's a Draw!" };
  document.getElementById('end-title').textContent = titles[winner] || 'Game Over';
  document.getElementById('end-score-a-val').textContent = scores.A;
  document.getElementById('end-score-b-val').textContent = scores.B;
  document.getElementById('end-score-a').classList.toggle('winner', winner === 'A');
  document.getElementById('end-score-b').classList.toggle('winner', winner === 'B');

  let sec = 10;
  const msg = document.getElementById('end-countdown-msg');
  const tick = setInterval(() => {
    msg.textContent = `Returning to menu in ${sec--}s…`;
    if (sec < 0) { clearInterval(tick); show('screen-menu'); }
  }, 1000);
}

export function showHUD(visible) {
  document.getElementById('hud').style.display = visible ? 'block' : 'none';
}
