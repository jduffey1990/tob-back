/**
 * Migration: Create audio_files table for TTS audio caching
 * 
 * Purpose: Store generated audio files in S3 and track them by (prayer_id, voice_id)
 * This enables:
 * - Permanent caching of TTS audio (never regenerate same prayer+voice combo)
 * - Fast lookups when user changes voices
 * - Cost tracking and analytics
 * 
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // ============================================
  // CREATE audio_files TABLE
  // ============================================
  pgm.createTable('audio_files', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    prayer_id: {
      type: 'uuid',
      notNull: true,
      references: 'prayers(id)',
      onDelete: 'CASCADE'
    },
    voice_id: {
      type: 'varchar(100)',
      notNull: true
    },
    s3_bucket: {
      type: 'varchar(255)',
      notNull: true
    },
    s3_key: {
      type: 'varchar(500)',
      notNull: true
    },
    s3_url: {
      type: 'text',
      notNull: true
    },
    file_size_bytes: {
      type: 'integer',
      notNull: false
    },
    duration_seconds: {
      type: 'real',
      notNull: false
    },
    provider: {
      type: 'varchar(50)',
      notNull: false
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // ============================================
  // CREATE UNIQUE CONSTRAINT
  // Ensures we never generate the same audio twice
  // ============================================
  pgm.addConstraint('audio_files', 'unique_prayer_voice', {
    unique: ['prayer_id', 'voice_id']
  });

  // ============================================
  // CREATE INDEXES
  // ============================================
  
  // Primary lookup: Find audio for a specific prayer
  pgm.createIndex('audio_files', 'prayer_id', {
    name: 'idx_audio_files_prayer'
  });
  
  // Secondary lookup: Find all audio for a voice (analytics)
  pgm.createIndex('audio_files', 'voice_id', {
    name: 'idx_audio_files_voice'
  });
  
  // Composite index for the main query pattern
  pgm.createIndex('audio_files', ['prayer_id', 'voice_id'], {
    name: 'idx_audio_files_prayer_voice'
  });

  // ============================================
  // ADD COMMENTS
  // ============================================
  pgm.sql(`
    COMMENT ON TABLE audio_files IS 'Stores generated TTS audio files with permanent caching by (prayer_id, voice_id)';
  `);
  
  pgm.sql(`
    COMMENT ON COLUMN audio_files.voice_id IS 'Voice identifier (e.g., azure-male-1, fish-female-2)';
    COMMENT ON COLUMN audio_files.s3_bucket IS 'S3 bucket name where audio file is stored';
    COMMENT ON COLUMN audio_files.s3_key IS 'S3 object key (path within bucket)';
    COMMENT ON COLUMN audio_files.s3_url IS 'Full HTTPS URL to audio file (for playback)';
    COMMENT ON COLUMN audio_files.provider IS 'TTS provider used: azure, fishaudio, etc.';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop table (cascade will handle indexes and constraints)
  pgm.dropTable('audio_files', { cascade: true });
};