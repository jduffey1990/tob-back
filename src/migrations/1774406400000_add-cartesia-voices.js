// migrations/1774406400000_add-cartesia-voices.js
// Adds Cartesia TTS voices to the voices table.

export const shorthands = undefined;

export const up = (pgm) => {
  const S3_BASE = 'https://tob-audio-files.s3.us-east-2.amazonaws.com/voice-previews';

  pgm.sql(`
    INSERT INTO voices (id, name, language, gender, description, tier, provider, preview_url, sort_order) VALUES
      ('d79d2b77-9192-4e10-9407-5d43ca034803', 'Siobhan', 'en-IE', 'female',
       'Warm Irish voice', 'prayer_warrior', 'cartesia',
       '${S3_BASE}/siobhan_preview.mp3', 10),
      ('b230e672-3b7c-4dcd-9327-14c1cb7303c3', 'Jordan (Cartesia)', 'en-US', 'male',
       'App creator cloned voice — Cartesia', 'prayer_warrior', 'cartesia',
       '${S3_BASE}/jordan_cartesia_preview.mp3', 11),
      ('5fb68a42-0ed7-46fa-8a8f-ad4b332fbf6f', 'Edward', 'en-GB', 'male',
       'Distinguished British voice', 'prayer_warrior', 'cartesia',
       '${S3_BASE}/edward_preview.mp3', 12),
      ('eef47c0d-cb49-4160-a4a0-6b97ed4c81e6', 'Isla', 'en-GB', 'female',
       'Soft British voice', 'prayer_warrior', 'cartesia',
       '${S3_BASE}/isla_preview.mp3', 13);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM voices WHERE id IN (
      'd79d2b77-9192-4e10-9407-5d43ca034803',
      'b230e672-3b7c-4dcd-9327-14c1cb7303c3',
      '5fb68a42-0ed7-46fa-8a8f-ad4b332fbf6f',
      'eef47c0d-cb49-4160-a4a0-6b97ed4c81e6'
    );
  `);
};
