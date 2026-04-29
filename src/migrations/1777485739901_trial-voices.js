// migrations/1777485739901_trial-voices.js
// Adds the lifetime trial-voice allotment. Free users get 5 premium-voice
// generations before the existing tier gate re-engages. Non-free users carry
// an inert default value that only matters if they ever downgrade to free.
//
// users.trial_voices_remaining — INT NOT NULL DEFAULT 5

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns('users', {
    trial_voices_remaining: {
      type: 'integer',
      notNull: true,
      default: 5,
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns('users', ['trial_voices_remaining']);
};
