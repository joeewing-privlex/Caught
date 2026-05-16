// Central tunables. Change values here, not in module bodies.
// See spec.md §13.

module.exports = {
  // --- Tick & timing
  TICK_RATE: 20,
  COUNTDOWN_SEC: 3,
  ROUND_DURATION: 180,            // 3 min
  INTERSTITIAL_SEC: 20,
  SERIES_ROUNDS: 5,

  // --- Lobby / players
  MAX_PLAYERS: 10,
  DISCONNECT_HOLD_SEC: 60,
  SESSION_AFK_SEC: 60,

  // --- Movement
  SPEED_NORMAL: 200,
  SPEED_MAX_PENALTY: 0.7,
  TRAIL_SPACING: 30,

  // --- Map (tile grid)
  TILE_SIZE: 32,                  // game units per tile
  MAP_TILES_W: 50,                // 50 × 32 = 1600 world units
  MAP_TILES_H: 37,                // 37 × 32 = 1184 world units (we use 1200 with a 16u bottom margin)
  MAP_WIDTH: 1600,
  MAP_HEIGHT: 1200,

  // --- Butterflies
  BUTTERFLY_SPEED: 60,
  BUTTERFLY_TARGET_COUNT: 30,
  BUTTERFLY_RESPAWN_DELAY_SEC: 2,
  COLLECTION_RADIUS: 40,
  THEFT_RADIUS: 20,

  // --- Power-ups
  POWERUP_RESPAWN_SEC: 10,
  MAGNET_RADIUS: 150,
  BASE_IMMUNITY_SEC: 2,

  // --- Fog of war
  VISION_RADIUS: 350,           // default per-player vision (world units)
  VISION_RADIUS_BOOSTED: 700,   // vision while yellow_trillium is active
};
