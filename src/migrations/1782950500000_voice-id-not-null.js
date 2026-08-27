// migrations/1782950500000_voice-id-not-null.js
// Finishes the voice-pinning initiative: prayers.voice_id becomes NOT NULL.
// Every write path has pinned a voice since 1777508798000 (creation routes,
// template seed, repin endpoint), and that migration backfilled all existing
// rows — the safety-net UPDATE here catches any row created through a since-
// removed path before the constraint lands.

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`
    UPDATE prayers
    SET voice_id = 'com.apple.voice.compact.en-US.Samantha'
    WHERE voice_id IS NULL;
  `);

  pgm.alterColumn('prayers', 'voice_id', { notNull: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.alterColumn('prayers', 'voice_id', { notNull: false });
};
