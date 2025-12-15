/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================
  // CREATE PRAY_ON_IT_ITEMS TABLE
  // ============================================
  pgm.createTable('pray_on_it_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { 
      type: 'uuid', 
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    name: { type: 'varchar(255)', notNull: true },
    category: { type: 'varchar(50)', notNull: true },
    relationship: { type: 'varchar(100)', notNull: false },
    prayer_focus: { type: 'varchar(100)', notNull: false },
    notes: { type: 'varchar(200)', notNull: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Indexes for performance
  pgm.createIndex('pray_on_it_items', 'user_id');
  pgm.createIndex('pray_on_it_items', 'category');

  // Trigger for updated_at (reuses existing function)
  pgm.createTrigger('pray_on_it_items', 'trg_pray_on_it_items_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at'
  });

  // Comments
  pgm.sql(`
    COMMENT ON TABLE pray_on_it_items IS 'User intentions/people to pray for - used in AI prayer generation';
  `);
  pgm.sql(`
    COMMENT ON COLUMN pray_on_it_items.category IS 'family | friends | work | health | personal | world | other';
    COMMENT ON COLUMN pray_on_it_items.prayer_focus IS 'healing | guidance | thanksgiving | protection | etc';
    COMMENT ON COLUMN pray_on_it_items.notes IS 'Optional context (max 200 chars) - e.g., "dealing with cancer"';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('pray_on_it_items', { cascade: true });
};