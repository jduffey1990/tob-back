// src/models/user.ts

/**
 * User settings stored in JSONB column
 */
export interface UserSettings {
  selectedVoiceId: string;   // voice ID from voices table
  playbackRate: number;      // 0.0-1.0, where 0.5 = normal iOS speech rate
}

/**
 * Default settings for new users
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  selectedVoiceId: 'com.apple.voice.compact.en-US.Samantha',
  playbackRate: 0.5
};

export interface User {
  id: string;                     // uuid
  email: string;
  passwordHash: string;           // store hash, never raw password
  name: string;
  status: string;                 // 'active' | 'inactive'
  subscriptionTier: string;       // 'free' | 'pro' | 'prayer_warrior' | 'lifetime'
  subscriptionExpiresAt?: Date | null; // null for free/lifetime, date for pro/warrior
  gracePeriodEndsAt?: Date | null;     // when in 14-day post-expiry grace; NULL otherwise
  graceTierSnapshot?: string | null;   // tier user held at moment of expiry (e.g. 'prayer_warrior')
  settings: UserSettings;         // User preferences
  denomination: string;           // Religious denomination/sect for AI prayer style
  trialVoicesRemaining: number;   // Lifetime premium-voice trial credits; only meaningful for free tier
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserSafe = Omit<User, 'passwordHash'>;

export interface ActivationToken {
  id: string;                // uuid
  userId: string;            // uuid - foreign key to users table
  email: string;             // redundant but useful for quick lookups
  token: string;             // hex token (64 chars)
  expiresAt: Date;           // when this token becomes invalid
  createdAt: Date;
  usedAt?: Date | null;      // tracks if/when token was used (for auditing)
}