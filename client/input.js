const GAME_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowRight','ArrowDown']);
const keys = new Set();
const dpadState = { up: false, down: false, left: false, right: false };
let inputCallback = null;
let intervalId = null;

function onKeyDown(e) {
  if (GAME_KEYS.has(e.code)) {
    e.preventDefault(); // stop browser scroll on arrow keys
    keys.add(e.code);
  }
}
function onKeyUp(e) { keys.delete(e.code); }

export function init(onInput) {
  inputCallback = onInput;

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  for (const dir of ['up','down','left','right']) {
    const btn = document.getElementById(`dpad-${dir}`);
    if (!btn) continue;
    btn.addEventListener('pointerdown',   e => { e.preventDefault(); dpadState[dir] = true; });
    btn.addEventListener('pointerup',     e => { e.preventDefault(); dpadState[dir] = false; });
    btn.addEventListener('pointercancel', () => { dpadState[dir] = false; });
  }

  if ('ontouchstart' in window) {
    const dpad = document.getElementById('dpad');
    if (dpad) dpad.style.display = 'block';
  }

  intervalId = setInterval(sendInput, 1000 / 20);
}

export function stop() {
  clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup',   onKeyUp);
  keys.clear();
  dpadState.up = dpadState.down = dpadState.left = dpadState.right = false;
}

function sendInput() {
  if (!inputCallback) return;
  let dx = 0, dy = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')    || dpadState.up)    dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')  || dpadState.down)  dy += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')  || dpadState.left)  dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight') || dpadState.right) dx += 1;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag > 0) { dx /= mag; dy /= mag; }
  inputCallback(dx, dy);
}
