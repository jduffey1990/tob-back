// migrations/1782950400000_template-key.js
// Stable identity for seeded template prayers. The seed script upserts on
// template_key, so a template's row UUID — and therefore its S3 audio keys
// (audio/{prayerId}/{voiceId}.mp3) — never changes across re-seeds.
//
// prayers.template_key — TEXT NULL, unique only among is_template rows.
// Normal prayers never set it.

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns('prayers', {
    template_key: {
      type: 'text',
      notNull: false,
    },
  });

  pgm.createIndex('prayers', 'template_key', {
    unique: true,
    name: 'prayers_template_key_unique',
    where: 'is_template = true',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropIndex('prayers', 'template_key', { name: 'prayers_template_key_unique' });
  pgm.dropColumns('prayers', ['template_key']);
};
