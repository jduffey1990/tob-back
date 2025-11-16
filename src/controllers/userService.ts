// src/controllers/userService.ts
import { PostgresService } from './postgres.service';
import { User } from '../models/user';

// Expose a "safe" user for reads (no passwordHash)
export type UserSafe = Omit<User, 'passwordHash'>;

// Map db row -> UserSafe (snake_case -> camelCase)
function mapRowToUser(row: any): UserSafe {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    email: row.email,
    name: row.name,
    status: row.status,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, // node-postgres returns Date for timestamptz
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
      `SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );
    return rows.map(mapRowToUser);
  }

  /**
   * Get one user by id (safe).
   */
  public static async findUserById(id: string): Promise<UserSafe | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at
         FROM users
        WHERE id = $1::uuid
        LIMIT 1`,
      [id]
    );
    return rows[0] ? mapRowToUser(rows[0]) : null;
  }

  /**
   * Get one user by email (safe).
   */
  public static async findUserByEmail(email: string): Promise<UserSafe | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email]
    );
    return rows[0] ? mapRowToUser(rows[0]) : null;
  }

  /**
   * Create a user. Accept a passwordHash (already hashed with bcrypt/argon2).
   * UNIQUE(email) enforced in DB; we convert 23505 to your legacy duplicate message.
   */
  public static async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    companyId?: string | null;
    status?: string; // optional override
  }): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    const companyId = input.companyId ?? null;
    const status = input.status ?? 'active';

    try {
      const { rows } = await db.query(
        `INSERT INTO users (company_id, email, password_hash, name, status)
         VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`,
        [companyId, input.email, input.passwordHash, input.name, status]
      );
      return mapRowToUser(rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') {
        // Keeps your frontend logic unchanged
        throw new Error('duplicate key value violates unique constraint');
      }
      throw err;
    }
  }

  /**
   * Update user basic info by id (name + email).
   */
  /**
   * Update user fields dynamically - only updates fields that are provided
   */
  public static async updateUser(
    userId: string,
    updates: Partial<{
      name: string;
      email: string;
      status: string;
      companyId: string | null;
    }>
  ): Promise<UserSafe> {
    const db = PostgresService.getInstance();
    
    // Filter out undefined values (but keep null for companyId)
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
      RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at
    `;
    
    const { rows } = await db.query(query, values);
    
    if (!rows[0]) throw new Error('User not found');
    return mapRowToUser(rows[0]);
  }

  /** Flip user status to 'active' (only from 'inactive') and return the safe user. */
  public static async activateUser(userId: string) {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `UPDATE users
          SET status = 'active'
        WHERE id = $1::uuid
          AND status = 'inactive'
        RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`,
      [userId]
    );

    if (!rows[0]) {
      // Not found OR already active/disabled
      throw new Error('Activation failed: user not found or already active');
    }

    // reuse your existing row→safe mapper if exported
    return mapRowToUser(rows[0]);
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
        RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`,
      [userId]
    );
    if (!rows[0]) throw new Error('User not found');
    return mapRowToUser(rows[0]);
  }

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
   * Example: mark user paid based on Stripe PaymentIntent (idempotent pattern).
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
          RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`,
        [userId]
      );

      if (!rows[0]) throw new Error('User not found');
      return mapRowToUser(rows[0]);
    });
  }
}
