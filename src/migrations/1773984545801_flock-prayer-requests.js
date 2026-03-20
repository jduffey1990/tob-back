/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Members share prayer requests (pray-on-it items) with their flock leaders
  pgm.createTable('flock_prayer_requests', {
    id: { type: 'uuid', default: pgm.func('gen_random_uuid()'), primaryKey: true },
    flock_id: { type: 'uuid', notNull: true, references: 'flocks', onDelete: 'CASCADE' },
    member_user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    member_name: { type: 'varchar(255)', notNull: true },
    name: { type: 'varchar(255)', notNull: true },
    category: { type: 'varchar(50)' },
    prayer_focus: { type: 'varchar(50)' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  pgm.createIndex('flock_prayer_requests', ['flock_id', 'created_at']);
  pgm.createIndex('flock_prayer_requests', ['member_user_id']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('flock_prayer_requests');
};
