// migrations/1778017600001_flock-prayer-requests-anonymize.js
// Captures the member's anonymity preference at submit time. member_name
// stays populated unconditionally for the leader's inbox + abuse audit;
// this flag only controls whether request_name is copied on approval.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumns('flock_prayer_requests', {
    anonymize: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  pgm.sql(`
    COMMENT ON COLUMN flock_prayer_requests.anonymize IS 'When true, the leader''s approved pray_on_it_items.request_name is left NULL. member_name remains for the inbox + audit.';
  `);
};

export const down = (pgm) => {
  pgm.dropColumns('flock_prayer_requests', ['anonymize']);
};
