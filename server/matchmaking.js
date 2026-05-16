// Room code generation. Public queue was removed in v2 — 10 friends use room codes.

function generateRoomCode(existing) {
  // Crockford-ish alphabet (no I, O, 0, 1 to avoid confusion).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!existing.has(code)) return code;
  }
  throw new Error('Could not generate unique room code');
}

module.exports = { generateRoomCode };
