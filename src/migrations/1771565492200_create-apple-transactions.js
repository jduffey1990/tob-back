// Migration: Create apple_transactions table for StoreKit 2 purchase tracking
// File: src/migrations/TIMESTAMP_create-apple-transactions.js

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // ============================================
  // 1. Create apple_transactions table
  // Records every StoreKit 2 transaction processed
  // for idempotency and audit trail purposes
  // ============================================
  pgm.createTable('apple_transactions', {
    id: {
      type: 'serial',
      primaryKey: true
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    original_transaction_id: {
      type: 'text',
      notNull: true,
      unique: true   // Prevents double-processing the same Apple transaction
    },
    product_id: {
      type: 'text',
      notNull: true
    },
    expires_at: {
      type: 'timestamptz'
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // ============================================
  // 2. Create indexes
  // ============================================
  pgm.createIndex('apple_transactions', 'user_id', {
    name: 'idx_apple_transactions_user_id'
  });

  // ============================================
  // 3. Add comments
  // ============================================
  pgm.sql(`
    COMMENT ON TABLE apple_transactions IS
    'Records every StoreKit 2 transaction processed by the backend. Used for idempotency (preventing double-processing) and as an audit trail for subscription changes.';
  `);

  pgm.sql(`
    COMMENT ON COLUMN apple_transactions.original_transaction_id IS
    'Apple''s unique identifier for the original transaction. UNIQUE constraint prevents the same transaction from being processed more than once.';
  `);

  pgm.sql(`
    COMMENT ON COLUMN apple_transactions.product_id IS
    'The App Store product ID (e.g. foxdogdevelopment.TowerOfBabble.pro.annual). Maps to a subscription tier in AppleSubscriptionService.';
  `);

  pgm.sql(`
    COMMENT ON COLUMN apple_transactions.expires_at IS
    'When this subscription period ends, as reported by Apple. NULL for lifetime/non-expiring purchases.';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('apple_transactions', { cascade: true });
};