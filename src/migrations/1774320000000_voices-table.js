// migrations/1774320000000_voices-table.js
// Creates voices table, seeds stock voices with S3 preview URLs,
// migrates users.settings from voiceIndex to selectedVoiceId.

export const shorthands = undefined;

export const up = (pgm) => {
  // ============================================
  // 1. CREATE VOICES TABLE
  // ============================================
  pgm.createTable('voices', {
    id: {
      type: 'text',
      primaryKey: true,
    },
    name: {
      type: 'text',
      notNull: true,
    },
    language: {
      type: 'text',
      notNull: true,
    },
    gender: {
      type: 'text',
    },
    description: {
      type: 'text',
    },
    tier: {
      type: 'text',
      notNull: true,
    },
    provider: {
      type: 'text',
      notNull: true,
    },
    preview_url: {
      type: 'text',
    },
    preview_text: {
      type: 'text',
      default: "'Have your prayers read in my voice.'",
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    sort_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('voices', 'tier', { name: 'idx_voices_tier' });
  pgm.createIndex('voices', 'is_active', {
    name: 'idx_voices_active',
    where: 'is_active = true',
  });

  // ============================================
  // 2. SEED STOCK VOICES
  // ============================================
  const S3_BASE = 'https://tob-audio-files.s3.us-east-2.amazonaws.com/voice-previews';

  pgm.sql(`
    INSERT INTO voices (id, name, language, gender, description, tier, provider, preview_url, sort_order) VALUES
      -- FREE: Apple (on-device, no preview URL)
      ('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'en-US', 'female',
       'Natural American English voice', 'free', 'apple', NULL, 0),
      ('com.apple.voice.compact.en-GB.Daniel', 'Daniel', 'en-GB', 'male',
       'British English voice', 'free', 'apple', NULL, 1),
      ('com.apple.voice.compact.en-IE.Moira', 'Moira', 'en-IE', 'female',
       'Irish English voice', 'free', 'apple', NULL, 2),

      -- PRO: Azure
      ('en-US-JennyNeural', 'Jenny', 'en-US', 'female',
       'Warm and friendly American voice', 'pro', 'azure',
       '${S3_BASE}/jenny_neural.mp3', 3),
      ('en-US-GuyNeural', 'Guy', 'en-US', 'male',
       'Professional American voice', 'pro', 'azure',
       '${S3_BASE}/guy_neural.mp3', 4),
      ('en-GB-SoniaNeural', 'Sonia', 'en-GB', 'female',
       'Clear British voice', 'pro', 'azure',
       '${S3_BASE}/sonia_neural.mp3', 5),

      -- PRAYER WARRIOR: Azure + Fish Audio
      ('en-GB-RyanNeural', 'Ryan', 'en-GB', 'male',
       'Authoritative British voice', 'prayer_warrior', 'azure',
       '${S3_BASE}/ryan_neural.mp3', 6),
      ('b347db033a6549378b48d00acb0d06cd', 'Selene', 'en-US', 'neutral',
       'Natural AI voice with emotion control', 'prayer_warrior', 'fishaudio',
       '${S3_BASE}/selene_preview.mp3', 7),
      ('6ccd48c2891d409092b298dc34db0480', 'Jordan (App Creator Voice)', 'en-US', 'male',
       'Personal cloned voice', 'prayer_warrior', 'fishaudio',
       '${S3_BASE}/jordan_preview.mp3', 8),
      ('f273648b2f6242d4bf6ede2ccc4a525a', 'Golem', 'en-US', 'male',
       'Sneak from LOTR', 'prayer_warrior', 'fishaudio',
       '${S3_BASE}/golem_preview.mp3', 9);
  `);

  // ============================================
  // 3. MIGRATE users.settings: voiceIndex → selectedVoiceId
  // ============================================
  pgm.sql(`
    UPDATE users SET settings = settings
      || jsonb_build_object('selectedVoiceId',
        CASE (settings->>'voiceIndex')::int
          WHEN 0 THEN 'com.apple.voice.compact.en-US.Samantha'
          WHEN 1 THEN 'com.apple.voice.compact.en-GB.Daniel'
          WHEN 2 THEN 'com.apple.voice.compact.en-IE.Moira'
          WHEN 3 THEN 'en-US-JennyNeural'
          WHEN 4 THEN 'en-US-GuyNeural'
          WHEN 5 THEN 'en-GB-SoniaNeural'
          WHEN 6 THEN 'en-GB-RyanNeural'
          WHEN 7 THEN 'b347db033a6549378b48d00acb0d06cd'
          WHEN 8 THEN '6ccd48c2891d409092b298dc34db0480'
          WHEN 9 THEN 'f273648b2f6242d4bf6ede2ccc4a525a'
          ELSE 'com.apple.voice.compact.en-US.Samantha'
        END
      )
    WHERE settings ? 'voiceIndex';
  `);

  // Remove old voiceIndex key
  pgm.sql(`UPDATE users SET settings = settings - 'voiceIndex';`);

  // Update default for new users
  pgm.sql(`
    ALTER TABLE users ALTER COLUMN settings
      SET DEFAULT '{"selectedVoiceId": "com.apple.voice.compact.en-US.Samantha", "playbackRate": 0.5}';
  `);
};

export const down = (pgm) => {
  // Restore voiceIndex from selectedVoiceId
  pgm.sql(`
    UPDATE users SET settings = settings
      || jsonb_build_object('voiceIndex',
        CASE settings->>'selectedVoiceId'
          WHEN 'com.apple.voice.compact.en-US.Samantha' THEN 0
          WHEN 'com.apple.voice.compact.en-GB.Daniel' THEN 1
          WHEN 'com.apple.voice.compact.en-IE.Moira' THEN 2
          WHEN 'en-US-JennyNeural' THEN 3
          WHEN 'en-US-GuyNeural' THEN 4
          WHEN 'en-GB-SoniaNeural' THEN 5
          WHEN 'en-GB-RyanNeural' THEN 6
          WHEN 'b347db033a6549378b48d00acb0d06cd' THEN 7
          WHEN '6ccd48c2891d409092b298dc34db0480' THEN 8
          WHEN 'f273648b2f6242d4bf6ede2ccc4a525a' THEN 9
          ELSE 0
        END
      )
    WHERE settings ? 'selectedVoiceId';
  `);

  pgm.sql(`UPDATE users SET settings = settings - 'selectedVoiceId';`);

  pgm.sql(`
    ALTER TABLE users ALTER COLUMN settings
      SET DEFAULT '{"voiceIndex": 0, "playbackRate": 0.5}';
  `);

  pgm.dropTable('voices');
};
