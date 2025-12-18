/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================
  // ADD SETTINGS JSONB COLUMN TO USERS TABLE
  // ============================================
  pgm.addColumns('users', {
    settings: {
      type: 'jsonb',
      notNull: true,
      default: '{"voiceIndex": 0, "playbackRate": 0.5}'
    }
  });

  // Optional: Add GIN index for JSONB queries (if we ever need to query by settings)
  pgm.addIndex('users', 'settings', {
    name: 'idx_users_settings',
    method: 'gin'
  });

  // Add comment
  pgm.sql(`
    COMMENT ON COLUMN users.settings IS 'User preferences: voiceIndex (0-8) and playbackRate dependant on TTS APIs (default 0.5)';
  `);
};

exports.down = (pgm) => {
  pgm.dropIndex('users', 'settings', { name: 'idx_users_settings', ifExists: true });
  pgm.dropColumns('users', ['settings']);
};
