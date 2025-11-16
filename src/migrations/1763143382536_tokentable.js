/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
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

  // Primary lookup: token (most common query)
  pgm.createIndex('activation_tokens', 'token', { unique: true });

  // Lookup by user_id (for hasActiveToken checks)
  pgm.createIndex('activation_tokens', 'user_id');

  // Lookup by email (for resend functionality)
  pgm.createIndex('activation_tokens', 'email');

  // Composite index for cleanup queries (finding unused expired tokens)
  // This is a partial index - only indexes rows where used_at IS NULL
  pgm.createIndex('activation_tokens', ['expires_at', 'used_at'], {
    name: 'idx_activation_tokens_cleanup',
    where: 'used_at IS NULL'
  });

  // Composite index for active token checks (user_id + used_at)
  // Optimizes the hasActiveToken query
  // Note: We can't check expires_at > NOW() in index because NOW() isn't immutable
  // The query will filter expired tokens after using this index
  pgm.createIndex('activation_tokens', ['user_id', 'used_at'], {
    name: 'idx_activation_tokens_active',
    where: 'used_at IS NULL'
  });

  // Add table comment
  pgm.sql(`
    COMMENT ON TABLE activation_tokens IS 'Stores activation tokens for new user account verification';
  `);

  // Add column comments
  pgm.sql(`
    COMMENT ON COLUMN activation_tokens.token IS 'Hex-encoded random token (64 characters)';
    COMMENT ON COLUMN activation_tokens.expires_at IS 'Token expiration timestamp (72 hours from creation)';
    COMMENT ON COLUMN activation_tokens.used_at IS 'Timestamp when token was successfully used (NULL if unused)';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('activation_tokens', { cascade: true });
};