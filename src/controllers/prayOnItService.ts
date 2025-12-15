// src/controllers/prayOnItService.ts
import { PostgresService } from './postgres.service';
import { 
  PrayOnItItem, 
  CreatePrayOnItItemInput, 
  UpdatePrayOnItItemInput 
} from '../models/prayOnItItem';

// Map db row -> PrayOnItItem (snake_case -> camelCase)
function mapRowToPrayOnItItem(row: any): PrayOnItItem {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    relationship: row.relationship ?? null,
    prayerFocus: row.prayer_focus ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PrayOnItService {
  /**
   * Get all pray-on-it items for a user (non-deleted)
   */
  public static async findUserItems(userId: string): Promise<PrayOnItItem[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, user_id, name, category, relationship, prayer_focus, notes,
              created_at, updated_at
       FROM pray_on_it_items
       WHERE user_id = $1::uuid 
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(mapRowToPrayOnItItem);
  }

  /**
   * Get a single pray-on-it item by ID (must belong to user)
   */
  public static async findItemById(
    itemId: string, 
    userId: string
  ): Promise<PrayOnItItem | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, user_id, name, category, relationship, prayer_focus, notes,
              created_at, updated_at
       FROM pray_on_it_items
       WHERE id = $1::uuid 
         AND user_id = $2::uuid
       LIMIT 1`,
      [itemId, userId]
    );
    return rows[0] ? mapRowToPrayOnItItem(rows[0]) : null;
  }

  /**
   * Count non-deleted items for a user
   */
  public static async countUserItems(userId: string): Promise<number> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT COUNT(*) as count
       FROM pray_on_it_items
       WHERE user_id = $1::uuid`,
      [userId]
    );
    return parseInt(rows[0].count, 10);
  }

  /**
   * Create a new pray-on-it item
   */
  public static async createItem(input: CreatePrayOnItItemInput): Promise<PrayOnItItem> {
    const db = PostgresService.getInstance();
    
    const { rows } = await db.query(
      `INSERT INTO pray_on_it_items (user_id, name, category, relationship, prayer_focus, notes)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       RETURNING id, user_id, name, category, relationship, prayer_focus, notes,
                 created_at, updated_at`,
      [
        input.userId,
        input.name,
        input.category,
        input.relationship ?? null,
        input.prayerFocus ?? null,
        input.notes ?? null,
      ]
    );
    
    return mapRowToPrayOnItItem(rows[0]);
  }

  /**
   * Update an existing pray-on-it item
   */
  public static async updateItem(
    itemId: string,
    userId: string,
    updates: UpdatePrayOnItItemInput
  ): Promise<PrayOnItItem> {
    const db = PostgresService.getInstance();
    
    // First verify ownership
    const existing = await this.findItemById(itemId, userId);
    if (!existing) {
      throw new Error('Pray On It item not found or unauthorized');
    }
    
    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.category !== undefined) {
      fields.push(`category = $${paramCount++}`);
      values.push(updates.category);
    }
    if (updates.relationship !== undefined) {
      fields.push(`relationship = $${paramCount++}`);
      values.push(updates.relationship);
    }
    if (updates.prayerFocus !== undefined) {
      fields.push(`prayer_focus = $${paramCount++}`);
      values.push(updates.prayerFocus);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(updates.notes);
    }
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(itemId, userId);
    
    const { rows } = await db.query(
      `UPDATE pray_on_it_items
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}::uuid
         AND user_id = $${paramCount + 1}::uuid
       RETURNING id, user_id, name, category, relationship, prayer_focus, notes,
                 created_at, updated_at`,
      values
    );
    
    if (!rows[0]) {
      throw new Error('Failed to update Pray On It item');
    }
    
    return mapRowToPrayOnItItem(rows[0]);
  }

  /**
   * hard delete a pray-on-it item
   */
  public static async deleteItem(itemId: string, userId: string): Promise<void> {
    const db = PostgresService.getInstance();
    
    const { rowCount } = await db.query(
      `DELETE FROM pray_on_it_items
       WHERE id = $1::uuid
         AND user_id = $2::uuid`,
      [itemId, userId]
    );
    
    if (rowCount === 0) {
      throw new Error('Pray On It item not found');
    }
  }
}