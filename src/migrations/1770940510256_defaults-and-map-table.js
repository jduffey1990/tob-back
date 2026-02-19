// Migration: Add prayer template system with separate tables
// File: src/migrations/TIMESTAMP_prayer-template-system.js

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // ============================================
  // 1. Create prayer_templates table
  // Separate table for pre-built prayer templates
  // ============================================
  pgm.createTable('prayer_templates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    title: {
      type: 'varchar(255)',
      notNull: true
    },
    text: {
      type: 'text',
      notNull: true
    },
    category: {
      type: 'varchar(100)',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // ============================================
  // 2. Create indexes on prayer_templates
  // ============================================
  pgm.createIndex('prayer_templates', 'category', {
    name: 'idx_prayer_templates_category'
  });

  // ============================================
  // 3. Create prayer_template_links table
  // Links user prayers to their source templates
  // ============================================
  pgm.createTable('prayer_template_links', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_prayer_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'prayers(id)',
      onDelete: 'CASCADE'
    },
    template_id: {
      type: 'uuid',
      notNull: true,
      references: 'prayer_templates(id)',
      onDelete: 'CASCADE'
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // ============================================
  // 4. Create indexes on prayer_template_links
  // ============================================
  pgm.createIndex('prayer_template_links', 'user_prayer_id', {
    name: 'idx_prayer_template_links_user_prayer'
  });

  pgm.createIndex('prayer_template_links', 'template_id', {
    name: 'idx_prayer_template_links_template'
  });

  // ============================================
  // 5. Add updated_at trigger to prayer_templates
  // ============================================
  pgm.createTrigger('prayer_templates', 'trg_prayer_templates_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at'
  });

  // ============================================
  // 6. Add comments
  // ============================================
  pgm.sql(`
    COMMENT ON TABLE prayer_templates IS 
    'Pre-built prayer templates available to all users. Used for TTS audio sharing optimization.';
  `);

  pgm.sql(`
    COMMENT ON COLUMN prayer_templates.title IS 
    'Display name of the prayer template';
  `);

  pgm.sql(`
    COMMENT ON COLUMN prayer_templates.text IS 
    'Full text content of the prayer';
  `);

  pgm.sql(`
    COMMENT ON COLUMN prayer_templates.category IS 
    'Category for organization (e.g., Morning, Evening, Catholic, etc.)';
  `);

  pgm.sql(`
    COMMENT ON TABLE prayer_template_links IS 
    'Links user prayers to their source templates for shared TTS audio optimization';
  `);

  pgm.sql(`
    COMMENT ON COLUMN prayer_template_links.user_prayer_id IS 
    'The user''s personal copy of the prayer in the prayers table';
  `);

  pgm.sql(`
    COMMENT ON COLUMN prayer_template_links.template_id IS 
    'The original template from prayer_templates table';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  // Drop in reverse order
  pgm.dropTable('prayer_template_links', { cascade: true });
  pgm.dropTable('prayer_templates', { cascade: true });
};