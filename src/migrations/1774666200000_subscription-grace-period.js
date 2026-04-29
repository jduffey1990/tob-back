// migrations/1774666200000_subscription-grace-period.js
// Adds the 14-day grace period for expiring flock-leader subscriptions and
// the active/suspended state machine for flocks.
//
// users.grace_period_ends_at  — when in grace; NULL otherwise
// users.grace_tier_snapshot   — tier the user held at the moment of expiry
// flocks.status               — 'active' | 'suspended' (default 'active')
// flocks.suspended_at         — when status flipped to 'suspended'

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumns('users', {
    grace_period_ends_at: {
      type: 'timestamptz',
      notNull: false,
    },
    grace_tier_snapshot: {
      type: 'varchar(20)',
      notNull: false,
    },
  });

  pgm.addColumns('flocks', {
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'active',
    },
    suspended_at: {
      type: 'timestamptz',
      notNull: false,
    },
  });

  pgm.createIndex('users', 'grace_period_ends_at', {
    where: 'grace_period_ends_at IS NOT NULL',
    name: 'idx_users_grace_period_ends_at',
  });

  pgm.createIndex('flocks', 'suspended_at', {
    where: "status = 'suspended'",
    name: 'idx_flocks_suspended_at',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('flocks', 'suspended_at', { name: 'idx_flocks_suspended_at' });
  pgm.dropIndex('users', 'grace_period_ends_at', { name: 'idx_users_grace_period_ends_at' });
  pgm.dropColumns('flocks', ['status', 'suspended_at']);
  pgm.dropColumns('users', ['grace_period_ends_at', 'grace_tier_snapshot']);
};
