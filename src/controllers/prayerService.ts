// src/controllers/prayerService.ts
import { CreatePrayerInput, Prayer, FlockPrayerWithLeader, UpdatePrayerInput } from '../models/prayer';
import { PostgresService } from './postgres.service';
import { TTSService } from './ttsService';
import { NotFoundError } from '../errors';

// Map db row -> Prayer (snake_case -> camelCase)
function mapRowToPrayer(row: any): Prayer {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    text: row.text,
    category: row.category ?? null,
    isTemplate: row.is_template,
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at ?? null,
    flockId: row.flock_id ?? null,
    publishedAt: row.published_at ?? null,
    listenCount: row.listen_count ?? 0,
    voiceId: row.voice_id ?? null,
    audioUrl: row.audio_url ?? null,
    voiceName: row.voice_name ?? null,
    provider: row.audio_provider ?? row.provider ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map db row with audio_files JOIN -> Prayer (resolves voice_name from voice_id)
async function mapRowToPrayerWithAudio(row: any): Promise<Prayer> {
  const prayer = mapRowToPrayer(row);
  if (prayer.voiceId) {
    const voice = await TTSService.getVoiceById(prayer.voiceId);
    prayer.voiceName = voice?.name ?? null;
  }
  return prayer;
}

// Map db row -> FlockPrayerWithLeader (for feed queries)
async function mapRowToFlockPrayerWithLeader(row: any): Promise<FlockPrayerWithLeader> {
  return {
    ...(await mapRowToPrayerWithAudio(row)),
    leaderName: row.leader_name,
    flockName: row.flock_name,
  };
}

export class PrayerService {
  /**
   * Get all prayers for a user (non-deleted)
   */
  public static async findUserPrayers(userId: string): Promise<Prayer[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, user_id, title, text, category, is_template, play_count,
              last_played_at, flock_id, published_at, listen_count, voice_id, created_at, updated_at
       FROM prayers
       WHERE user_id = $1::uuid
       ORDER BY updated_at DESC`,
      [userId]
    );

    return rows.map(mapRowToPrayer);
  }

  /**
   * Get a single prayer by ID (must belong to user)
   */
  public static async findPrayerById(
    prayerId: string, 
    userId: string
  ): Promise<Prayer | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, user_id, title, text, category, is_template, play_count,
              last_played_at, flock_id, published_at, listen_count, voice_id, created_at, updated_at
       FROM prayers
       WHERE id = $1::uuid
         AND user_id = $2::uuid
       LIMIT 1`,
      [prayerId, userId]
    );
    return rows[0] ? mapRowToPrayer(rows[0]) : null;
  }

  /**
   * Create a new prayer
   */
  public static async createPrayer(input: CreatePrayerInput): Promise<Prayer> {
    const db = PostgresService.getInstance();
    
    const { rows } = await db.query(
      `INSERT INTO prayers (user_id, title, text, category, is_template, flock_id, published_at, voice_id)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, title, text, category, is_template, play_count,
                 last_played_at, flock_id, published_at, listen_count, voice_id, created_at, updated_at`,
      [
        input.userId,
        input.title,
        input.text,
        input.category ?? null,
        input.isTemplate ?? false,
        input.flockId ?? null,
        input.flockId ? new Date() : null,
        input.voiceId ?? null,
      ]
    );
    
    return mapRowToPrayer(rows[0]);
  }

  /**
   * Update a prayer (only if it belongs to user)
   */
  public static async updatePrayer(
    prayerId: string,
    userId: string,
    updates: UpdatePrayerInput
  ): Promise<Prayer> {
    const db = PostgresService.getInstance();
    
    // Build dynamic SET clause
    const fields = Object.entries(updates).filter(([_, value]) => value !== undefined);
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    const setClauses = fields.map(([key, _], index) => {
      // Convert camelCase to snake_case
      const dbColumn = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      return `${dbColumn} = $${index + 1}`;
    });
    
    const values = fields.map(([_, value]) => value);
    values.push(prayerId, userId); // Add prayerId and userId as last parameters
    
    const query = `
      UPDATE prayers
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE id = $${values.length - 1}::uuid
        AND user_id = $${values.length}::uuid
      RETURNING id, user_id, title, text, category, is_template, play_count,
                last_played_at, flock_id, published_at, listen_count, voice_id, created_at, updated_at
    `;

    const { rows } = await db.query(query, values);

    if (!rows[0]) throw new NotFoundError('Prayer');
    return mapRowToPrayer(rows[0]);
  }

  /**
   * Hard delete a prayer (only if it belongs to user)
   */
  public static async deletePrayer(prayerId: string, userId: string): Promise<void> {
    const db = PostgresService.getInstance();
    
    const { rowCount } = await db.query(
      `DELETE FROM prayers
      WHERE id = $1::uuid
        AND user_id = $2::uuid`,
      [prayerId, userId]
    );
    
    if (rowCount === 0) {
      throw new NotFoundError('Prayer');
    }
  }

  /**
   * Increment play count and update last played timestamp
   */
  public static async recordPlayback(prayerId: string, userId: string): Promise<Prayer> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `UPDATE prayers
       SET play_count = play_count + 1,
           last_played_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND user_id = $2::uuid
       RETURNING id, user_id, title, text, category, is_template, play_count,
                 last_played_at, flock_id, published_at, listen_count, voice_id, created_at, updated_at`,
      [prayerId, userId]
    );
    
    if (!rows[0]) throw new NotFoundError('Prayer');
    return mapRowToPrayer(rows[0]);
  }

  /**
   * Get prayer templates (for the template library)
   */
  public static async getPrayerTemplates(): Promise<Prayer[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, user_id, title, text, category, is_template, play_count,
              last_played_at, flock_id, published_at, listen_count, voice_id, created_at, updated_at
       FROM prayers
       WHERE is_template = true
       ORDER BY category, title`
    );
    return rows.map(mapRowToPrayer);
  }

  /**
   * Count user's personal prayers (excludes flock prayers, for limit checking)
   */
  public static async countUserPrayers(userId: string): Promise<number> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT COUNT(*) as count
       FROM prayers
       WHERE user_id = $1::uuid`,
      [userId]
    );
    return parseInt(rows[0].count);
  }

  // ===========================
  // Flock Prayer Queries
  // ===========================

  /**
   * Get all prayers published by a leader to their flock
   */
  public static async getLeaderFlockPrayers(leaderUserId: string): Promise<Prayer[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT p.id, p.user_id, p.title, p.text, p.category, p.is_template, p.play_count,
              p.last_played_at, p.flock_id, p.published_at, p.listen_count,
              p.voice_id, p.created_at, p.updated_at,
              af.s3_url AS audio_url, af.provider AS audio_provider
       FROM prayers p
       LEFT JOIN audio_files af
         ON af.prayer_id = p.id
        AND af.voice_id  = p.voice_id
       WHERE p.user_id = $1::uuid
         AND p.flock_id IS NOT NULL
       ORDER BY p.published_at DESC`,
      [leaderUserId]
    );
    return Promise.all(rows.map(mapRowToPrayerWithAudio));
  }

  /**
   * Get the prayer feed for a flock member (all prayers from followed leaders)
   */
  public static async getMemberFeed(memberUserId: string): Promise<FlockPrayerWithLeader[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT p.id, p.user_id, p.title, p.text, p.category, p.is_template,
              p.play_count, p.last_played_at, p.flock_id, p.published_at,
              p.listen_count, p.voice_id, p.created_at, p.updated_at,
              u.name AS leader_name, f.name AS flock_name,
              af.s3_url AS audio_url, af.provider AS audio_provider
       FROM prayers p
       JOIN flocks f ON f.id = p.flock_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN audio_files af
         ON af.prayer_id = p.id
        AND af.voice_id  = p.voice_id
       WHERE p.flock_id IN (
         SELECT flock_id FROM flock_members WHERE member_user_id = $1::uuid
       )
       ORDER BY p.published_at DESC`,
      [memberUserId]
    );
    return Promise.all(rows.map(mapRowToFlockPrayerWithLeader));
  }

  /**
   * Get a single flock prayer by ID with leader info
   */
  public static async getFlockPrayerById(prayerId: string): Promise<FlockPrayerWithLeader | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT p.id, p.user_id, p.title, p.text, p.category, p.is_template,
              p.play_count, p.last_played_at, p.flock_id, p.published_at,
              p.listen_count, p.voice_id, p.created_at, p.updated_at,
              u.name AS leader_name, f.name AS flock_name,
              af.s3_url AS audio_url, af.provider AS audio_provider
       FROM prayers p
       JOIN flocks f ON f.id = p.flock_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN audio_files af
         ON af.prayer_id = p.id
        AND af.voice_id  = p.voice_id
       WHERE p.id = $1::uuid
         AND p.flock_id IS NOT NULL
       LIMIT 1`,
      [prayerId]
    );
    return rows[0] ? await mapRowToFlockPrayerWithLeader(rows[0]) : null;
  }

  /**
   * Record a listen on a flock prayer
   */
  public static async recordFlockListen(prayerId: string): Promise<Prayer> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `UPDATE prayers
       SET listen_count = listen_count + 1, updated_at = NOW()
       WHERE id = $1::uuid
         AND flock_id IS NOT NULL
       RETURNING id, user_id, title, text, category, is_template, play_count,
                 last_played_at, flock_id, published_at, listen_count, voice_id, created_at, updated_at`,
      [prayerId]
    );
    if (!rows[0]) throw new NotFoundError('Flock prayer');
    return mapRowToPrayer(rows[0]);
  }

  /**
   * Delete a flock prayer (leader only)
   */
  public static async deleteFlockPrayer(prayerId: string, leaderUserId: string): Promise<void> {
    const db = PostgresService.getInstance();
    const { rowCount } = await db.query(
      `DELETE FROM prayers
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND flock_id IS NOT NULL`,
      [prayerId, leaderUserId]
    );
    if (rowCount === 0) {
      throw new NotFoundError('Flock prayer');
    }
  }
}