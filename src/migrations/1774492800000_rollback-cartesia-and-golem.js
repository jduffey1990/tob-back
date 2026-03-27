// migrations/1774492800000_rollback-cartesia-and-golem.js
// Removes Cartesia voices, removes Golem, moves Ryan from prayer_warrior to pro.

export const shorthands = undefined;

export const up = (pgm) => {
  // 1. Remove all Cartesia voices
  pgm.sql(`
    DELETE FROM voices WHERE provider = 'cartesia';
  `);

  // 2. Remove Golem
  pgm.sql(`
    DELETE FROM voices WHERE id = 'f273648b2f6242d4bf6ede2ccc4a525a';
  `);

  // 3. Move Ryan from prayer_warrior to pro (Azure voice, belongs in pro)
  pgm.sql(`
    UPDATE voices
       SET tier = 'pro',
           sort_order = 6,
           updated_at = NOW()
     WHERE id = 'en-GB-RyanNeural';
  `);

  // 4. Fix sort_order gaps after removals
  //    Free: 0-2, Pro: 3-6, Prayer Warrior: 7+
  pgm.sql(`
    UPDATE voices SET sort_order = 7 WHERE id = 'b347db033a6549378b48d00acb0d06cd';
    UPDATE voices SET sort_order = 8 WHERE id = '6ccd48c2891d409092b298dc34db0480';
  `);

  // 5. Add Laura (Fish Audio) as new prayer_warrior voice
  const S3_BASE = 'https://tob-audio-files.s3.us-east-2.amazonaws.com/voice-previews';
  pgm.sql(`
    INSERT INTO voices (id, name, language, gender, description, tier, provider, preview_url, sort_order)
    VALUES ('e3cd384158934cc9a01029cd7d278634', 'Laura', 'en-US', 'female',
            'Confident female narrator', 'prayer_warrior', 'fishaudio',
            '${S3_BASE}/laura_preview.mp3', 9);
  `);

  // 6. Reset any users who had a Cartesia or Golem voice selected back to Samantha
  pgm.sql(`
    UPDATE users
       SET settings = jsonb_set(settings, '{selectedVoiceId}', '"com.apple.voice.compact.en-US.Samantha"')
     WHERE settings->>'selectedVoiceId' IN (
       'd79d2b77-9192-4e10-9407-5d43ca034803',
       'b230e672-3b7c-4dcd-9327-14c1cb7303c3',
       '5fb68a42-0ed7-46fa-8a8f-ad4b332fbf6f',
       'eef47c0d-cb49-4160-a4a0-6b97ed4c81e6',
       'f273648b2f6242d4bf6ede2ccc4a525a'
     );
  `);
};

export const down = (pgm) => {
  const S3_BASE = 'https://tob-audio-files.s3.us-east-2.amazonaws.com/voice-previews';

  // Remove Laura
  pgm.sql(`DELETE FROM voices WHERE id = 'e3cd384158934cc9a01029cd7d278634';`);

  // Restore Ryan to prayer_warrior
  pgm.sql(`
    UPDATE voices
       SET tier = 'prayer_warrior',
           sort_order = 6,
           updated_at = NOW()
     WHERE id = 'en-GB-RyanNeural';
  `);

  // Restore Golem
  pgm.sql(`
    INSERT INTO voices (id, name, language, gender, description, tier, provider, preview_url, sort_order)
    VALUES ('f273648b2f6242d4bf6ede2ccc4a525a', 'Golem', 'en-US', 'male',
            'Sneak from LOTR', 'prayer_warrior', 'fishaudio',
            '${S3_BASE}/golem_preview.mp3', 9);
  `);

  // Restore Cartesia voices
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

  // Restore sort orders
  pgm.sql(`
    UPDATE voices SET sort_order = 7 WHERE id = 'b347db033a6549378b48d00acb0d06cd';
    UPDATE voices SET sort_order = 8 WHERE id = '6ccd48c2891d409092b298dc34db0480';
  `);
};
