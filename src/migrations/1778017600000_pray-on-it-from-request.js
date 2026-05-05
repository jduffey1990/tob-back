// migrations/1778017600000_pray-on-it-from-request.js
// Adds requester provenance to pray_on_it_items so accepted flock requests
// can preserve who asked (or remain anonymous) for AI prompt framing.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumns('pray_on_it_items', {
    from_request: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    request_name: {
      type: 'varchar(100)',
      notNull: false,
    },
  });

  pgm.sql(`
    COMMENT ON COLUMN pray_on_it_items.from_request IS 'True when this row was created from an approved flock prayer request.';
    COMMENT ON COLUMN pray_on_it_items.request_name IS 'Snapshot of the flock member who requested this item. NULL if anonymous or not from a request.';
  `);
};

export const down = (pgm) => {
  pgm.dropColumns('pray_on_it_items', ['from_request', 'request_name']);
};
