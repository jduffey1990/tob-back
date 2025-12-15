// src/models/prayOnItItem.ts

/**
 * PrayOnItItem - Represents a person, situation, or intention the user wants to pray for
 */
export interface PrayOnItItem {
  id: string;
  userId: string;
  name: string;
  category: 'family' | 'friends' | 'work' | 'health' | 'personal' | 'world' | 'other';
  relationship?: string | null;
  prayerFocus?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new PrayOnItItem
 */
export interface CreatePrayOnItItemInput {
  userId: string;
  name: string;
  category: 'family' | 'friends' | 'work' | 'health' | 'personal' | 'world' | 'other';
  relationship?: string;
  prayerFocus?: string;
  notes?: string;
}

/**
 * Input for updating an existing PrayOnItItem
 */
export interface UpdatePrayOnItItemInput {
  name?: string;
  category?: 'family' | 'friends' | 'work' | 'health' | 'personal' | 'world' | 'other';
  relationship?: string | null;
  prayerFocus?: string | null;
  notes?: string | null;
}