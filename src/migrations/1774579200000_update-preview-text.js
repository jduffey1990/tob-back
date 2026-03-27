// migrations/1774579200000_update-preview-text.js
// Updates voice preview_text from old copy to new copy.
// Also regenerates Laura's S3 preview (run updateLauraPreview.ts separately).

export const shorthands = undefined;

export const up = (pgm) => {
  // 1. Update the column default for new voices
  pgm.sql(`
    ALTER TABLE voices
      ALTER COLUMN preview_text
      SET DEFAULT 'Let me speak your AI prayers into existence.';
  `);

  // 2. Update all existing rows that still have the old text
  //    Note: some rows stored the value with literal surrounding single-quote characters
  pgm.sql(`
    UPDATE voices
       SET preview_text = 'Let me speak your AI prayers into existence.',
           updated_at = NOW()
     WHERE preview_text IN (
       'Have your prayers read in my voice.',
       '''Have your prayers read in my voice.'''
     )
        OR preview_text IS NULL;
  `);
};

export const down = (pgm) => {
  // Revert to old text
  pgm.sql(`
    ALTER TABLE voices
      ALTER COLUMN preview_text
      SET DEFAULT 'Have your prayers read in my voice.';
  `);

  pgm.sql(`
    UPDATE voices
       SET preview_text = 'Have your prayers read in my voice.',
           updated_at = NOW()
     WHERE preview_text = 'Let me speak your AI prayers into existence.';
  `);
};
