/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Remove credits column - not needed for Tower of Babble
  // We'll calculate prayer count dynamically instead
  pgm.dropColumns('users', ['credits']);
};

exports.down = (pgm) => {
  // In case we need to rollback, restore the credits column
  pgm.addColumns('users', {
    credits: { 
      type: 'integer', 
      notNull: true, 
      default: 0 
    }
  });
};
