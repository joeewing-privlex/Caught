const GAME_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowRight','ArrowDown']);
const keys = new Set();
const dpadState = { up: false, down: false, left: false, right: false };
let inputCallback = null;
let intervalId = null;

// Pointer steering. While active, the player moves toward (pointerX, pointerY)
// in screen coords. Player is always at canvas center because the camera
// follows. Below DEADZONE_PX, treat as zero so a tap on the player doesn't jitter.
const DEADZONE_PX = 24;
const pointer = { active: false, x: 0, y: 0, pointerId: null };
let canvasEl = null;

function onKeyDown(e) {
  if (GAME_KEYS.has(e.code)) {
    e.preventDefault(); // stop browser scroll on arrow keys
    keys.add(e.code);
  }
}
function onKeyUp(e) { keys.delete(e.code); }

function setPointerFromEvent(e) {
  const rect = canvasEl.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  pointer.y = e.clientY - rect.top;
}

function onPointerDown(e) {
  e.preventDefault();
  pointer.active = true;
  pointer.pointerId = e.pointerId;
  setPointerFromEvent(e);
  if (canvasEl.setPointerCapture) {
    try { canvasEl.setPointerCapture(e.pointerId); } catch (_) {}
  }
}
function onPointerMove(e) {
  if (!pointer.active) return;
  if (pointer.pointerId !== null && e.pointerId !== pointer.pointerId) return;
  setPointerFromEvent(e);
}
function onPointerUp(e) {
  if (pointer.pointerId !== null && e.pointerId !== pointer.pointerId) return;
  pointer.active = false;
  pointer.pointerId = null;
}

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

  canvasEl = document.getElementById('canvas');
  if (canvasEl) {
    // touch-action: none lets us own gestures on the canvas without the
    // browser stealing them for scroll/pinch.
    canvasEl.style.touchAction = 'none';
    canvasEl.addEventListener('pointerdown',   onPointerDown);
    canvasEl.addEventListener('pointermove',   onPointerMove);
    canvasEl.addEventListener('pointerup',     onPointerUp);
    canvasEl.addEventListener('pointercancel', onPointerUp);
    canvasEl.addEventListener('pointerleave',  onPointerUp);
    canvasEl.addEventListener('contextmenu',   e => e.preventDefault());
  }

  intervalId = setInterval(sendInput, 1000 / 20);
}

export function stop() {
  clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup',   onKeyUp);
  if (canvasEl) {
    canvasEl.removeEventListener('pointerdown',   onPointerDown);
    canvasEl.removeEventListener('pointermove',   onPointerMove);
    canvasEl.removeEventListener('pointerup',     onPointerUp);
    canvasEl.removeEventListener('pointercancel', onPointerUp);
    canvasEl.removeEventListener('pointerleave',  onPointerUp);
  }
  keys.clear();
  dpadState.up = dpadState.down = dpadState.left = dpadState.right = false;
  pointer.active = false;
  pointer.pointerId = null;
}

function sendInput() {
  if (!inputCallback) return;
  let dx = 0, dy = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')    || dpadState.up)    dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')  || dpadState.down)  dy += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')  || dpadState.left)  dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight') || dpadState.right) dx += 1;

  // Pointer steering kicks in only when no key/dpad input is active, so
  // keyboard players are never overridden by an accidental click.
  if (dx === 0 && dy === 0 && pointer.active && canvasEl) {
    const cx = canvasEl.width  / 2;
    const cy = canvasEl.height / 2;
    const px = pointer.x - cx;
    const py = pointer.y - cy;
    const dist = Math.sqrt(px * px + py * py);
    if (dist > DEADZONE_PX) { dx = px / dist; dy = py / dist; }
  }

  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag > 0) { dx /= mag; dy /= mag; }
  inputCallback(dx, dy);
}
