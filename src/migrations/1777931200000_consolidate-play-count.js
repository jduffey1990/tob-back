// migrations/1777931200000_consolidate-play-count.js
// Consolidates the duplicate play_count / listen_count columns on prayers.
// listen_count was added by 1774060800000_unify-flock-prayers.js as a flock-only counter,
// but it counts the same event as play_count. Drop listen_count and merge its value.
// See CLAUDE.md "Active Initiatives → Play count consolidation" for full context.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    UPDATE prayers
    SET play_count = play_count + listen_count
    WHERE listen_count > 0
  `);

  pgm.dropColumns('prayers', ['listen_count']);
};

export const down = (pgm) => {
  pgm.addColumns('prayers', {
    listen_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
  });
};
