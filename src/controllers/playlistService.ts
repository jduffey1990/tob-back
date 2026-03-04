// src/controllers/playlistService.ts

import {
  CreatePlaylistInput,
  Playlist,
  PlaylistDetail,
  PlaylistPrayerDetail,
  PlaylistRow,
  PlaylistSummary,
  UpdatePlaylistInput,
  rowToPlaylist,
} from '../models/playlist';
import { AudioService } from './audioService';
import { PostgresService } from './postgres.service';

export class PlaylistService {

  public static async createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query<PlaylistRow>(
      `INSERT INTO playlists (user_id, name)
       VALUES ($1::uuid, $2)
       RETURNING *`,
      [input.userId, input.name]
    );

    const playlist = rowToPlaylist(rows[0]);

    if (input.prayerIds.length > 0) {
      await PlaylistService.replacePrayerEntries(playlist.id, input.prayerIds, db);
    }

    console.log(`✅ [PlaylistService] Created playlist "${playlist.name}" (${playlist.id})`);
    return playlist;
  }

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

  /**
   * Get full playlist detail including per-prayer audio state.
   *
   * voiceId is now optional. When undefined (Apple TTS client), we skip
   * the audio-state fan-out entirely and return every prayer as MISSING —
   * the iOS client owns playback for Apple voices and doesn't need URLs.
   */
  public static async findPlaylistDetail(
    playlistId: string,
    userId: string,
    voiceId: string | undefined
  ): Promise<PlaylistDetail | null> {
    const db = PostgresService.getInstance();

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

    let prayerDetails: PlaylistPrayerDetail[];

    if (!voiceId) {
      // Apple TTS — no backend audio state needed. Return all prayers as MISSING
      // so the iOS client can drive playback entirely on-device.
      console.log(`ℹ️ [PlaylistService] No voiceId — skipping audio state checks (Apple TTS client)`);
      prayerDetails = prayerRows.map(row => ({
        prayerId:    row.prayer_id,
        prayerTitle: row.prayer_title,
        prayerText:  row.prayer_text,
        position:    row.position,
        audioState:  'MISSING' as const,
        audioUrl:    undefined,
      }));
    } else {
      // Backend TTS — fan out audio state checks concurrently
      prayerDetails = await Promise.all(
        prayerRows.map(async (row): Promise<PlaylistPrayerDetail> => {
          const audioState = await AudioService.getAudioState(row.prayer_id, voiceId);
          return {
            prayerId:    row.prayer_id,
            prayerTitle: row.prayer_title,
            prayerText:  row.prayer_text,
            position:    row.position,
            audioState:  audioState.state,
            audioUrl:    audioState.audioUrl,
          };
        })
      );

      console.log(
        `✅ [PlaylistService] Detail for "${playlist.name}": ` +
        `${prayerDetails.filter(p => p.audioState === 'READY').length}/${prayerDetails.length} READY`
      );
    }

    return {
      id:        playlist.id,
      name:      playlist.name,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      prayers:   prayerDetails,
    };
  }

  public static async updatePlaylist(
    playlistId: string,
    userId: string,
    input: UpdatePlaylistInput
  ): Promise<Playlist | null> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query<PlaylistRow>(
      `SELECT * FROM playlists
       WHERE id = $1::uuid AND user_id = $2::uuid
       LIMIT 1`,
      [playlistId, userId]
    );

    if (rows.length === 0) {
      return null;
    }

    if (input.name !== undefined) {
      await db.query(
        `UPDATE playlists SET name = $1 WHERE id = $2::uuid`,
        [input.name, playlistId]
      );
    }

    if (input.prayerIds !== undefined) {
      await PlaylistService.replacePrayerEntries(playlistId, input.prayerIds, db);
    }

    const { rows: updatedRows } = await db.query<PlaylistRow>(
      `SELECT * FROM playlists WHERE id = $1::uuid`,
      [playlistId]
    );

    console.log(`✅ [PlaylistService] Updated playlist ${playlistId}`);
    return rowToPlaylist(updatedRows[0]);
  }

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

  private static async replacePrayerEntries(
    playlistId: string,
    prayerIds: string[],
    db: ReturnType<typeof PostgresService.getInstance>
  ): Promise<void> {
    await db.query(
      `DELETE FROM playlist_prayers WHERE playlist_id = $1::uuid`,
      [playlistId]
    );

    if (prayerIds.length === 0) return;

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