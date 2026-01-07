/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('password_reset_tokens', {
    token: {
      type: 'varchar(255)',
      primaryKey: true,
      notNull: true
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    email: {
      type: 'varchar(255)',
      notNull: true
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true
    },
    used_at: {
      type: 'timestamptz',
      notNull: false
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // Add indexes for better query performance
  pgm.createIndex('password_reset_tokens', 'user_id');
  pgm.createIndex('password_reset_tokens', 'expires_at');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('password_reset_tokens');
};