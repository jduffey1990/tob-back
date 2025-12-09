export interface Prayer {
  id: string;                     // uuid
  userId: string;                 // uuid - foreign key to users table
  title: string;                  // max 255 chars
  text: string;                   // full prayer text
  category?: string | null;       // 'morning' | 'evening' | 'gratitude' | 'intercession' etc.
  isTemplate: boolean;            // true for pre-built prayers in library
  playCount: number;              // how many times played
  lastPlayedAt?: Date | null;     // last time this prayer was played
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;        // soft delete support
}

export type PrayerSafe = Prayer; // No sensitive fields to exclude

export interface CreatePrayerInput {
  userId: string;
  title: string;
  text: string;
  category?: string;
  isTemplate?: boolean;
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






