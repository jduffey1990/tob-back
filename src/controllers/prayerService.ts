// src/controllers/prayerService.ts
import { PostgresService } from './postgres.service';
import { Prayer, CreatePrayerInput, UpdatePrayerInput } from '../models/prayer';

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
              last_played_at, created_at, updated_at
       FROM prayers
       WHERE user_id = $1::uuid 
       ORDER BY created_at DESC`,
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
              last_played_at, created_at, updated_at
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
      `INSERT INTO prayers (user_id, title, text, category, is_template)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id, user_id, title, text, category, is_template, play_count,
                 last_played_at, created_at, updated_at`,
      [
        input.userId,
        input.title,
        input.text,
        input.category ?? null,
        input.isTemplate ?? false
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
                last_played_at, created_at, updated_at
    `;
    
    const { rows } = await db.query(query, values);
    
    if (!rows[0]) throw new Error('Prayer not found or unauthorized');
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
      throw new Error('Prayer not found');
    }
  }

  /**
   * Increment play count and update last played timestamp
   */
  public static async recordPlayback(prayerId: string, userId: string): Promise<Prayer> {
    const db = PostgresService.getInstance();

    console.log("look for this prayer", prayerId)
    console.log("look for this user", userId)
    const { rows } = await db.query(
      `UPDATE prayers
       SET play_count = play_count + 1,
           last_played_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid 
         AND user_id = $2::uuid
       RETURNING id, user_id, title, text, category, is_template, play_count,
                 last_played_at, created_at, updated_at`,
      [prayerId, userId]
    );
    
    if (!rows[0]) throw new Error('Prayer not found');
    return mapRowToPrayer(rows[0]);
  }

  /**
   * Get prayer templates (for the template library)
   */
  public static async getPrayerTemplates(): Promise<Prayer[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, user_id, title, text, category, is_template, play_count,
              last_played_at, created_at, updated_at
       FROM prayers
       WHERE is_template = true
       ORDER BY category, title`
    );
    return rows.map(mapRowToPrayer);
  }

  /**
   * Count user's active prayers (for limit checking)
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
}