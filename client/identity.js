// Persistent per-browser identity. Generated once, stored in localStorage.
// See spec.md §6.1.

const CLIENT_ID_KEY = 'caught.clientId';
const NAME_KEY      = 'caught.playerName';
const LAST_ROOM_KEY = 'caught.lastRoomCode';

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: simple v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getDisplayName() { return localStorage.getItem(NAME_KEY) || ''; }
export function setDisplayName(n) { localStorage.setItem(NAME_KEY, (n || '').slice(0, 16)); }

export function getLastRoomCode() { return localStorage.getItem(LAST_ROOM_KEY) || null; }
export function setLastRoomCode(c) {
  if (c) localStorage.setItem(LAST_ROOM_KEY, c);
  else localStorage.removeItem(LAST_ROOM_KEY);
}
