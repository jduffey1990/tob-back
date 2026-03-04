// migrations/XXXXXXXXXXXXXX_create-tts-generations.js

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('tts_generations', {
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
    prayer_id: {
      type: 'uuid',
      notNull: true,
      references: 'prayers(id)',
      onDelete: 'CASCADE'
    },
    voice_id: {
      type: 'text',
      notNull: true
    },
    voice_name: {
      type: 'text',
      notNull: false  // Denormalized snapshot - voice catalog may change over time
    },
    provider: {
      type: 'text',
      notNull: true   // 'azure' | 'fishaudio' | 'apple'
    },

    // Input characteristics
    character_count: {
      type: 'integer',
      notNull: true
    },

    // Timing - split so you can identify where time is actually spent
    tts_started_at: {
      type: 'timestamp',
      notNull: true
    },
    tts_completed_at: {
      type: 'timestamp',
      notNull: false  // null = still in flight or failed
    },
    s3_upload_started_at: {
      type: 'timestamp',
      notNull: false
    },
    s3_upload_completed_at: {
      type: 'timestamp',
      notNull: false
    },

    // Computed columns (set by trigger on update)
    tts_response_time_ms: {
      type: 'integer',
      notNull: false
    },
    s3_upload_time_ms: {
      type: 'integer',
      notNull: false
    },
    total_time_ms: {
      type: 'integer',
      notNull: false
    },

    // Output
    success: {
      type: 'boolean',
      notNull: false  // null = still building
    },
    error_code: {
      type: 'text',
      notNull: false  // e.g. 'API_ERROR', 'INVALID_TIER', 'ALREADY_BUILDING'
    },
    error_message: {
      type: 'text',
      notNull: false
    },
    file_size_bytes: {
      type: 'integer',
      notNull: false
    },
    estimated_cost_usd: {
      type: 'numeric(10, 6)',
      notNull: false
    },

    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  // --- Indexes ---

  // Most common query: "show me recent generations for this user"
  pgm.createIndex('tts_generations', ['user_id', 'created_at'], {
    name: 'idx_tts_user_created',
    method: 'btree'
  });

  // For admin dashboards: filter by provider
  pgm.createIndex('tts_generations', ['provider', 'created_at'], {
    name: 'idx_tts_provider_created',
    method: 'btree'
  });

  // For outlier detection: find slow or failed generations
  pgm.createIndex('tts_generations', 'tts_response_time_ms', {
    name: 'idx_tts_response_time',
    method: 'btree'
  });

  pgm.createIndex('tts_generations', 'success', {
    name: 'idx_tts_success',
    method: 'btree'
  });

  // --- Trigger to auto-compute timing columns ---
  pgm.createFunction(
    'calculate_tts_times',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      IF NEW.tts_completed_at IS NOT NULL AND NEW.tts_started_at IS NOT NULL THEN
        NEW.tts_response_time_ms = EXTRACT(EPOCH FROM (NEW.tts_completed_at - NEW.tts_started_at)) * 1000;
      END IF;

      IF NEW.s3_upload_completed_at IS NOT NULL AND NEW.s3_upload_started_at IS NOT NULL THEN
        NEW.s3_upload_time_ms = EXTRACT(EPOCH FROM (NEW.s3_upload_completed_at - NEW.s3_upload_started_at)) * 1000;
      END IF;

      IF NEW.tts_response_time_ms IS NOT NULL AND NEW.s3_upload_time_ms IS NOT NULL THEN
        NEW.total_time_ms = NEW.tts_response_time_ms + NEW.s3_upload_time_ms;
      END IF;

      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('tts_generations', 'set_tts_times', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'calculate_tts_times',
    level: 'ROW'
  });
};

export const down = (pgm) => {
  pgm.dropTrigger('tts_generations', 'set_tts_times', { ifExists: true });
  pgm.dropFunction('calculate_tts_times', [], { ifExists: true });
  pgm.dropTable('tts_generations', { ifExists: true, cascade: true });
};