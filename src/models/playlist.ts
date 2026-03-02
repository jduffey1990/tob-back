// src/models/playlist.ts

// ============================================
// Database Models
// ============================================

/**
 * A user-owned ordered playlist of prayers.
 * Voice is NOT stored — resolved from user settings at play time.
 */
export interface Playlist {
  id: string;           // uuid
  userId: string;       // uuid FK → users
  name: string;         // display name, e.g. "Walking Prayers"
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A single entry in a playlist — links a prayer to a playlist with an explicit position.
 */
export interface PlaylistPrayer {
  id: string;           // uuid
  playlistId: string;   // uuid FK → playlists
  prayerId: string;     // uuid FK → prayers
  position: number;     // 0-indexed playback order
  createdAt: Date;
}

// ============================================
// DB Row Types (snake_case from PostgreSQL)
// ============================================

export interface PlaylistRow {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface PlaylistPrayerRow {
  id: string;
  playlist_id: string;
  prayer_id: string;
  position: number;
  created_at: Date;
}

// ============================================
// Input Types
// ============================================

export interface CreatePlaylistInput {
  userId: string;
  name: string;
  prayerIds: string[];  // ordered array — index becomes position
}

export interface UpdatePlaylistInput {
  name?: string;
  prayerIds?: string[]; // full replacement of ordered list — index becomes position
}

// ============================================
// Response Types (sent to iOS)
// ============================================

/**
 * Summary returned in GET /playlists list view.
 */
export interface PlaylistSummary {
  id: string;
  name: string;
  prayerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Per-prayer audio state included in playlist detail response.
 * Mirrors AudioStateResponse but adds the prayer metadata iOS needs
 * to render the player view without additional fetches.
 */
export interface PlaylistPrayerDetail {
  prayerId: string;
  prayerTitle: string;
  prayerText: string;
  position: number;
  audioState: 'READY' | 'BUILDING' | 'MISSING';
  audioUrl?: string;    // only present when audioState === 'READY'
}

/**
 * Full playlist detail returned by GET /playlists/:id
 * Includes per-prayer audio state resolved against the provided voiceId.
 */
export interface PlaylistDetail {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  prayers: PlaylistPrayerDetail[];
}

// ============================================
// Helpers
// ============================================

export function rowToPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPlaylistPrayer(row: PlaylistPrayerRow): PlaylistPrayer {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    prayerId: row.prayer_id,
    position: row.position,
    createdAt: row.created_at,
  };
}