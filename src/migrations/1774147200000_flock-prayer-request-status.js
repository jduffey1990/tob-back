// migrations/1774147200000_flock-prayer-request-status.js
// Adds a status column to flock_prayer_requests for approve/deny workflow.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumn('flock_prayer_requests', {
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
    },
  });

  pgm.createIndex('flock_prayer_requests', ['flock_id', 'status'], {
    name: 'idx_flock_prayer_requests_status',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('flock_prayer_requests', [], { name: 'idx_flock_prayer_requests_status' });
  pgm.dropColumn('flock_prayer_requests', 'status');
};
