// migrations/1774060800000_unify-flock-prayers.js
// Unifies flock_prayers into the prayers table by adding flock-specific columns.
// After migrating data, drops the flock_prayers table.

export const shorthands = undefined;

export const up = (pgm) => {
  // Step 1: Add flock columns to prayers
  pgm.addColumns('prayers', {
    flock_id: {
      type: 'uuid',
      references: 'flocks(id)',
      onDelete: 'SET NULL',
      default: null,
    },
    published_at: {
      type: 'timestamptz',
      default: null,
    },
    listen_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
  });

  // Index for feed query: "all prayers from flocks I follow, newest first"
  pgm.createIndex('prayers', ['flock_id', 'published_at'], {
    name: 'idx_prayers_flock_feed',
    where: 'flock_id IS NOT NULL',
  });

  // Step 2: Migrate existing flock_prayers data into prayers
  pgm.sql(`
    INSERT INTO prayers (user_id, title, text, flock_id, published_at, listen_count, is_template, play_count, created_at, updated_at)
    SELECT
      fp.created_by,
      fp.title,
      fp.text,
      fp.flock_id,
      fp.published_at,
      fp.listen_count,
      false,
      0,
      fp.created_at,
      fp.updated_at
    FROM flock_prayers fp
  `);

  // Step 3: No audio_files migration needed.
  // The old generateFlockPrayerAudio used 'flock-{uuid}' as prayer_id, but audio_files.prayer_id
  // is a uuid column — so no flock audio rows could have been inserted. Nothing to migrate.

  // Step 4: Drop the old flock_prayers table
  pgm.dropTable('flock_prayers', { ifExists: true, cascade: true });
};

export const down = (pgm) => {
  // Recreate flock_prayers table
  pgm.createTable('flock_prayers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    flock_id: {
      type: 'uuid',
      notNull: true,
      references: 'flocks(id)',
      onDelete: 'CASCADE',
    },
    created_by: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    title: { type: 'varchar(255)', notNull: true },
    text: { type: 'text', notNull: true },
    audio_url: { type: 'text' },
    voice_id: { type: 'text' },
    voice_name: { type: 'text' },
    provider: { type: 'text' },
    listen_count: { type: 'integer', notNull: true, default: 0 },
    published_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('flock_prayers', ['flock_id', 'published_at'], {
    name: 'idx_flock_prayers_feed',
  });
  pgm.createIndex('flock_prayers', 'created_by', {
    name: 'idx_flock_prayers_leader',
  });

  // Move flock prayers back out of prayers
  pgm.sql(`
    INSERT INTO flock_prayers (flock_id, created_by, title, text, listen_count, published_at, created_at, updated_at)
    SELECT flock_id, user_id, title, text, listen_count, published_at, created_at, updated_at
    FROM prayers
    WHERE flock_id IS NOT NULL
  `);

  // Remove flock prayers from unified table
  pgm.sql(`DELETE FROM prayers WHERE flock_id IS NOT NULL`);

  // Drop the new columns
  pgm.dropIndex('prayers', [], { name: 'idx_prayers_flock_feed' });
  pgm.dropColumns('prayers', ['flock_id', 'published_at', 'listen_count']);
};
