/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Remove deleted_at column - moving to hard deletes instead of soft deletes
  pgm.dropColumns('prayers', ['deleted_at']);
};

exports.down = (pgm) => {
  // In case we need to rollback, restore the deleted_at column
  pgm.addColumns('prayers', {
    deleted_at: { type: 'timestamptz', notNull: false }
  });
};