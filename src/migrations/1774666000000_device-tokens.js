// migrations/1774666000000_device-tokens.js
// Creates device_tokens table for APNs push notifications.
// A user can have multiple active tokens (phone + iPad). Tokens are soft-deleted
// via revoked_at so we keep history for debugging 410 responses from APNs.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('device_tokens', {
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
    apns_token: {
      type: 'text',
      notNull: true
    },
    environment: {
      type: 'text',
      notNull: true    // 'sandbox' | 'production'
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    last_seen_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    revoked_at: {
      type: 'timestamptz',
      notNull: false
    }
  });

  // Upsert key — one row per (user, token). A user reinstalling gets the same
  // token unrevoked; a different user on the same device gets their own row.
  pgm.addConstraint('device_tokens', 'device_tokens_user_token_unique', {
    unique: ['user_id', 'apns_token']
  });

  // Fan-out query: "active tokens for these users" — partial index keeps it tight.
  pgm.sql(`
    CREATE INDEX idx_device_tokens_active_user
      ON device_tokens (user_id)
      WHERE revoked_at IS NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_device_tokens_active_user;');
  pgm.dropConstraint('device_tokens', 'device_tokens_user_token_unique', { ifExists: true });
  pgm.dropTable('device_tokens', { ifExists: true, cascade: true });
};
