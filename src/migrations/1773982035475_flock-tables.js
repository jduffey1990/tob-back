// migrations/1773982035475_flock-tables.js
// Creates the three flock-related tables:
//   - flocks: one per leader
//   - flock_members: join table between flocks and member users
//   - flock_prayers: prayers published to a flock

export const shorthands = undefined;

export const up = (pgm) => {
  // ===========================
  // 1. flocks
  // ===========================
  pgm.createTable('flocks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    leader_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    name: {
      type: 'varchar(255)',
      notNull: true
    },
    qr_code_identifier: {
      type: 'varchar(255)',
      notNull: true,
      unique: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  // One flock per leader
  pgm.createIndex('flocks', 'leader_user_id', {
    name: 'idx_flocks_leader',
    unique: true
  });

  // QR code lookup
  pgm.createIndex('flocks', 'qr_code_identifier', {
    name: 'idx_flocks_qr_code'
  });

  // ===========================
  // 2. flock_members
  // ===========================
  pgm.createTable('flock_members', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    flock_id: {
      type: 'uuid',
      notNull: true,
      references: 'flocks(id)',
      onDelete: 'CASCADE'
    },
    member_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    joined_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  // Prevent duplicate follows
  pgm.createIndex('flock_members', ['flock_id', 'member_user_id'], {
    name: 'idx_flock_members_unique',
    unique: true
  });

  // "Which flocks does this user follow?"
  pgm.createIndex('flock_members', 'member_user_id', {
    name: 'idx_flock_members_user'
  });

  // ===========================
  // 3. flock_prayers
  // ===========================
  pgm.createTable('flock_prayers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    flock_id: {
      type: 'uuid',
      notNull: true,
      references: 'flocks(id)',
      onDelete: 'CASCADE'
    },
    created_by: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    title: {
      type: 'varchar(255)',
      notNull: true
    },
    text: {
      type: 'text',
      notNull: true
    },
    audio_url: {
      type: 'text',
      notNull: false   // null until TTS completes
    },
    voice_id: {
      type: 'text',
      notNull: false
    },
    voice_name: {
      type: 'text',
      notNull: false
    },
    provider: {
      type: 'text',
      notNull: false   // 'azure' | 'fishaudio'
    },
    listen_count: {
      type: 'integer',
      notNull: true,
      default: 0
    },
    published_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  // Feed query: "all prayers from flocks I follow, newest first"
  pgm.createIndex('flock_prayers', ['flock_id', 'published_at'], {
    name: 'idx_flock_prayers_feed'
  });

  // Leader's published prayers
  pgm.createIndex('flock_prayers', 'created_by', {
    name: 'idx_flock_prayers_leader'
  });
};

export const down = (pgm) => {
  pgm.dropTable('flock_prayers', { ifExists: true, cascade: true });
  pgm.dropTable('flock_members', { ifExists: true, cascade: true });
  pgm.dropTable('flocks', { ifExists: true, cascade: true });
};
