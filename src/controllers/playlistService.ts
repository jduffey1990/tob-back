// src/controllers/playlistService.ts

import { PostgresService } from './postgres.service';
import { AudioService } from './audioService';
import {
  Playlist,
  PlaylistDetail,
  PlaylistPrayerDetail,
  PlaylistRow,
  PlaylistSummary,
  CreatePlaylistInput,
  UpdatePlaylistInput,
  rowToPlaylist,
} from '../models/playlist';

export class PlaylistService {

  // ============================================
  // CREATE
  // ============================================

  /**
   * Create a new playlist with an initial ordered set of prayers.
   * prayerIds array index becomes position (0-indexed).
   */
  public static async createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
    const db = PostgresService.getInstance();

    // Insert playlist row
    const { rows } = await db.query<PlaylistRow>(
      `INSERT INTO playlists (user_id, name)
       VALUES ($1::uuid, $2)
       RETURNING *`,
      [input.userId, input.name]
    );

    const playlist = rowToPlaylist(rows[0]);

    // Insert playlist_prayers rows if any provided
    if (input.prayerIds.length > 0) {
      await PlaylistService.replacePrayerEntries(playlist.id, input.prayerIds, db);
    }

    console.log(`✅ [PlaylistService] Created playlist "${playlist.name}" (${playlist.id})`);
    return playlist;
  }

  // ============================================
  // READ — List
  // ============================================

  /**
   * Get all playlists for a user, with prayer count.
   * Used for the "Listen to Previous Playlist" list view.
   */
  public static async findUserPlaylists(userId: string): Promise<PlaylistSummary[]> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT
         p.id,
         p.name,
         p.created_at,
         p.updated_at,
         COUNT(pp.id)::int AS prayer_count
       FROM playlists p
       LEFT JOIN playlist_prayers pp ON pp.playlist_id = p.id
       WHERE p.user_id = $1::uuid
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      [userId]
    );

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      prayerCount: row.prayer_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  // ============================================
  // READ — Detail
  // ============================================

  /**
   * Get full playlist detail including per-prayer audio state
   * resolved against the provided voiceId.
   *
   * Fans out audio state checks concurrently — one Promise.all
   * across all prayers rather than sequential queries.
   *
   * Used by GET /playlists/:id?voiceId=
   */
  public static async findPlaylistDetail(
    playlistId: string,
    userId: string,
    voiceId: string
  ): Promise<PlaylistDetail | null> {
    const db = PostgresService.getInstance();

    // 1. Verify playlist exists and belongs to user
    const { rows: playlistRows } = await db.query<PlaylistRow>(
      `SELECT * FROM playlists
       WHERE id = $1::uuid AND user_id = $2::uuid
       LIMIT 1`,
      [playlistId, userId]
    );

    if (playlistRows.length === 0) {
      return null;
    }

    const playlist = rowToPlaylist(playlistRows[0]);

    // 2. Fetch ordered prayers joined with prayer text/title
    const { rows: prayerRows } = await db.query(
      `SELECT
         pp.prayer_id,
         pp.position,
         pr.title  AS prayer_title,
         pr.text   AS prayer_text
       FROM playlist_prayers pp
       JOIN prayers pr ON pr.id = pp.prayer_id
       WHERE pp.playlist_id = $1::uuid
       ORDER BY pp.position ASC`,
      [playlistId]
    );

    // 3. Fan out audio state checks concurrently
    const prayerDetails: PlaylistPrayerDetail[] = await Promise.all(
      prayerRows.map(async (row): Promise<PlaylistPrayerDetail> => {
        const audioState = await AudioService.getAudioState(row.prayer_id, voiceId);

        return {
          prayerId: row.prayer_id,
          prayerTitle: row.prayer_title,
          prayerText: row.prayer_text,
          position: row.position,
          audioState: audioState.state,
          audioUrl: audioState.audioUrl,
        };
      })
    );

    console.log(
      `✅ [PlaylistService] Detail for "${playlist.name}": ` +
      `${prayerDetails.filter(p => p.audioState === 'READY').length}/${prayerDetails.length} READY`
    );

    return {
      id: playlist.id,
      name: playlist.name,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      prayers: prayerDetails,
    };
  }

  // ============================================
  // UPDATE
  // ============================================

  /**
   * Update a playlist's name and/or ordered prayer list.
   * prayerIds is a full replacement — existing entries are deleted
   * and re-inserted with new positions.
   *
   * Called on explicit Save from PlaylistPlayerView.
   */
  public static async updatePlaylist(
    playlistId: string,
    userId: string,
    input: UpdatePlaylistInput
  ): Promise<Playlist | null> {
    const db = PostgresService.getInstance();

    // Verify ownership
    const { rows } = await db.query<PlaylistRow>(
      `SELECT * FROM playlists
       WHERE id = $1::uuid AND user_id = $2::uuid
       LIMIT 1`,
      [playlistId, userId]
    );

    if (rows.length === 0) {
      return null;
    }

    // Update name if provided
    if (input.name !== undefined) {
      await db.query(
        `UPDATE playlists SET name = $1 WHERE id = $2::uuid`,
        [input.name, playlistId]
      );
    }

    // Replace prayer entries if provided
    if (input.prayerIds !== undefined) {
      await PlaylistService.replacePrayerEntries(playlistId, input.prayerIds, db);
    }

    // Return updated row
    const { rows: updatedRows } = await db.query<PlaylistRow>(
      `SELECT * FROM playlists WHERE id = $1::uuid`,
      [playlistId]
    );

    console.log(`✅ [PlaylistService] Updated playlist ${playlistId}`);
    return rowToPlaylist(updatedRows[0]);
  }

  // ============================================
  // DELETE
  // ============================================

  /**
   * Delete a playlist. Cascade handles playlist_prayers cleanup.
   * Returns true if deleted, false if not found / not owned.
   */
  public static async deletePlaylist(playlistId: string, userId: string): Promise<boolean> {
    const db = PostgresService.getInstance();

    const result = await db.query(
      `DELETE FROM playlists
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      [playlistId, userId]
    );

    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      console.log(`🗑️ [PlaylistService] Deleted playlist ${playlistId}`);
    }
    return deleted;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Delete all existing playlist_prayers for a playlist and
   * re-insert from the provided ordered prayerIds array.
   * Array index becomes position value (0-indexed).
   *
   * Runs inside the caller's db instance so it participates
   * in the same connection context.
   */
  private static async replacePrayerEntries(
    playlistId: string,
    prayerIds: string[],
    db: ReturnType<typeof PostgresService.getInstance>
  ): Promise<void> {
    // Clear existing entries
    await db.query(
      `DELETE FROM playlist_prayers WHERE playlist_id = $1::uuid`,
      [playlistId]
    );

    if (prayerIds.length === 0) return;

    // Build multi-row INSERT
    // VALUES ($1, $2, $3), ($1, $4, $5), ...
    const valuePlaceholders = prayerIds
      .map((_, i) => `($1::uuid, $${i * 2 + 2}::uuid, $${i * 2 + 3})`)
      .join(', ');

    const values: (string | number)[] = [playlistId];
    prayerIds.forEach((prayerId, index) => {
      values.push(prayerId, index);
    });

    await db.query(
      `INSERT INTO playlist_prayers (playlist_id, prayer_id, position)
       VALUES ${valuePlaceholders}`,
      values
    );

    console.log(`📋 [PlaylistService] Inserted ${prayerIds.length} prayers into playlist ${playlistId}`);
  }
}