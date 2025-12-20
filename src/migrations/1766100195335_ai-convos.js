/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Create ai_generations table
  pgm.createTable('ai_generations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    user_prompt: {
      type: 'jsonb',
      notNull: true
    },
    chat_output: {
      type: 'jsonb',
      notNull: false
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: 'timestamp',
      notNull: false
    },
    response_time_ms: {
      type: 'integer',
      notNull: false
    }
  });

  // Create indexes
  pgm.createIndex('ai_generations', ['user_id', 'created_at'], {
    name: 'idx_user_created',
    method: 'btree'
  });
  
  pgm.createIndex('ai_generations', 'created_at', {
    name: 'idx_created_at',
    method: 'btree'
  });
  
  pgm.createIndex('ai_generations', 'response_time_ms', {
    name: 'idx_response_time',
    method: 'btree'
  });

  // Create function to calculate response time
  pgm.createFunction(
    'calculate_response_time',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      IF NEW.updated_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
        NEW.response_time_ms = EXTRACT(EPOCH FROM (NEW.updated_at - NEW.created_at)) * 1000;
      END IF;
      RETURN NEW;
    END;
    `
  );

  // Create trigger
  pgm.createTrigger('ai_generations', 'set_response_time', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'calculate_response_time',
    level: 'ROW'
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop in reverse order
  pgm.dropTrigger('ai_generations', 'set_response_time', { ifExists: true });
  pgm.dropFunction('calculate_response_time', [], { ifExists: true });
  pgm.dropTable('ai_generations', { ifExists: true, cascade: true });
};