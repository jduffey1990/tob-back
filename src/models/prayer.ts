export interface Prayer {
  id: string;                     // uuid
  userId: string;                 // uuid - foreign key to users table
  title: string;                  // max 255 chars
  text: string;                   // full prayer text
  category?: string | null;       // 'morning' | 'evening' | 'gratitude' | 'intercession' etc.
  isTemplate: boolean;            // true for pre-built prayers in library
  playCount: number;              // how many times played
  lastPlayedAt?: Date | null;     // last time this prayer was played
  flockId?: string | null;        // uuid - if set, this prayer is published to a flock
  publishedAt?: Date | null;      // when it was published to the flock
  listenCount: number;            // deprecated alias of playCount; kept for old iOS clients — drop with the alias in prayerService.mapRowToPrayer
  voiceId?: string | null;        // pinned playback voice (NOT NULL in DB; optional here for JOIN-less mappers)
  // Audio info (joined from audio_files for flock prayer responses)
  audioUrl?: string | null;
  voiceName?: string | null;
  provider?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A flock prayer with leader/flock metadata joined in */
export interface FlockPrayerWithLeader extends Prayer {
  leaderName: string;
  flockName: string;
}

/**
 * Public template library entry (GET /prayer-templates, auth: false).
 * `audio` maps voice_id -> public S3 URL for every pre-generated server voice;
 * Apple voices synthesize on-device and never appear in the map.
 */
export interface PrayerTemplateDTO {
  id: string;                     // uuid — keys the S3 audio objects
  templateKey: string;            // stable slug, shared with the iOS bundled list
  title: string;
  text: string;
  category: string;
  audio: Record<string, string>;
}

export type PrayerSafe = Prayer; // No sensitive fields to exclude

export interface CreatePrayerInput {
  userId: string;
  title: string;
  text: string;
  category?: string;
  isTemplate?: boolean;
  flockId?: string;
  voiceId?: string;
}

export interface UpdatePrayerInput {
  title?: string;
  text?: string;
  category?: string;
  voiceId?: string;  // repin path only (PUT /prayers/{id}/voice) — PATCH's Joi whitelist excludes it
}

export interface PrayerWithUserInfo extends Prayer {
  userName: string;               // joined from users table
  userEmail: string;
}






