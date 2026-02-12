// src/controllers/userService.ts
import { PostgresService } from './postgres.service';
import { User, UserSettings, DEFAULT_USER_SETTINGS } from '../models/user';
import { S3Service } from './s3.service'

// Expose a "safe" user for reads (no passwordHash)
export type UserSafe = Omit<User, 'passwordHash'>;

// Map db row -> UserSafe (snake_case -> camelCase)
function mapRowToUserSafe(row: any): UserSafe {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    subscriptionTier: row.subscription_tier,
    subscriptionExpiresAt: row.subscription_expires_at ?? null,
    settings: row.settings ?? DEFAULT_USER_SETTINGS,
    denomination: row.denomination,  // NEW: Include denomination
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserService {
  /**
   * Get all users (safe).
   */
  public static async findAllUsers(): Promise<UserSafe[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, email, name, status, subscription_tier, subscription_expires_at,
              settings, denomination, deleted_at, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );
    return rows.map(mapRowToUserSafe);
  }

  /**
   * Get one user by id (safe).
   */
  public static async findUserById(id: string): Promise<UserSafe | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, email, name, status, subscription_tier, subscription_expires_at,
              settings, denomination, deleted_at, created_at, updated_at
         FROM users
        WHERE id = $1::uuid
        LIMIT 1`,
      [id]
    );
    return rows[0] ? mapRowToUserSafe(rows[0]) : null;
  }


  /**
   * Get one user by email (safe).
   */
  public static async findUserByEmail(email: string): Promise<UserSafe | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, email, name, status, subscription_tier, subscription_expires_at,
              settings, denomination, deleted_at, created_at, updated_at
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email]
    );
    return rows[0] ? mapRowToUserSafe(rows[0]) : null;
  }

  /**
   * Create a user. Accept a passwordHash (already hashed with bcrypt/argon2).
   * UNIQUE(email) enforced in DB; we convert 23505 to your legacy duplicate message.
   */
  public static async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    denomination: string;  // NEW: Optional denomination parameter
    status?: string;        // optional override
  }): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    const status = input.status ?? 'active';
    const denomination = input.denomination ?? 'Christian';  // NEW: Default to 'Christian'

    console.log("input", input)
    console.log("denomination: ", denomination)
    
    try {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, name, status, denomination)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                   settings, denomination, deleted_at, created_at, updated_at`,
        [input.email, input.passwordHash, input.name, status, denomination]
      );
      return mapRowToUserSafe(rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') {
        // Keeps your frontend logic unchanged
        throw new Error('duplicate key value violates unique constraint');
      }
      throw err;
    }
  }

  /**
   * Update user fields dynamically - only updates fields that are provided
   */
  public static async updateUser(
    userId: string, 
    updates: Partial<{
      email: string;
      name: string;
      status: string;
      subscriptionTier: string;
      subscriptionExpiresAt: Date | null;
      denomination: string;  // NEW: Allow denomination updates
    }>
  ): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    
    // Filter out undefined values (but keep null for subscriptionExpiresAt)
    const fields = Object.entries(updates).filter(([_, value]) => value !== undefined);
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    // Build dynamic SET clause
    const setClauses = fields.map(([key, _], index) => {
      // Convert camelCase to snake_case for DB columns
      const dbColumn = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      return `${dbColumn} = $${index + 1}`;
    });
    
    const values = fields.map(([_, value]) => value);
    values.push(userId); // Add userId as last parameter
    
    const query = `
      UPDATE users
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE id = $${values.length}::uuid
      RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                settings, denomination, deleted_at, created_at, updated_at
    `;
    
    const { rows } = await db.query(query, values);
    
    if (!rows[0]) throw new Error('User not found');
    
    return mapRowToUserSafe(rows[0]);
  }

  /**
   * NEW: Update user settings (voiceIndex, playbackRate)
   * Uses JSONB merge operator (||) to update only provided fields
   */
  public static async updateSettings(
    userId: string,
    settingsUpdate: Partial<UserSettings>
  ): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    
    // Validate voiceIndex if provided
    if (settingsUpdate.voiceIndex !== undefined) {
      if (settingsUpdate.voiceIndex < 0 || settingsUpdate.voiceIndex > 8) {
        throw new Error('voiceIndex must be between 0 and 8');
      }
    }
    
    // Validate playbackRate if provided
    if (settingsUpdate.playbackRate !== undefined) {
      if (settingsUpdate.playbackRate < 0 || settingsUpdate.playbackRate > 1) {
        throw new Error('playbackRate must be between 0 and 1');
      }
    }
    
    // Use JSONB merge operator to update only provided fields
    const { rows } = await db.query(
      `UPDATE users
       SET settings = settings || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2::uuid
       RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                 settings, denomination, deleted_at, created_at, updated_at`,
      [JSON.stringify(settingsUpdate), userId]
    );
    
    if (!rows[0]) throw new Error('User not found');
    
    return mapRowToUserSafe(rows[0]);
  }

  /** Flip user status to 'active' (only from 'inactive') and return the safe user. */
  public static async activateUser(userId: string) {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `UPDATE users
          SET status = 'active'
        WHERE id = $1::uuid
          AND status = 'inactive'
        RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                  settings, denomination, deleted_at, created_at, updated_at`,
      [userId]
    );

    if (!rows[0]) {
      // Not found OR already active/disabled
      throw new Error('Activation failed: user not found or already active');
    }

    return mapRowToUserSafe(rows[0]);
  }


/**
 * Get basic user info (for TTS tier checking)
 */
static async getUserInfo(userId: string): Promise<{
  id: string;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
}> {
  const db = PostgresService.getInstance();
  
  const result = await db.query(
    `SELECT id, subscription_tier, subscription_expires_at 
     FROM users 
     WHERE id = $1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }
  
  const row = result.rows[0];
  
  // Map snake_case to camelCase (following your project's pattern)
  return {
    id: row.id,
    subscriptionTier: row.subscription_tier,
    subscriptionExpiresAt: row.subscription_expires_at
  };
}

  /**
   * Soft delete (optional): set deleted_at; keep row for audit.
   */
  public static async softDelete(userId: string): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `UPDATE users
          SET deleted_at = NOW()
        WHERE id = $1::uuid
        RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                  settings, denomination, deleted_at, created_at, updated_at`,
      [userId]
    );
    if (!rows[0]) throw new Error('User not found');
    return mapRowToUserSafe(rows[0]);
  }

  /**
   * Hard delete users that have been soft-deleted for more than 30 days
   * Called by scheduled Lambda event daily
   */
  public static async cleanupOldDeletedUsers(): Promise<{ deletedCount: number }> {
    const db = PostgresService.getInstance();
    
    try {
      const { rows: usersToDelete } = await db.query(`
        SELECT id, email 
        FROM users 
        WHERE deleted_at IS NOT NULL 
          AND deleted_at < NOW() - INTERVAL '30 days'
      `);
      
      console.log(`Found ${usersToDelete.length} users to permanently delete`);
      
      for (const user of usersToDelete) {
        // NEW: Delete S3 audio files first
        const { rows: prayers } = await db.query(
          `SELECT id FROM prayers WHERE user_id = $1::uuid`,
          [user.id]
        );
        
        for (const prayer of prayers) {
          await S3Service.deleteAllAudioForPrayer(prayer.id);
        }
        
        // Then delete user (CASCADE handles DB)
        await db.query(`DELETE FROM users WHERE id = $1::uuid`, [user.id]);
        console.log(`Deleted user: ${user.email}`);
      }
      
      return { deletedCount: usersToDelete.length };
      
    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  }


  /**
   * Hard delete: actually remove the row from the database.
   */
  public static async hardDelete(userId: string): Promise<void> {
    const db = PostgresService.getInstance();
    
    // Actually DELETE the row (current code just soft deletes)
    const { rowCount } = await db.query(
      `DELETE FROM users WHERE id = $1::uuid`,
      [userId]
    );
    
    if (rowCount === 0) throw new Error('User not found');
    // No return needed since row is gone
  }

  /**
   * Update user's password (for password reset functionality)
   */
  public static async updatePassword(
    userId: string,
    newPasswordHash: string
  ): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    
    const { rows } = await db.query(
      `UPDATE users
      SET password_hash = $1,
          updated_at = NOW()
      WHERE id = $2::uuid
      RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                settings, denomination, deleted_at, created_at, updated_at`,
      [newPasswordHash, userId]
    );
    
    if (!rows[0]) throw new Error('User not found');
    return mapRowToUserSafe(rows[0]);
  }

  /**
   * Example: mark user paid based on Stripe PaymentIntent (idempotent pattern).
   * NOTE: This assumes you have a payments table - adjust as needed for your subscription system
   */
  public static async markUserPaidFromIntent(userId: string, paymentIntentId: string): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    return db.runInTransaction(async (tx) => {
      // Ensure a payments table with UNIQUE(payment_intent_id) exists
      await tx.query(
        `INSERT INTO payments (user_id, payment_intent_id, status)
         VALUES ($1::uuid, $2, 'succeeded')
         ON CONFLICT (payment_intent_id) DO NOTHING`,
        [userId, paymentIntentId]
      );

      const { rows } = await tx.query(
        `UPDATE users
            SET updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                    settings, denomination, deleted_at, created_at, updated_at`,
        [userId]
      );

      if (!rows[0]) throw new Error('User not found');
      return mapRowToUserSafe(rows[0]);
    });
  }
}