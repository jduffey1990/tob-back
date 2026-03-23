// migrations/1774233600000_flock-age-verification.js
// Adds age verification columns to flocks and parental consent to flock_members.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumn('flocks', {
    requires_age_verification: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    minimum_age: {
      type: 'integer',
      notNull: true,
      default: 18,
    },
  });

  pgm.addColumn('flock_members', {
    parental_consent_given: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('flocks', 'requires_age_verification');
  pgm.dropColumn('flocks', 'minimum_age');
  pgm.dropColumn('flock_members', 'parental_consent_given');
};
