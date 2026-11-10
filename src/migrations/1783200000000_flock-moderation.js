// migrations/1783200000000_flock-moderation.js
// Leader moderation tools:
//   - flock_blocks: users a leader has blocked from their flock. Checked on
//     join and lookup so a blocked user cannot rescan the QR code.
//   - flock_prayer_reports: a member's report of a flock prayer. Snapshots the
//     prayer title/text so the evidence survives the leader deleting the
//     prayer, and uses SET NULL (not CASCADE) so it survives the flock, the
//     prayer, or the reporter being deleted too.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('flock_blocks', {
    id: { type: 'uuid', default: pgm.func('gen_random_uuid()'), primaryKey: true },
    flock_id: { type: 'uuid', notNull: true, references: 'flocks', onDelete: 'CASCADE' },
    blocked_user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  // One block per (flock, user); also the lookup path for the join check.
  pgm.createIndex('flock_blocks', ['flock_id', 'blocked_user_id'], {
    name: 'idx_flock_blocks_unique',
    unique: true,
  });

  pgm.createTable('flock_prayer_reports', {
    id: { type: 'uuid', default: pgm.func('gen_random_uuid()'), primaryKey: true },
    flock_id: { type: 'uuid', references: 'flocks', onDelete: 'SET NULL' },
    prayer_id: { type: 'uuid', references: 'prayers', onDelete: 'SET NULL' },
    reporter_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reason: { type: 'text' },
    prayer_title: { type: 'varchar(255)', notNull: true },
    prayer_text: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  // A member reports a given prayer once; repeat taps are no-ops.
  pgm.createIndex('flock_prayer_reports', ['prayer_id', 'reporter_user_id'], {
    name: 'idx_flock_prayer_reports_unique',
    unique: true,
  });
  pgm.createIndex('flock_prayer_reports', ['created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('flock_prayer_reports', { ifExists: true });
  pgm.dropTable('flock_blocks', { ifExists: true });
};
