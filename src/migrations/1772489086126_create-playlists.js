// Migration: Create playlists and playlist_prayers tables
// Feature: Prayer Playlist (prayer_warrior + lifetime tiers)

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {

  // ============================================
  // 1. Create playlists table
  // Owned by a user, has a name, nothing else.
  // Voice is NOT stored here — resolved at play
  // time from VoiceService on the client.
  // ============================================
  pgm.createTable('playlists', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    name: {
      type: 'varchar(255)',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // ============================================
  // 2. Indexes on playlists
  // ============================================
  pgm.createIndex('playlists', 'user_id', {
    name: 'idx_playlists_user_id'
  });

  // ============================================
  // 3. updated_at trigger on playlists
  // Reuses the existing set_updated_at function
  // ============================================
  pgm.createTrigger('playlists', 'trg_playlists_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at'
  });

  // ============================================
  // 4. Create playlist_prayers table
  // Join table between playlists and prayers.
  // position drives playback order (0-indexed).
  // ============================================
  pgm.createTable('playlist_prayers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    playlist_id: {
      type: 'uuid',
      notNull: true,
      references: 'playlists(id)',
      onDelete: 'CASCADE'
    },
    prayer_id: {
      type: 'uuid',
      notNull: true,
      references: 'prayers(id)',
      onDelete: 'CASCADE'
    },
    position: {
      type: 'integer',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // ============================================
  // 5. Indexes on playlist_prayers
  // ============================================

  // Primary lookup: all prayers for a playlist, in order
  pgm.createIndex('playlist_prayers', ['playlist_id', 'position'], {
    name: 'idx_playlist_prayers_playlist_position'
  });

  // Reverse lookup: which playlists contain a given prayer
  // (needed for push notification check: "is this playlist now complete?")
  pgm.createIndex('playlist_prayers', 'prayer_id', {
    name: 'idx_playlist_prayers_prayer_id'
  });

  // ============================================
  // 6. Unique constraints on playlist_prayers
  // A prayer can only appear once per playlist.
  // A position can only be used once per playlist.
  // ============================================
  pgm.addConstraint('playlist_prayers', 'unique_playlist_prayer', {
    unique: ['playlist_id', 'prayer_id']
  });

  pgm.addConstraint('playlist_prayers', 'unique_playlist_position', {
    unique: ['playlist_id', 'position']
  });

  // ============================================
  // 7. Comments
  // ============================================
  pgm.sql(`
    COMMENT ON TABLE playlists IS
    'User-created ordered playlists of prayers. Available to prayer_warrior and lifetime tiers only. Voice is NOT stored — resolved from user settings at play time.';
  `);

  pgm.sql(`
    COMMENT ON COLUMN playlists.name IS
    'User-defined display name for the playlist (e.g. "Walking Prayers")';
  `);

  pgm.sql(`
    COMMENT ON TABLE playlist_prayers IS
    'Join table linking prayers to playlists with explicit ordering. position is 0-indexed and drives playback sequence.';
  `);

  pgm.sql(`
    COMMENT ON COLUMN playlist_prayers.position IS
    '0-indexed playback position within the playlist. Unique per playlist — no two prayers share a position.';
  `);

  pgm.sql(`
    COMMENT ON COLUMN playlist_prayers.prayer_id IS
    'FK to prayers(id). Indexed to support reverse lookup: find all playlists containing a given prayer (used for push notification completion check).';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  // Drop in reverse dependency order
  pgm.dropTable('playlist_prayers', { cascade: true });
  pgm.dropTable('playlists', { cascade: true });
};