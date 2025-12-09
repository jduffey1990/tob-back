/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================
  // 1. CREATE EXTENSION
  // ============================================
  pgm.createExtension('uuid-ossp', { ifNotExists: true });

  // ============================================
  // 2. CREATE USERS TABLE
  // ============================================
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'inactive' },
    credits: { type: 'integer', notNull: true, default: 0 },
    subscription_tier: { type: 'varchar(20)', notNull: true, default: 'free' },
    subscription_expires_at: { type: 'timestamptz', notNull: false },
    deleted_at: { type: 'timestamptz', notNull: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'subscription_tier');

  // ============================================
  // 3. CREATE UPDATED_AT TRIGGER FUNCTION
  // ============================================
  pgm.createFunction(
    'set_updated_at',
    [],
    { returns: 'trigger', language: 'plpgsql' },
    `
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('users', 'trg_users_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at'
  });

  // ============================================
  // 4. CREATE ACTIVATION_TOKENS TABLE
  // ============================================
  pgm.createTable('activation_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { 
      type: 'uuid', 
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    email: { type: 'text', notNull: true },
    token: { type: 'varchar(64)', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    used_at: { type: 'timestamptz', notNull: false }
  });

  // Activation tokens indexes
  pgm.createIndex('activation_tokens', 'token', { unique: true });
  pgm.createIndex('activation_tokens', 'user_id');
  pgm.createIndex('activation_tokens', 'email');
  pgm.createIndex('activation_tokens', ['expires_at', 'used_at'], {
    name: 'idx_activation_tokens_cleanup',
    where: 'used_at IS NULL'
  });
  pgm.createIndex('activation_tokens', ['user_id', 'used_at'], {
    name: 'idx_activation_tokens_active',
    where: 'used_at IS NULL'
  });

  // Activation tokens comments
  pgm.sql(`
    COMMENT ON TABLE activation_tokens IS 'Stores activation tokens for new user account verification';
  `);
  pgm.sql(`
    COMMENT ON COLUMN activation_tokens.token IS 'Hex-encoded random token (64 characters)';
    COMMENT ON COLUMN activation_tokens.expires_at IS 'Token expiration timestamp (72 hours from creation)';
    COMMENT ON COLUMN activation_tokens.used_at IS 'Timestamp when token was successfully used (NULL if unused)';
  `);

  // ============================================
  // 5. CREATE PRAYERS TABLE
  // ============================================
  pgm.createTable('prayers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { 
      type: 'uuid', 
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    title: { type: 'varchar(255)', notNull: true },
    text: { type: 'text', notNull: true },
    category: { type: 'varchar(100)', notNull: false },
    is_template: { type: 'boolean', notNull: true, default: false },
    play_count: { type: 'integer', notNull: true, default: 0 },
    last_played_at: { type: 'timestamptz', notNull: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz', notNull: false }
  });

  // Prayers indexes
  pgm.createIndex('prayers', 'user_id');
  pgm.createIndex('prayers', 'category');
  pgm.createIndex('prayers', 'is_template');
  pgm.createIndex('prayers', ['user_id', 'deleted_at']);

  // Prayers trigger
  pgm.createTrigger('prayers', 'trg_prayers_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at'
  });

  // Prayers comments
  pgm.sql(`
    COMMENT ON TABLE prayers IS 'User-created prayers and prayer templates';
  `);
  pgm.sql(`
    COMMENT ON COLUMN prayers.category IS 'e.g., morning, evening, gratitude, intercession';
    COMMENT ON COLUMN prayers.is_template IS 'true for pre-built prayers in the template library';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('prayers', { cascade: true });
  pgm.dropTable('activation_tokens', { cascade: true });
  pgm.dropTrigger('users', 'trg_users_updated_at', { cascade: true });
  pgm.dropFunction('set_updated_at', [], { cascade: true });
  pgm.dropTable('users', { cascade: true });
  pgm.dropExtension('uuid-ossp');
};