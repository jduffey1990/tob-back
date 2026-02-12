/* eslint-disable camelcase */

/**
 * Migration: Add denomination column to users table
 * 
 * Purpose: Store user's religious denomination/sect for AI prayer generation
 * 
 * Changes:
 * - Add denomination VARCHAR(255) NOT NULL DEFAULT 'Christian'
 * - Add index on denomination for potential future analytics
 * 
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // ============================================
  // ADD DENOMINATION COLUMN TO USERS TABLE
  // ============================================
  pgm.addColumns('users', {
    denomination: {
      type: 'varchar(255)',
      notNull: true,
      default: "'Christian'"  // Default for existing users
    }
  });

  // Add index for potential future analytics/grouping
  pgm.addIndex('users', 'denomination', {
    name: 'idx_users_denomination'
  });

  // Add comment explaining the column
  pgm.sql(`
    COMMENT ON COLUMN users.denomination IS 'User religious denomination/sect - used for AI prayer generation style';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  // Remove index first, then column
  pgm.dropIndex('users', 'denomination', { 
    name: 'idx_users_denomination', 
    ifExists: true 
  });
  
  pgm.dropColumns('users', ['denomination']);
};