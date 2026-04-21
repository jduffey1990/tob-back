// migrations/1774666100000_flock-notifications-enabled.js
// Adds server-side on/off toggle for flock prayer push notifications.
// Default TRUE — OS permission is the real opt-in; this is the in-app kill switch
// so the user can mute without revoking system notification permission.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumns('users', {
    flock_notifications_enabled: {
      type: 'boolean',
      notNull: true,
      default: true
    }
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['flock_notifications_enabled']);
};
