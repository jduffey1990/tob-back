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
  voiceId?: string | null;        // pinned playback voice (nullable until iOS catches up — then NOT NULL)
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
}

export interface PrayerWithUserInfo extends Prayer {
  userName: string;               // joined from users table
  userEmail: string;
}






