// migrations/1783100000000_preview-text-drop-ai.js
// Drops "AI" from the voice preview line — the app now leads with manual entry
// and treats AI as a minimal-use tool, so "speak your AI prayers into existence"
// reads as a leftover from an AI-first framing.
//
// Two consumers of this column:
//   - Apple voices: iOS 6.5.1+ synthesizes preview_text on-device (read from
//     GET /voices), so this migration alone changes their preview copy — no
//     app release. Older clients fall back to a bundled string.
//   - Non-apple voices: the preview is a pre-rendered mp3 in S3, regenerated
//     separately by src/scripts/regenerateVoicePreviews.ts (run by hand).

export const shorthands = undefined;

const NEW_TEXT = 'Let me speak your prayers into existence.';
const OLD_TEXT = 'Let me speak your AI prayers into existence.';

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE voices
      ALTER COLUMN preview_text
      SET DEFAULT '${NEW_TEXT}';
  `);

  pgm.sql(`
    UPDATE voices
       SET preview_text = '${NEW_TEXT}',
           updated_at = NOW()
     WHERE preview_text = '${OLD_TEXT}'
        OR preview_text = '''${OLD_TEXT}'''
        OR preview_text IS NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE voices
      ALTER COLUMN preview_text
      SET DEFAULT '${OLD_TEXT}';
  `);

  pgm.sql(`
    UPDATE voices
       SET preview_text = '${OLD_TEXT}',
           updated_at = NOW()
     WHERE preview_text = '${NEW_TEXT}';
  `);
};
