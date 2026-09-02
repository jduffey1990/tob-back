// migrations/1783000000000_tts-generations-lookup-index.js
// Index for the FAILED-state lookup in AudioService.getAudioState.
//
// That path runs whenever a (prayer, voice) has no cached audio and no build
// lock — it reads the most recent tts_generations row to tell "never attempted"
// (MISSING) apart from "attempted and gave up" (FAILED). Playlists call
// getAudioState once per row, so a 20-prayer playlist with missing audio issues
// 20 of these.
//
// The existing indexes are (user_id, created_at) and (provider, created_at) —
// neither helps a prayer_id + voice_id lookup, so this was a sequential scan
// over a table that grows with every generation attempt ever made.

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  // tts_started_at DESC matches the query's ORDER BY, so the newest attempt is
  // the first row read rather than requiring a sort of every attempt for the pair.
  pgm.createIndex('tts_generations', ['prayer_id', 'voice_id', { name: 'tts_started_at', sort: 'DESC' }], {
    name: 'tts_generations_prayer_voice_started_idx',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropIndex('tts_generations', ['prayer_id', 'voice_id', 'tts_started_at'], {
    name: 'tts_generations_prayer_voice_started_idx',
  });
};
