// migrations/1777508798000_add-voice-id-to-prayers.js
// Pin voice on the prayers row. Decouples playback from users.settings.selectedVoiceId.
// Nullable in this PR — service-layer reads + creation-path writes ship in follow-ups,
// then a later migration flips the column to NOT NULL.
//
// Backfill order (first match wins):
//   1. newest audio_files.created_at row's voice_id for that prayer
//   2. owning user's settings->>'selectedVoiceId'
//   3. 'com.apple.voice.compact.en-US.Samantha' (final safety net)
//
// Apple voice IDs are accepted as-is — no S3 lookup, no `voices` table validation.
//
// prayers.voice_id — TEXT NULL

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns('prayers', {
    voice_id: {
      type: 'text',
      notNull: false,
    },
  });

  // 1. Backfill from the newest audio_files row per prayer.
  pgm.sql(`
    UPDATE prayers p
    SET voice_id = af.voice_id
    FROM (
      SELECT DISTINCT ON (prayer_id) prayer_id, voice_id
      FROM audio_files
      ORDER BY prayer_id, created_at DESC
    ) af
    WHERE af.prayer_id = p.id
      AND p.voice_id IS NULL;
  `);

  // 2. For prayers with no audio_files row, fall back to the owner's selected voice.
  pgm.sql(`
    UPDATE prayers p
    SET voice_id = u.settings->>'selectedVoiceId'
    FROM users u
    WHERE u.id = p.user_id
      AND p.voice_id IS NULL
      AND u.settings ? 'selectedVoiceId'
      AND u.settings->>'selectedVoiceId' IS NOT NULL;
  `);

  // 3. Final safety net: any prayer still null defaults to Samantha.
  pgm.sql(`
    UPDATE prayers
    SET voice_id = 'com.apple.voice.compact.en-US.Samantha'
    WHERE voice_id IS NULL;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns('prayers', ['voice_id']);
};
